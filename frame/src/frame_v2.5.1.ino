#include "Config.h"
#include "Types.h"
#include "BackendApi.h"
#include "ScreenPairing.h"
#include "DeviceIdentity.h"
#include "WiFiManager.h"
#include "ProvisioningPortal.h"
#include "NetClient.h"
#include "FrameConfig.h"
#include "Layout.h"
#include "UpdateChecker.h"
#include "LiveUpdate.h"
#include "DisplayCore.h"
#include "Theme.h"
#include "TimeSync.h"
#include "BatteryManager.h"

// Modules
#include "ModuleDate.h"
#include "ModuleWeather.h"
#include "ModuleSurf.h"
#include "ModuleReminders.h"
#include "ModuleSoccer.h"
#include "ModuleStocks.h"
#include "FirmwareUpdater.h"

#include <WiFi.h>
#include <Preferences.h>
#include <time.h>
#include <esp_sleep.h>
#include <esp_wifi.h>
#include <inttypes.h>

// Change this string whenever you want to force one redraw after flashing/OTA
static const char* FW_VER = "v2.5.7";

// Public app page shown during pairing
static const char* APP_LOGIN_URL = "https://re-mind.no/login";

// Cheap live-update discovery wake. The normal full sync has its own RTC clock.
static const uint32_t PROBE_WAKE_SECONDS = 120;
static const uint64_t PROBE_WAKE_US = (uint64_t)PROBE_WAKE_SECONDS * 1000000ULL;
static const uint32_t NORMAL_SYNC_SECONDS = 900;
static const uint32_t INTERACTIVE_POLL_MS = 1500;

// 3 hours refresh: 12 * 15min = 180min
static const uint16_t WAKES_PER_REFRESH = 12;

// Survives ESP32 deep sleep, but intentionally resets on reset/power loss.
RTC_DATA_ATTR static uint32_t normalSyncElapsedSeconds = 0;

// Debug / power sense pin for PWR_SENS_E1 -> GPIO39
#ifndef PWR_SENSE_DEBUG_PIN
#define PWR_SENSE_DEBUG_PIN 39
#endif

// Keep one config globally to avoid stack overflow
static FrameConfig g_cfg;

// Only initialize the display if we actually need to draw
static bool g_displayReady = false;

enum SetupStep {
  SETUP_STEP_NONE = 0,
  SETUP_STEP_WIFI = 1,
  SETUP_STEP_PAIRING = 2
};

enum PairingResult {
  PAIRING_PAIRED = 0,
  PAIRING_EXPIRED = 1,
  PAIRING_FAILED = 2
};

struct PowerSenseDebug {
  int raw;
  int highCount;
  bool usbPresent;
  bool stable;
};

static void ensureDisplay() {
  if (!g_displayReady) {
    DisplayCore::begin();
    g_displayReady = true;
  }
}

static const uint64_t PWR_SENSE_WAKE_MASK = (1ULL << PWR_SENSE_DEBUG_PIN);


static bool isDeepSleepWake() {
  return esp_sleep_get_wakeup_cause() != ESP_SLEEP_WAKEUP_UNDEFINED;
}

static void recoverDisplayAfterShelfWake() {
  Serial.println("Shelf/setup wake detected — running display recovery refresh");
  ensureDisplay();

  auto& d = DisplayCore::get();
  d.setFullWindow();

  d.firstPage();
  do {
    d.fillScreen(GxEPD_BLACK);
  } while (d.nextPage());

  d.firstPage();
  do {
    d.fillScreen(GxEPD_WHITE);
  } while (d.nextPage());

  DisplayCore::forceNextFullRefresh(true);
  Serial.println("Display recovery refresh complete");
}


static bool enablePowerSenseWakeForNextSleep(bool currentlyUsbPresent) {
  // Confirmed signal:
  // HIGH = USB plugged in
  // LOW  = battery only
  //
  // So:
  // - on battery, wake when pin goes HIGH  (plug in)
  // - on USB,     wake when pin goes LOW   (unplug)

  esp_err_t err;
  if (currentlyUsbPresent) {
    err = esp_sleep_enable_ext1_wakeup_io(PWR_SENSE_WAKE_MASK, ESP_EXT1_WAKEUP_ALL_LOW);
    Serial.println("EXT1 target: wake on USB unplug (LOW)");
  } else {
    err = esp_sleep_enable_ext1_wakeup_io(PWR_SENSE_WAKE_MASK, ESP_EXT1_WAKEUP_ANY_HIGH);
    Serial.println("EXT1 target: wake on USB plug in (HIGH)");
  }

  if (err == ESP_OK) {
    Serial.println("✅ EXT1 wake enabled on power sense pin");
    return true;
  }

  Serial.print("⚠️ EXT1 wake enable failed: ");
  Serial.println((int)err);
  return false;
}

