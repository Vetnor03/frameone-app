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

#include <Preferences.h>
#include <time.h>
#include <esp_sleep.h>

// Change this string whenever you want to force one redraw after flashing/OTA
static const char* FW_VER = "v2.5.2";

// Public app page shown during pairing
static const char* APP_LOGIN_URL = "https://re-mind.no/login";

// 15 minutes quick check
static const uint64_t QUICK_WAKE_US = 900ULL * 1000000ULL;

// While plugged in, check every 5 minutes
static const uint64_t PLUGGED_WAKE_US = 300ULL * 1000000ULL;

// 3 hours refresh: 12 * 15min = 180min
static const uint16_t WAKES_PER_REFRESH = 12;

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
  goToSleepForUs(usbPresent ? PLUGGED_WAKE_US : QUICK_WAKE_US, usbPresent);
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
  Serial.println(body);
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

  UpdateChecker::noteWake();

  bool reconnectedViaProvisioning = false;
  bool setupFlowRefreshByCharger = false;
  SetupStep activeSetupStep = SETUP_STEP_NONE;
  if (!WiFiManagerV2::connectSaved(12000)) {
    activeSetupStep = SETUP_STEP_WIFI;
    if (chargerStateChanged) {
      Serial.println("🔄 Charger change on Wi-Fi setup screen -> restart Wi-Fi setup flow and redraw");
      setupFlowRefreshByCharger = true;
    }
    ensureDisplay();
    ProvisioningPortal::runBlocking();
    reconnectedViaProvisioning = true;
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

  // ---------------- Battery / Power sense ----------------
  PowerSenseDebug pwr = readPowerSenseDebug();
  BatteryState batt = BatteryManager::readAndUpdate(pwr.usbPresent);

  BatteryManager::logState("post-wifi-pair", batt);
  logPowerSenseDebug(batt, pwr);
  DisplayCore::setBatteryStatus(batt.percent, batt.isCharging, pwr.usbPresent);

  runOtaCheckIfDue();

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
    setupFlowRefreshByCharger;

  // ---------------- No redraw ----------------
  if (!shouldRender) {
    Serial.println("😴 No change -> keep current ePaper image");

    postDeviceStatus(batt, pwr, false);
    UpdateChecker::saveBatteryPercent(batt.percent);
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

  Layout::drawWithContent(g_cfg.layout, g_cfg);

  postDeviceStatus(batt, pwr, true);

  UpdateChecker::saveApplied(updatedAt);
  if (reminderSig.length() > 0) UpdateChecker::saveReminderSig(reminderSig);
  if (surfSig.length() > 0) UpdateChecker::saveSurfSig(surfSig);
  UpdateChecker::saveFirmwareVersion(FW_VER);
  UpdateChecker::saveBatteryPercent(batt.percent);

  if (forcePeriodic) {
    UpdateChecker::resetWakeCounter();
  }

  Serial.println("✅ Applied");
  goToSleep(pwr.usbPresent);
}

void loop() {}