static void logWakeReason() {
  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();

  Serial.print("Wake reason: ");
  switch (cause) {
    case ESP_SLEEP_WAKEUP_TIMER:
      Serial.println("timer");
      break;
    case ESP_SLEEP_WAKEUP_EXT1:
      Serial.println("ext1");
      break;
    case ESP_SLEEP_WAKEUP_UNDEFINED:
      Serial.println("cold boot / reset");
      break;
    default:
      Serial.print("other(");
      Serial.print((int)cause);
      Serial.println(")");
      break;
  }

  if (cause == ESP_SLEEP_WAKEUP_EXT1) {
    uint64_t mask = esp_sleep_get_ext1_wakeup_status();
    Serial.print("EXT1 wake status mask: ");
    Serial.println((unsigned long)mask);
  }
}

static void goToSleepForUs(uint64_t us, bool usbPresent) {
  Serial.print("Sleeping ");
  Serial.print((unsigned long)(us / 1000000ULL));
  Serial.println(" seconds...");

  esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_ALL);
  esp_sleep_enable_timer_wakeup(us);
  enablePowerSenseWakeForNextSleep(usbPresent);

  esp_deep_sleep_start();
}

static void goToSleep(bool usbPresent) {
  Serial.println("LiveUpdate: sleep");
  goToSleepForUs(PROBE_WAKE_US, usbPresent);
}

static void goToShelfSleep(bool usbPresent) {
  Serial.println("Shelf sleep: timer disabled, waiting for power-sense wake if supported...");

  esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_ALL);
  enablePowerSenseWakeForNextSleep(usbPresent);

  esp_deep_sleep_start();
}

static void goToRechargeSleep(bool usbPresent) {
  Serial.println("Battery empty: timer disabled, waiting for USB power-sense wake...");

  esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_ALL);
  enablePowerSenseWakeForNextSleep(usbPresent);

  esp_deep_sleep_start();
}

static void resetTextStateForDashboard() {
  auto& d = DisplayCore::get();
  d.setTextSize(1);
  d.setFont(nullptr);
  d.setTextColor(Theme::ink());
}

static String getTodayLocalYmd() {
  struct tm tmNow;
  if (!getLocalTime(&tmNow)) return "";

  char buf[11];
  snprintf(
    buf,
    sizeof(buf),
    "%04d-%02d-%02d",
    tmNow.tm_year + 1900,
    tmNow.tm_mon + 1,
    tmNow.tm_mday
  );
  return String(buf);
}

static int getLocalHourNow() {
  struct tm tmNow;
  if (!getLocalTime(&tmNow)) return -1;
  return tmNow.tm_hour;
}

// --------------------------------------
// Power sense helpers
// --------------------------------------
static PowerSenseDebug readPowerSenseDebug() {
  pinMode(PWR_SENSE_DEBUG_PIN, INPUT);
  delay(5);

  PowerSenseDebug out{};
  out.raw = digitalRead(PWR_SENSE_DEBUG_PIN);

  int highCount = 0;
  const int samples = 10;
  for (int i = 0; i < samples; i++) {
    if (digitalRead(PWR_SENSE_DEBUG_PIN) == HIGH) highCount++;
    delay(10);
  }

  out.highCount = highCount;

  // Confirmed behavior:
  // HIGH while USB plugged in => USB present is active HIGH.
  // Use the sampled majority rather than the first raw read; a noisy edge or
  // floating PWR_SENS line otherwise looks like a USB toggle and forces a
  // redraw on every wake just to update the battery/charging overlay.
  out.usbPresent = (highCount >= 7);
  out.stable = (highCount <= 1 || highCount >= 9);

  return out;
}

static void logPowerSenseDebug(const BatteryState& batt, const PowerSenseDebug& pwr) {
  Serial.println();
  Serial.println("=== POWER DEBUG ===");

  Serial.print("battery_percent: ");
  Serial.println(batt.percent);

  Serial.print("battery_voltage: ");
  Serial.println(String(batt.smoothedVoltage, 3));

  Serial.print("battery_isCharging: ");
  Serial.println(batt.isCharging ? "true" : "false");

  Serial.print("battery_learned_full: ");
  Serial.println(String(BatteryManager::getLearnedFullVoltage(), 3));

  Serial.print("battery_full_samples: ");
  Serial.println(BatteryManager::getLearnedFullSampleCount());

  Serial.print("pwr_sense_pin: ");
  Serial.println(PWR_SENSE_DEBUG_PIN);

  Serial.print("pwr_sense_raw: ");
  Serial.println(pwr.raw);

  Serial.print("pwr_sense_stable: ");
  Serial.print(pwr.highCount);
  Serial.println("/10");

  Serial.print("pwr_sense_interpreted: ");
  if (pwr.highCount >= 9) {
    Serial.println("HIGH");
  } else if (pwr.highCount <= 1) {
    Serial.println("LOW");
  } else {
    Serial.println("UNSTABLE");
  }

  Serial.print("pwr_sense_is_stable: ");
  Serial.println(pwr.stable ? "true" : "false");

  Serial.print("is_usb_present: ");
  Serial.println(pwr.usbPresent ? "true" : "false");

  Serial.println("===================");
  Serial.println();
}

static void showRechargeAndSleep(const BatteryState& batt, const PowerSenseDebug& pwr) {
  Serial.println("🔋 Battery empty -> show recharge screen and skip Wi-Fi/backend work");
  logPowerSenseDebug(batt, pwr);

  Theme::set(THEME_DARK);
  ensureDisplay();
  DisplayCore::drawRechargeScreen();

  goToRechargeSleep(pwr.usbPresent);
}

// --------------------------------------
// Device status post (wake heartbeat)
// --------------------------------------
static void postDeviceStatus(
  const BatteryState& batt,
  const PowerSenseDebug& pwr,
  bool didRender
) {
  int code = 0;
  String body;

  String url = String(BASE_URL) + "/api/device/status";

  String json = "{";
  json += "\"device_id\":\"" + DeviceIdentity::getDeviceId() + "\",";
  json += "\"current_version\":\"" + String(FW_VER) + "\",";
  json += "\"battery_percent\":" + String(batt.percent) + ",";
  json += "\"battery_voltage\":" + String(batt.smoothedVoltage, 3) + ",";
  json += "\"is_charging\":" + String(batt.isCharging ? "true" : "false") + ",";
  json += "\"is_usb_present\":" + String(pwr.usbPresent ? "true" : "false") + ",";
  json += "\"pwr_sense_raw\":" + String(pwr.raw) + ",";
  json += "\"pwr_sense_stable\":" + String(pwr.highCount) + ",";
  json += "\"did_render\":" + String(didRender ? "true" : "false");
  json += "}";

  NetClient::httpPostAuthJson(
    url,
    DeviceIdentity::getToken(),
    json,
    code,
    body
  );

  Serial.print("Status report HTTP: ");
  Serial.println(code);
  Serial.print("status response bytes=");
  Serial.println(body.length());
}

static bool shouldRunOtaCheckNow() {
  int hourNow = getLocalHourNow();
  if (hourNow < 0) {
    Serial.println("⏭️ OTA check not due (local time unavailable)");
    return false;
  }

  if (hourNow < 2) {
    Serial.println("⏭️ OTA check not due (before 02:00)");
    return false;
  }

  String today = getTodayLocalYmd();
  if (today.length() == 0) {
    Serial.println("⏭️ OTA check not due (date unavailable)");
    return false;
  }

  Preferences prefs;
  prefs.begin("frame", false);
  String lastCheckDay = prefs.getString("ota_day", "");
  prefs.end();

  if (lastCheckDay == today) {
    Serial.println("⏭️ OTA check not due (already checked today)");
    return false;
  }

  return true;
}

static void markOtaCheckedToday() {
  String today = getTodayLocalYmd();
  if (today.length() == 0) return;

  Preferences prefs;
  prefs.begin("frame", false);
  prefs.putString("ota_day", today);
  prefs.end();
}

// --------------------------------------
// Pairing
// --------------------------------------
static PairingResult ensurePairedNoReboot(bool forceFreshPairCode = false) {
  if (DeviceIdentity::hasToken()) {
    Serial.println("✅ Token in flash -> paired");
    return PAIRING_PAIRED;
  }

  Serial.print("device_id: ");
  Serial.println(DeviceIdentity::getDeviceId());

  for (int i = 0; i < 5; i++) {
    PairStatusResponse st;
    bool ok = BackendApi::pairStatus(st);

    if (ok && st.paired) {
      if (st.device_token.length() > 0) {
        DeviceIdentity::saveToken(st.device_token);
      }

      if (DeviceIdentity::hasToken()) {
        return PAIRING_PAIRED;
      }
    }

    delay(500);
  }

  if (forceFreshPairCode) {
    Serial.println("🔁 Charger state changed during setup -> request fresh pairing code");
  }

  PairStartResponse startResp;
  if (!BackendApi::pairStart(startResp)) {
    return PAIRING_FAILED;
  }

  ensureDisplay();
  ScreenPairing::showPairCode(
    startResp.pair_code.c_str(),
    startResp.expires_in_sec,
    APP_LOGIN_URL
  );

  unsigned long maxPollMs =
    (startResp.expires_in_sec > 0)
      ? (unsigned long)(startResp.expires_in_sec + 20) * 1000UL
      : 5UL * 60UL * 1000UL;

  unsigned long t0 = millis();

  while ((millis() - t0) < maxPollMs) {
    delay(3000);

    PairStatusResponse poll;
    bool pollOk = BackendApi::pairStatus(poll);

    if (pollOk && poll.paired) {
      if (poll.device_token.length() > 0) {
        DeviceIdentity::saveToken(poll.device_token);
      }

      if (DeviceIdentity::hasToken()) {
        return PAIRING_PAIRED;
      }
    }
  }

  Serial.println("⌛ Pairing window expired without a claim; entering passive pairing shelf");
  return PAIRING_EXPIRED;
}

static void showPairingShelfAndSleep(bool usbPresent) {
  ensureDisplay();
  ScreenPairing::showPairingShelf();

  Preferences prefs;
  prefs.begin("frame", false);
  prefs.putBool("pair_shelf", true);
  prefs.end();

  goToShelfSleep(usbPresent);
}

static bool recoverPairingIfTokenLost(const char* reason, bool usbPresent) {
  if (DeviceIdentity::hasToken()) return false;

  Serial.print("🔐 Token lost: ");
  Serial.println(reason);

  PairingResult pairing = ensurePairedNoReboot();
  if (pairing == PAIRING_PAIRED) {
    delay(400);
    ESP.restart();
    return true;
  }

  if (pairing == PAIRING_EXPIRED) {
    showPairingShelfAndSleep(usbPresent);
    return true;
  }

  ensureDisplay();
  ScreenPairing::showError("Could not pair frame");
  goToSleep(usbPresent);
  return true;
}

static void runOtaCheckIfDue() {
  if (!shouldRunOtaCheckNow()) return;

  markOtaCheckedToday();

  FirmwareUpdater::begin(BASE_URL, FW_VER);
  FirmwareUpdater::requestCheckNow();
  FirmwareUpdater::loop();
}

static bool renderLoadedDashboard(const BatteryState& batt, const PowerSenseDebug& pwr) {
  ModuleDate::setConfig(&g_cfg);
  ModuleWeather::setConfig(&g_cfg);
  ModuleSurf::setConfig(&g_cfg);
  ModuleReminders::setConfig(&g_cfg);
  ModuleSoccer::setConfig(&g_cfg);
  ModuleStocks::setConfig(&g_cfg);
  ModuleReminders::preload();

  ensureDisplay();
  Theme::set(g_cfg.theme);
  resetTextStateForDashboard();

  // GxEPD2's paged update is synchronous: returning from drawWithContent means
  // the BUSY-controlled physical panel update has completed.
  Layout::drawWithContent(g_cfg.layout, g_cfg);
  postDeviceStatus(batt, pwr, true);
  return true;
}

static bool fetchAndRenderExplicit(
  const BatteryState& batt,
  const PowerSenseDebug& pwr,
  uint64_t revision
) {
  FrameConfigApi::FetchResult result =
    FrameConfigApi::fetchWithStatus(g_cfg, DeviceIdentity::getToken());
  if (result != FrameConfigApi::FETCH_OK) {
    Serial.printf("LiveUpdate: revision %" PRIu64 " frame fetch failed\n", revision);
    return false;
  }

  if (!renderLoadedDashboard(batt, pwr)) return false;
  LiveUpdate::saveRenderedAwaitingAck(revision);
  Serial.printf("LiveUpdate: revision %" PRIu64 " physically displayed\n", revision);
  return true;
}

static bool retryRenderedAck(uint64_t backendDisplayed) {
  uint64_t rendered = LiveUpdate::getRenderedAwaitingAck();
  if (rendered == 0) return true;
  if (backendDisplayed >= rendered) {
    LiveUpdate::clearRenderedAwaitingAckThrough(backendDisplayed);
    return true;
  }

  if (LiveUpdate::acknowledge(DeviceIdentity::getToken(), rendered)) {
    LiveUpdate::clearRenderedAwaitingAckThrough(rendered);
    Serial.printf("LiveUpdate: ACK %" PRIu64 " success\n", rendered);
    return true;
  }

  Serial.printf("LiveUpdate: ACK %" PRIu64 " failed, retrying without redraw\n", rendered);
  return false;
}

enum InteractiveModeResult {
  INTERACTIVE_FINISHED,
  INTERACTIVE_NORMAL_SYNC_DUE,
};

static InteractiveModeResult finishInteractiveMode(
  uint32_t startedAtMs,
  uint32_t baselineElapsedAtEntry,
  InteractiveModeResult result
) {
  const uint32_t awakeSeconds = (millis() - startedAtMs) / 1000U;
  normalSyncElapsedSeconds = baselineElapsedAtEntry + awakeSeconds;
  return result;
}

static void consumeNormalSyncPeriod() {
  if (normalSyncElapsedSeconds >= NORMAL_SYNC_SECONDS) {
    normalSyncElapsedSeconds -= NORMAL_SYNC_SECONDS;
  }
}

static InteractiveModeResult runInteractiveMode(
  const BatteryState& batt,
  const PowerSenseDebug& pwr,
  LiveUpdateState& state
) {
  Serial.println("LiveUpdate: entering interactive mode");
  WiFi.setSleep(true);
  esp_wifi_set_ps(WIFI_PS_MIN_MODEM);

  bool lastActive = state.appActive;
  uint64_t lastRequested = state.requestedRevision;
  uint64_t lastDisplayed = state.displayedRevision;
  uint8_t inactiveAckFailures = 0;
  uint8_t consecutiveProbeFailures = 0;
  uint32_t configRetryMs = INTERACTIVE_POLL_MS;
  const uint32_t interactiveStartedAtMs = millis();
  const uint32_t baselineElapsedAtEntry = normalSyncElapsedSeconds;

  while (WiFi.status() == WL_CONNECTED) {
    const uint32_t awakeSeconds = (millis() - interactiveStartedAtMs) / 1000U;
    if (baselineElapsedAtEntry + awakeSeconds >= NORMAL_SYNC_SECONDS) {
      Serial.println("LiveUpdate: normal sync became due while interactive");
      // Carry the freshest revision state into the baseline path. A failure is
      // non-blocking: the normal sync is already due and must not be postponed.
      LiveUpdateState deadlineState{};
      if (LiveUpdate::probe(DeviceIdentity::getToken(), deadlineState)) {
        state = deadlineState;
      }
      return finishInteractiveMode(
        interactiveStartedAtMs,
        baselineElapsedAtEntry,
        INTERACTIVE_NORMAL_SYNC_DUE
      );
    }
    uint64_t awaitingAck = LiveUpdate::getRenderedAwaitingAck();
    if (retryRenderedAck(state.displayedRevision)) {
      inactiveAckFailures = 0;
      if (awaitingAck > state.displayedRevision) state.displayedRevision = awaitingAck;
    } else if (!state.appActive && ++inactiveAckFailures >= 3) {
      Serial.println("LiveUpdate: deferring ACK retry to next probe wake");
      return finishInteractiveMode(interactiveStartedAtMs, baselineElapsedAtEntry, INTERACTIVE_FINISHED);
    }

    uint64_t rendered = LiveUpdate::getRenderedAwaitingAck();
    if (state.requestedRevision > state.displayedRevision &&
        state.requestedRevision > rendered) {
      const uint64_t revisionToDisplay = state.requestedRevision;
      Serial.printf("LiveUpdate: revision %" PRIu64 " pending\n", revisionToDisplay);
      if (!fetchAndRenderExplicit(batt, pwr, revisionToDisplay)) {
        // The revision remains pending. Stay interactive and retry with a
        // bounded backoff rather than turning one transient fetch into sleep.
        delay(configRetryMs);
        configRetryMs = min<uint32_t>(configRetryMs * 2, 5000);
      } else {
        configRetryMs = INTERACTIVE_POLL_MS;
        if (retryRenderedAck(state.displayedRevision)) {
          state.displayedRevision = revisionToDisplay;
        } else if (!state.appActive) {
          inactiveAckFailures++;
        }
      }
    }

    rendered = LiveUpdate::getRenderedAwaitingAck();
    if (!state.appActive &&
        state.requestedRevision <= state.displayedRevision &&
        rendered == 0) {
      Serial.println("LiveUpdate: activity expired");
      return finishInteractiveMode(interactiveStartedAtMs, baselineElapsedAtEntry, INTERACTIVE_FINISHED);
    }

    delay(INTERACTIVE_POLL_MS);
    LiveUpdateState next{};
    if (!LiveUpdate::probe(DeviceIdentity::getToken(), next)) {
      consecutiveProbeFailures++;
      Serial.printf("LiveUpdate: interactive probe failed (%u/3)\n", consecutiveProbeFailures);
      if (consecutiveProbeFailures >= 3) {
        return finishInteractiveMode(interactiveStartedAtMs, baselineElapsedAtEntry, INTERACTIVE_FINISHED);
      }
      continue;
    }
    consecutiveProbeFailures = 0;

    if (next.appActive != lastActive ||
        next.requestedRevision != lastRequested ||
        next.displayedRevision != lastDisplayed) {
      Serial.printf(
        "LiveUpdate: probe active=%d requested=%" PRIu64 " displayed=%" PRIu64 "\n",
        next.appActive, next.requestedRevision, next.displayedRevision
      );
      lastActive = next.appActive;
      lastRequested = next.requestedRevision;
      lastDisplayed = next.displayedRevision;
    }
    state = next;
  }
  return finishInteractiveMode(interactiveStartedAtMs, baselineElapsedAtEntry, INTERACTIVE_FINISHED);
}

// --------------------------------------
// Setup
// --------------------------------------
void setup() {
  Serial.begin(115200);
  delay(200);

  logWakeReason();

  DeviceIdentity::begin();
  WiFiManagerV2::begin();
  UpdateChecker::begin();
  BatteryManager::begin();

  PowerSenseDebug pwrEarly = readPowerSenseDebug();
  BatteryState battEarly = BatteryManager::readAndUpdate(pwrEarly.usbPresent);
  BatteryManager::logState("early", battEarly);
  const bool hadPreviousUsbState = UpdateChecker::hasLastUsbPresent();
  const bool previousUsbPresent = hadPreviousUsbState ? UpdateChecker::getLastUsbPresent() : pwrEarly.usbPresent;
  bool dummyHadPrevious = false;
  const bool chargerStateChanged = UpdateChecker::detectAndPersistUsbStateChange(
    pwrEarly.usbPresent,
    pwrEarly.stable,
    dummyHadPrevious
  );
  if (chargerStateChanged) {
    Serial.print("🔄 Forced redraw/restart reason: charger_state_changed (prev=");
    Serial.print(previousUsbPresent ? "plugged" : "battery");
    Serial.print(", now=");
    Serial.print(pwrEarly.usbPresent ? "plugged" : "battery");
    Serial.println(")");
  }

  const esp_sleep_wakeup_cause_t wakeCause = esp_sleep_get_wakeup_cause();
  if (wakeCause == ESP_SLEEP_WAKEUP_TIMER) {
    normalSyncElapsedSeconds += PROBE_WAKE_SECONDS;
  }
  bool normalSyncDue =
    wakeCause != ESP_SLEEP_WAKEUP_TIMER ||
    normalSyncElapsedSeconds >= NORMAL_SYNC_SECONDS ||
    chargerStateChanged;
  if (normalSyncDue) {
    if (normalSyncElapsedSeconds >= NORMAL_SYNC_SECONDS) {
      normalSyncElapsedSeconds -= NORMAL_SYNC_SECONDS;
    } else {
      normalSyncElapsedSeconds = 0;
    }
    Serial.println("LiveUpdate: normal sync due");
  }


  Serial.print("device_id: ");
  Serial.println(DeviceIdentity::getDeviceId());

  if (battEarly.requiresRecharge) {
    showRechargeAndSleep(battEarly, pwrEarly);
    return;
  }

  {
    bool hasWifi = WiFiManagerV2::hasCreds();
    bool hasToken = DeviceIdentity::hasToken();

    Preferences prefs;
    prefs.begin("frame", false);
    bool shelfDone = prefs.getBool("shelf_done", false);
    bool shelfPendingDisconnect = prefs.getBool("shelf_pending_disconnect", false);

    bool needsSetupRecovery =
      isDeepSleepWake() &&
      (
        !hasWifi ||
        !hasToken ||
        !shelfDone ||
        shelfPendingDisconnect
      );

    if (needsSetupRecovery) {
      recoverDisplayAfterShelfWake();
    }

    if (hasWifi || hasToken) {
      if (shelfPendingDisconnect) prefs.putBool("shelf_pending_disconnect", false);
    } else if (!shelfDone) {
      if (!pwrEarly.usbPresent) {
        Serial.println("Shelf screen ready: USB is disconnected");
        Theme::set(THEME_DARK);
        ensureDisplay();
        DisplayCore::drawShelfScreen(DeviceIdentity::getDeviceId());
        prefs.putBool("shelf_done", true);
        prefs.putBool("shelf_pending_disconnect", false);
        prefs.end();
        goToShelfSleep(pwrEarly.usbPresent);
        return;
      }

      if (!shelfPendingDisconnect) {
        Serial.println("Shelf screen pending: waiting for USB disconnect after first upload");
        prefs.putBool("shelf_pending_disconnect", true);
      }
      prefs.end();
      goToShelfSleep(pwrEarly.usbPresent);
      return;
    }

    prefs.end();
  }

  {
    Preferences prefs;
    prefs.begin("frame", false);
    bool pairingShelf = prefs.getBool("pair_shelf", false);
    if (pairingShelf && !DeviceIdentity::hasToken() && isDeepSleepWake() && !pwrEarly.usbPresent) {
      Serial.println("Pairing shelf wake without charger reconnect -> stay passive");
      prefs.end();
      showPairingShelfAndSleep(pwrEarly.usbPresent);
      return;
    }
    if (pairingShelf) prefs.putBool("pair_shelf", false);
    prefs.end();
  }

  bool reconnectedViaProvisioning = false;
  bool setupFlowRefreshByCharger = false;
  SetupStep activeSetupStep = SETUP_STEP_NONE;
  const bool isCompletingWifiSetup =
    WiFiManagerV2::hasCreds() && !DeviceIdentity::hasToken();
  if (!WiFiManagerV2::connectSaved(12000)) {
    if (!normalSyncDue && WiFiManagerV2::hasCreds() && DeviceIdentity::hasToken()) {
      Serial.println("LiveUpdate: Wi-Fi unavailable on probe wake");
      goToSleep(pwrEarly.usbPresent);
      return;
    }
    activeSetupStep = SETUP_STEP_WIFI;
    if (chargerStateChanged) {
      Serial.println("🔄 Charger change on Wi-Fi setup screen -> restart Wi-Fi setup flow and redraw");
      setupFlowRefreshByCharger = true;
    }
    ensureDisplay();
    ProvisioningPortal::runBlocking();
    reconnectedViaProvisioning = true;
  }

  if (isCompletingWifiSetup) {
    ensureDisplay();
    ScreenPairing::showWifiConnected();
  }

  TimeSync::ensure(8000);

  activeSetupStep = SETUP_STEP_PAIRING;
  PairingResult pairing = ensurePairedNoReboot(chargerStateChanged);
  if (pairing != PAIRING_PAIRED) {
    if (pairing == PAIRING_EXPIRED) {
      showPairingShelfAndSleep(pwrEarly.usbPresent);
      return;
    }

    ensureDisplay();
    ScreenPairing::showError("Could not pair frame");
    goToSleep(pwrEarly.usbPresent);
    return;
  }

  activeSetupStep = SETUP_STEP_NONE;

  LiveUpdateState liveState{};
  const bool liveProbeOk = LiveUpdate::probe(DeviceIdentity::getToken(), liveState);
  if (liveProbeOk) {
    Serial.printf(
      "LiveUpdate: probe active=%d requested=%" PRIu64 " displayed=%" PRIu64 "\n",
      liveState.appActive, liveState.requestedRevision, liveState.displayedRevision
    );
    uint64_t awaitingAck = LiveUpdate::getRenderedAwaitingAck();
    if (retryRenderedAck(liveState.displayedRevision) &&
        awaitingAck > liveState.displayedRevision) {
      liveState.displayedRevision = awaitingAck;
    }
  } else {
    Serial.println("LiveUpdate: probe failed");
  }

  const uint64_t locallyRendered = LiveUpdate::getRenderedAwaitingAck();
  bool explicitRevisionPending =
    liveProbeOk &&
    liveState.requestedRevision > liveState.displayedRevision &&
    liveState.requestedRevision > locallyRendered;

  if (!normalSyncDue && !explicitRevisionPending && !(liveProbeOk && liveState.appActive)) {
    goToSleep(pwrEarly.usbPresent);
    return;
  }

run_normal_sync:
  explicitRevisionPending =
    liveProbeOk &&
    liveState.requestedRevision > liveState.displayedRevision &&
    liveState.requestedRevision > LiveUpdate::getRenderedAwaitingAck();

  // Only full scheduled checks advance the legacy 12-wake (three-hour)
  // physical-refresh counter. Two-minute probe wakes never touch it.
  if (normalSyncDue) UpdateChecker::noteWake();

  // ---------------- Battery / Power sense ----------------
  PowerSenseDebug pwr = readPowerSenseDebug();
  BatteryState batt = BatteryManager::readAndUpdate(pwr.usbPresent);

  BatteryManager::logState("post-wifi-pair", batt);
  logPowerSenseDebug(batt, pwr);
  DisplayCore::setBatteryStatus(batt.percent, batt.isCharging, pwr.usbPresent);

  if (!normalSyncDue) {
    if (runInteractiveMode(batt, pwr, liveState) == INTERACTIVE_NORMAL_SYNC_DUE) {
      consumeNormalSyncPeriod();
      normalSyncDue = true;
      goto run_normal_sync;
    }
    goToSleep(pwr.usbPresent);
    return;
  }

  if (normalSyncDue) runOtaCheckIfDue();

  String updatedAt;
  String reminderSig;
  String surfSig;

  const int lastBatteryPercent = UpdateChecker::getLastBatteryPercent();
  const bool usbChanged = chargerStateChanged;

  bool batteryJumpChanged = false;
  if (lastBatteryPercent >= 0) {
    int diff = batt.percent - lastBatteryPercent;
    if (diff >= 10 || diff <= -10) batteryJumpChanged = true;
  }

  bool forceFw =
    UpdateChecker::shouldForceRedrawForFirmware(FW_VER);

  bool forcePeriodic =
    UpdateChecker::shouldForcePeriodicRefresh(WAKES_PER_REFRESH);

  bool configChanged =
    UpdateChecker::hasConfigChanged(
      DeviceIdentity::getToken(),
      updatedAt
    );

  if (recoverPairingIfTokenLost("config-meta check", pwr.usbPresent)) return;

  FrameConfigApi::FetchResult cfgResult =
    FrameConfigApi::fetchWithStatus(
      g_cfg,
      DeviceIdentity::getToken()
    );

  bool cfgOk = cfgResult == FrameConfigApi::FETCH_OK;

  if (cfgResult == FrameConfigApi::FETCH_UNPAIRED) {
    if (recoverPairingIfTokenLost("frame-config unpaired", pwr.usbPresent)) return;
  }

  if (!cfgOk) {
    if (recoverPairingIfTokenLost("frame-config precheck", pwr.usbPresent)) return;
  }

  bool remindersChanged = false;
  bool surfChanged = false;

  if (cfgOk) {
    remindersChanged =
      UpdateChecker::hasRemindersChanged(
        DeviceIdentity::getToken(),
        reminderSig
      );

    if (recoverPairingIfTokenLost("reminders signature check", pwr.usbPresent)) return;

    surfChanged =
      UpdateChecker::hasSurfChanged(
        g_cfg,
        DeviceIdentity::getToken(),
        surfSig
      );

    if (recoverPairingIfTokenLost("surf signature check", pwr.usbPresent)) return;
  }

  if (usbChanged) {
    Serial.println("🔌 USB state changed -> force redraw");
    if (activeSetupStep == SETUP_STEP_WIFI) {
      Serial.println("   ↳ setup screen refresh target: wifi_setup");
    } else if (activeSetupStep == SETUP_STEP_PAIRING) {
      Serial.println("   ↳ setup screen refresh target: pairing_code");
    }
  }

  if (batteryJumpChanged) {
    Serial.println("🔋 Battery changed by >= 10% -> force redraw");
  }

  if (reconnectedViaProvisioning) {
    Serial.println("📶 Reconnected after provisioning -> force redraw");
  }

  bool shouldRender =
    forceFw ||
    forcePeriodic ||
    configChanged ||
    remindersChanged ||
    surfChanged ||
    usbChanged ||
    batteryJumpChanged ||
    reconnectedViaProvisioning ||
    setupFlowRefreshByCharger ||
    explicitRevisionPending;

  // ---------------- No redraw ----------------
  if (!shouldRender) {
    Serial.println("😴 No change -> keep current ePaper image");

    postDeviceStatus(batt, pwr, false);
    UpdateChecker::saveBatteryPercent(batt.percent);
    if (liveProbeOk && liveState.appActive) {
      if (runInteractiveMode(batt, pwr, liveState) == INTERACTIVE_NORMAL_SYNC_DUE) {
        consumeNormalSyncPeriod();
        goto run_normal_sync;
      }
    }
    goToSleep(pwr.usbPresent);
    return;
  }

  // ---------------- Redraw ----------------
  if (!cfgOk) {
    FrameConfigApi::FetchResult retryResult = FrameConfigApi::fetchWithStatus(g_cfg, DeviceIdentity::getToken());
    if (retryResult != FrameConfigApi::FETCH_OK) {
      if (retryResult == FrameConfigApi::FETCH_UNPAIRED) {
        if (recoverPairingIfTokenLost("frame-config unpaired retry", pwr.usbPresent)) return;
      }
      if (recoverPairingIfTokenLost("frame-config fetch", pwr.usbPresent)) return;

      ensureDisplay();
      ScreenPairing::showError("Could not load frame");
      goToSleep(pwr.usbPresent);
      return;
    }
  }

  if (usbChanged) {
    DisplayCore::forceNextFullRefresh(true);
  }

  if (!renderLoadedDashboard(batt, pwr)) {
    goToSleep(pwr.usbPresent);
    return;
  }

  // A scheduled render fetched the latest frame state, so it also physically
  // satisfies the revision observed by the wake probe.
  if (liveProbeOk && liveState.requestedRevision > liveState.displayedRevision) {
    LiveUpdate::saveRenderedAwaitingAck(liveState.requestedRevision);
    Serial.printf(
      "LiveUpdate: revision %" PRIu64 " physically displayed by normal sync\n",
      liveState.requestedRevision
    );
    if (retryRenderedAck(liveState.displayedRevision)) {
      liveState.displayedRevision = liveState.requestedRevision;
    }
  }

  UpdateChecker::saveApplied(updatedAt);
  if (reminderSig.length() > 0) UpdateChecker::saveReminderSig(reminderSig);
  if (surfSig.length() > 0) UpdateChecker::saveSurfSig(surfSig);
  UpdateChecker::saveFirmwareVersion(FW_VER);
  UpdateChecker::saveBatteryPercent(batt.percent);

  if (forcePeriodic) {
    UpdateChecker::resetWakeCounter();
  }

  Serial.println("✅ Applied");
  if (liveProbeOk && liveState.appActive) {
    if (runInteractiveMode(batt, pwr, liveState) == INTERACTIVE_NORMAL_SYNC_DUE) {
      consumeNormalSyncPeriod();
      goto run_normal_sync;
    }
  }
  goToSleep(pwr.usbPresent);
}

void loop() {}
