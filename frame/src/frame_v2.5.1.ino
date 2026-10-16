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
#include "MqttPushPilot.h"
#include "DisplayCore.h"
#include "Theme.h"
#include "TimeSync.h"
#include "BatteryManager.h"
#include "HardwareProfile.h"
#include "SmartRefresh.h"
#if TEMP_REFRESH_AUDIT_ENABLED
#include "TempRefreshAudit.h" // TEMP_REFRESH_AUDIT temporary instrumentation
#endif

// Modules
#include "ModuleDate.h"
#include "ModuleWeather.h"
#include "ModuleSurf.h"
#include "ModuleReminders.h"
#include "ModuleNews.h"
#include "ModuleSoccer.h"
#include "ModuleStocks.h"
#include "FirmwareUpdater.h"

#include <WiFi.h>
#include <Preferences.h>
#include <time.h>
#include <esp_sleep.h>
#include <esp_wifi.h>
#include <driver/gpio.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <inttypes.h>
#include <new>
#include <utility>

// Change this string whenever you want to force one redraw after flashing/OTA
static const char* FW_VER = "v2.7.2";

// Public app page shown during pairing
static const char* APP_LOGIN_URL = "https://re-mind.no/login";

// Both modes schedule background content exclusively from module deadlines.
// Instant mode additionally polls ONLY the explicit app Update command every
// 10 s. Unchanged command state never fetches content or touches e-paper.
// On battery, use connected automatic light sleep where available; otherwise
// discover app commands with 10 s deep-sleep wake-ups.
static const uint32_t MANUAL_UPDATE_POLL_MS = 10000;
static const uint32_t MANUAL_RENDER_RETRY_START_MS = 1000;
// While MQTT is subscribed, a missed QoS0 publish previously waited up to
// 15 minutes. Recover with a bounded 2-minute HTTPS safety probe; the normal
// disconnected path retains its 10-second cadence.
static const uint32_t MQTT_MISSED_HINT_RECOVERY_MS = 120000UL;
static const uint32_t REALTIME_FAILURE_BACKOFF_MS = 5000;

// Survives ESP32 deep sleep, but intentionally resets on reset/power loss.
RTC_DATA_ATTR static time_t g_nextScheduledWake = 0;
RTC_DATA_ATTR static time_t g_revisionRetryNotBefore = 0;
// Power Save is retained across timer wakes so the frame can choose the correct
// wake policy before making any routine network request.
RTC_DATA_ATTR static bool g_powerSaverMode = false;
// Retained across dynamically scheduled deep-sleep wake cycles. A cold boot may redraw
// once, but ordinary setup-pending probes never refresh unchanged e-paper.
RTC_DATA_ATTR static bool setupPendingScreenDisplayed = false;

// Hardware-specific USB source indication.
#if defined(FRAME_IS_ALFRED_V1_2)
static constexpr int POWER_SENSE_PIN = HardwareProfile::kPgoodN;
#else
static constexpr int POWER_SENSE_PIN = HardwareProfile::kPowerSense;
#endif

// Keep one config globally to avoid stack overflow
static FrameConfig g_cfg;
static SmartRenderState g_smartState;
RTC_DATA_ATTR static time_t g_revisionCheckedAt = 0;

// Only initialize the display if we actually need to draw
static bool g_displayReady = false;
static bool g_dashboardLoaded = false;
static bool g_powerRefreshPending = false;
static bool g_lastEvaluationDrew = false;
// One-shot, in-memory timing only during explicit manual updates.
static ManualUpdateTimings g_manualTiming{};
static bool g_captureManualRenderTimings = false;
static uint32_t g_manualTimingAttempts = 0;
// Set only after an MQTT hint causes a successful authenticated revision probe.
static uint64_t g_mqttHintVerifiedRevision = 0;
static uint64_t g_mqttResyncVerifiedRevision = 0;


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

enum InteractiveModeResult {
  INTERACTIVE_FINISHED,
  INTERACTIVE_NORMAL_SYNC_DUE,
};

struct PowerSenseDebug {
  int raw;
  int highCount;
  bool usbPresent;
  bool stable;
};

// USB power temporarily overrides the selected Power Save setting. Unplugging
// returns to scheduled deep sleep without changing the setting in the app.
static bool interactiveModeEnabled(bool usbPresent) {
  return usbPresent || !g_powerSaverMode;
}

static void setPowerSaverMode(bool enabled) {
  if (g_powerSaverMode == enabled) return;
  g_powerSaverMode = enabled;

  const time_t now = time(nullptr);
  if (now >= 1000000000 && g_smartState.moduleCount > 0) {
    g_nextScheduledWake = now + SmartRefresh::secondsUntilNextWake(
      g_smartState, now, g_revisionCheckedAt, false, false);
  }

  Serial.println(g_powerSaverMode
    ? "Power mode: Power Saver selected (USB overrides sleep)"
    : "Power mode: Normal (persistent Wi-Fi + live updates)");
}

#if defined(FRAME_IS_ALFRED_V1_2)
// While battery ALS is active, PGOOD_N must wake the blocked interactive task
// immediately when USB is inserted. Otherwise Windows can attempt enumeration
// while the S3 USB PHY is still clock-gated in light sleep.
static TaskHandle_t g_interactiveWaitTask = nullptr;

static void IRAM_ATTR onInteractiveUsbPowerEdge() {
  BaseType_t higherPriorityTaskWoken = pdFALSE;
  TaskHandle_t task = g_interactiveWaitTask;
  if (task != nullptr) {
    vTaskNotifyGiveFromISR(task, &higherPriorityTaskWoken);
    if (higherPriorityTaskWoken == pdTRUE) portYIELD_FROM_ISR();
  }
}

static bool waitForBatteryIdleCadenceOrUsbConnect(uint32_t waitMs) {
  g_interactiveWaitTask = xTaskGetCurrentTaskHandle();
  ulTaskNotifyTake(pdTRUE, 0);  // discard any stale edge notification

  pinMode(POWER_SENSE_PIN, INPUT);
  attachInterrupt(
    digitalPinToInterrupt(POWER_SENSE_PIN),
    onInteractiveUsbPowerEdge,
    FALLING
  );

  const esp_err_t gpioWakeErr =
    gpio_wakeup_enable((gpio_num_t)POWER_SENSE_PIN, GPIO_INTR_LOW_LEVEL);
  const esp_err_t sleepWakeErr =
    gpioWakeErr == ESP_OK ? esp_sleep_enable_gpio_wakeup() : gpioWakeErr;

  bool usbConnected = digitalRead(POWER_SENSE_PIN) == LOW;

  // Close the race where USB was inserted between the main power sample and
  // arming the falling-edge interrupt. A task notification makes the 10-second
  // idle wait abort immediately on the PGOOD_N falling edge.
  if (!usbConnected &&
      gpioWakeErr == ESP_OK &&
      sleepWakeErr == ESP_OK) {
    usbConnected =
      ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(waitMs)) > 0;
    if (!usbConnected) usbConnected = digitalRead(POWER_SENSE_PIN) == LOW;
  } else if (!usbConnected) {
    // Wake-source setup is only a USB-enumeration aid; preserve the proven
    // 10-second battery cadence if it is unavailable.
    delay(waitMs);
    usbConnected = digitalRead(POWER_SENSE_PIN) == LOW;
  }

  // Important: do this here, immediately after the PGOOD_N wake, instead of
  // waiting for the next loop's ~100 ms debounced power sample. Windows starts
  // USB enumeration as soon as VBUS is present; leaving automatic light sleep
  // enabled during that debounce window can make the S3 USB PHY miss the first
  // descriptor requests and appear as "USB device not recognized".
  if (usbConnected) {
    WiFiManagerV2::applyOperationalPowerPolicy(true, true);
  }

  gpio_wakeup_disable((gpio_num_t)POWER_SENSE_PIN);
  detachInterrupt(digitalPinToInterrupt(POWER_SENSE_PIN));
  g_interactiveWaitTask = nullptr;
  return usbConnected;
}
#endif

static bool scheduledSyncDueNow() {
  const time_t now = time(nullptr);
  return g_nextScheduledWake > 0 && now >= 1000000000 && now >= g_nextScheduledWake;
}

static uint32_t interactiveWaitMs(uint32_t maximumMs) {
  const time_t now = time(nullptr);
  if (g_nextScheduledWake <= 0 || now < 1000000000 || g_nextScheduledWake <= now) {
    return g_nextScheduledWake > 0 && now >= g_nextScheduledWake ? 0 : maximumMs;
  }

  const uint64_t untilScheduledMs =
    (uint64_t)(g_nextScheduledWake - now) * 1000ULL;
  return untilScheduledMs < maximumMs
    ? (uint32_t)untilScheduledMs
    : maximumMs;
}

static bool waitForInteractiveCadence(bool usbPresent, uint32_t maximumMs) {
  const uint32_t waitMs = interactiveWaitMs(maximumMs);
  if (waitMs == 0) return false;

  if (usbPresent) {
    delay(waitMs);
    return false;
  }
#if defined(FRAME_IS_ALFRED_V1_2)
  return waitForBatteryIdleCadenceOrUsbConnect(waitMs);
#else
  delay(waitMs);
  return false;
#endif
}


static void ensureDisplay() {
  if (!g_displayReady) {
    DisplayCore::begin();
    g_displayReady = true;
  }
}

static void shutdownDisplay() {
#if defined(FRAME_IS_ALFRED_V1_2)
  DisplayCore::end();
  g_displayReady = false;
#endif
}
static void prepareDisplayForSleep() {
  shutdownDisplay();
  if (!DisplayCore::prepareForDeepSleep()) {
    Serial.println("EPD_PWR is not safely held LOW; deep sleep cancelled");
    while (true) delay(1000);
  }
}

static const uint64_t PWR_SENSE_WAKE_MASK = (1ULL << POWER_SENSE_PIN);


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
  shutdownDisplay();
  Serial.println("Display recovery refresh complete");
}


static bool enablePowerSenseWakeForNextSleep(bool currentlyUsbPresent) {
  esp_err_t err;
#if defined(FRAME_IS_ALFRED_V1_2)
  // GPIO17 is an ESP32-S3 RTC-capable pin. PGOOD_N is LOW with USB present.
  if (currentlyUsbPresent) {
    err = esp_sleep_enable_ext1_wakeup(PWR_SENSE_WAKE_MASK, ESP_EXT1_WAKEUP_ANY_HIGH);
    Serial.println("EXT1 target: wake on USB unplug (PGOOD_N HIGH)");
  } else {
    err = esp_sleep_enable_ext1_wakeup(PWR_SENSE_WAKE_MASK, ESP_EXT1_WAKEUP_ANY_LOW);
    Serial.println("EXT1 target: wake on USB plug in (PGOOD_N LOW)");
  }
#else
  if (currentlyUsbPresent) {
    err = esp_sleep_enable_ext1_wakeup(PWR_SENSE_WAKE_MASK, ESP_EXT1_WAKEUP_ALL_LOW);
    Serial.println("EXT1 target: wake on USB unplug (LOW)");
  } else {
    err = esp_sleep_enable_ext1_wakeup(PWR_SENSE_WAKE_MASK, ESP_EXT1_WAKEUP_ANY_HIGH);
    Serial.println("EXT1 target: wake on USB plug in (HIGH)");
  }
#endif

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

  prepareDisplayForSleep();
  esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_ALL);
  esp_sleep_enable_timer_wakeup(us);
  enablePowerSenseWakeForNextSleep(usbPresent);

  esp_deep_sleep_start();
}

static uint64_t nextDeepSleepDurationUs() {
  const time_t now = time(nullptr);
  const time_t checkedAt = g_revisionCheckedAt > 0 ? g_revisionCheckedAt : now;
  uint32_t seconds = SmartRefresh::secondsUntilNextWake(
    g_smartState, now, checkedAt, false, false);
  if (seconds <= 1 && g_revisionRetryNotBefore > now)
    seconds = (uint32_t)(g_revisionRetryNotBefore - now);
  // Invalid/unset wall time or scheduler state falls back to the revision
  // Invalid-clock/bootstrap fallback only, never a periodic content check.
  if (now < 1000000000 || seconds == 0) seconds = SmartRefresh::REVISION_SAFETY_SECONDS;
  // Connected light sleep is preferred. The deep-sleep fallback still wakes
  // for manual commands within 10 seconds, without scheduling content work.
  if (!g_powerSaverMode && seconds > SmartRefresh::MANUAL_PROBE_SECONDS)
    seconds = SmartRefresh::MANUAL_PROBE_SECONDS;
  return (uint64_t)seconds * 1000000ULL;
}

static void goToSleep(bool usbPresent) {
  // A fully sleeping radio cannot see a cloud manual-update request. Alfred's
  // connected/light-sleep path retains fast polling; true deep sleep wakes only
  // for the combined module/revision deadline or the independent EXT1 event.
  Serial.println(g_powerSaverMode
    ? "Power Saver: sleeping until next scheduled deadline"
    : "LiveUpdate: dynamic deep sleep");
  const uint64_t durationUs = nextDeepSleepDurationUs();
  goToSleepForUs(durationUs, usbPresent);
}

static void goToShelfSleep(bool usbPresent) {
  Serial.println("Shelf sleep: timer disabled, waiting for power-sense wake if supported...");

  prepareDisplayForSleep();
  esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_ALL);
  enablePowerSenseWakeForNextSleep(usbPresent);

  esp_deep_sleep_start();
}

static void goToRechargeSleep(bool usbPresent) {
  Serial.println("Battery empty: timer disabled, waiting for USB power-sense wake...");

  prepareDisplayForSleep();
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
  pinMode(POWER_SENSE_PIN, INPUT);
  delay(5);

  PowerSenseDebug out{};
  out.raw = digitalRead(POWER_SENSE_PIN);

  int highCount = 0;
  const int samples = 10;
  for (int i = 0; i < samples; i++) {
    if (digitalRead(POWER_SENSE_PIN) == HIGH) highCount++;
    delay(10);
  }

  out.highCount = highCount;

  // Use a sampled majority. Alfred PGOOD_N is active LOW; the classic
  // PWR_SENS input remains active HIGH.
#if defined(FRAME_IS_ALFRED_V1_2)
  out.usbPresent = (highCount < 3);  // BQ_PGOOD_N is active LOW.
#else
  out.usbPresent = (highCount >= 7);
#endif
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
  Serial.println(POWER_SENSE_PIN);

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
  shutdownDisplay();

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
  if (batt.percent < 0) {
    Serial.println("Device status skipped: no valid battery sample");
    return;
  }

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
  json += "\"power_mode\":\"" + String(g_powerSaverMode && !pwr.usbPresent ? "power_saver_deep_sleep" : WiFiManagerV2::operationalPowerMode()) + "\",";
  const esp_sleep_wakeup_cause_t statusWakeCause = esp_sleep_get_wakeup_cause();
  const char* statusWakeReason =
    statusWakeCause == ESP_SLEEP_WAKEUP_TIMER ? "timer" :
    statusWakeCause == ESP_SLEEP_WAKEUP_EXT1 ? "ext1" :
    statusWakeCause == ESP_SLEEP_WAKEUP_UNDEFINED ? "cold_boot" : "other";
  json += "\"wake_reason\":\"" + String(statusWakeReason) + "\",";
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
  shutdownDisplay();

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
  shutdownDisplay();

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
  shutdownDisplay();
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
  DisplayCore::setBatteryStatus(batt.percent, batt.isCharging, pwr.usbPresent);
  const uint32_t renderStartedAtMs = millis();
  ModuleDate::setConfig(&g_cfg);
  ModuleWeather::setConfig(&g_cfg);
  ModuleSurf::setConfig(&g_cfg);
  ModuleReminders::setConfig(&g_cfg);
  ModuleNews::setConfig(&g_cfg);
  ModuleSoccer::setConfig(&g_cfg);
  ModuleStocks::setConfig(&g_cfg);
  const uint8_t reminderProfiles = Layout::reminderProfileMask(g_cfg.layout, g_cfg);
  ModuleReminders::setRequiredProfiles(reminderProfiles);
  const SlotModule* activeAssignments = g_cfg.layout == LAYOUT_CUSTOM && g_cfg.customLayout.renderable
    ? g_cfg.customLayout.assigns : g_cfg.assigns;
  const int activeAssignmentCount = g_cfg.layout == LAYOUT_CUSTOM && g_cfg.customLayout.renderable
    ? g_cfg.customLayout.assignCount : g_cfg.assignCount;
  bool remindersActive = reminderProfiles != 0;
  for (int i = 0; i < activeAssignmentCount; ++i) {
    if (strncmp(activeAssignments[i].module, "reminders", 9) == 0) { remindersActive = true; break; }
  }
  const uint32_t remindersPreloadStartedAtMs = millis();
  if (remindersActive) ModuleReminders::preload();
  const uint32_t remindersPreloadMs = millis() - remindersPreloadStartedAtMs;
  if (g_captureManualRenderTimings) g_manualTiming.remindersPreloadMs = remindersPreloadMs;
  Serial.printf("Render timing reminders_preload_ms=%lu active=%u\n",
    (unsigned long)remindersPreloadMs, remindersActive ? 1U : 0U);

  bool newsActive = false;
  for (int i = 0; i < activeAssignmentCount; ++i) {
    if (strcmp(activeAssignments[i].module, "news") == 0) { newsActive = true; break; }
  }
  const uint32_t newsPreloadStartedAtMs = millis();
  if (newsActive) ModuleNews::preload();
  const uint32_t newsPreloadMs = millis() - newsPreloadStartedAtMs;
  if (g_captureManualRenderTimings) g_manualTiming.newsPreloadMs = newsPreloadMs;
  Serial.printf("Render timing news_preload_ms=%lu active=%u\n",
    (unsigned long)newsPreloadMs, newsActive ? 1U : 0U);

  uint8_t soccerAssignments = 0;
  const uint32_t soccerPreloadStartedAtMs = millis();
  for (int i = 0; i < activeAssignmentCount; ++i) {
    if (strncmp(activeAssignments[i].module, "soccer", 6) != 0) continue;
    ModuleSoccer::preload(String(activeAssignments[i].module));
    soccerAssignments++;
  }
  const uint32_t soccerPreloadMs = millis() - soccerPreloadStartedAtMs;
  if (g_captureManualRenderTimings) g_manualTiming.soccerPreloadMs = soccerPreloadMs;
  Serial.printf("Render timing soccer_preload_ms=%lu active_assignments=%u\n",
    (unsigned long)soccerPreloadMs, (unsigned int)soccerAssignments);

  ensureDisplay();
  Theme::set(g_cfg.theme);
  resetTextStateForDashboard();

  // GxEPD2's paged update is synchronous: returning from drawWithContent means
  // the BUSY-controlled physical panel update has completed.
  const uint32_t displayStartedAtMs = millis();
  Layout::drawWithContent(g_cfg.layout, g_cfg);
  shutdownDisplay();
  g_dashboardLoaded = true;
  g_powerRefreshPending = false;
  if (g_captureManualRenderTimings) {
    g_manualTiming.displayMs = millis() - displayStartedAtMs;
    g_manualTiming.renderTotalMs = millis() - renderStartedAtMs;
  }
  Serial.printf(
    "Render timing epaper_and_composition_ms=%lu\n",
    (unsigned long)(millis() - displayStartedAtMs)
  );
  Serial.printf(
    "Render timing total_ms=%lu\n",
    (unsigned long)(millis() - renderStartedAtMs)
  );
  Serial.printf("LiveUpdate timing display_update_ms=%lu\n",
    (unsigned long)(millis() - displayStartedAtMs));
  Serial.printf("LiveUpdate timing render_total_ms=%lu\n",
    (unsigned long)(millis() - renderStartedAtMs));
  return true;
}

static bool renderSmartDashboard(const BatteryState& batt, const PowerSenseDebug& pwr,
                                 const SmartRenderState& desired, const SmartDisplayPlan& plan) {
  g_lastEvaluationDrew = plan.type != SmartDisplayPlan::NONE;
  if (plan.type == SmartDisplayPlan::NONE) return true;

  // A full render already performs all module setup/preload inside
  // renderLoadedDashboard(). Do not prepare modules here first: doing so clears
  // and refetches module caches a second time (notably Reminders).
  if (plan.type == SmartDisplayPlan::FULL) {
    const bool success = renderLoadedDashboard(batt, pwr);
    if (success) SmartRefresh::commitSuccessfulDisplay(desired, plan);
    return success;
  }

  DisplayCore::setBatteryStatus(batt.percent, batt.isCharging, pwr.usbPresent);
  ModuleDate::setConfig(&g_cfg); ModuleWeather::setConfig(&g_cfg); ModuleSurf::setConfig(&g_cfg);
  ModuleReminders::setConfig(&g_cfg); ModuleNews::setConfig(&g_cfg); ModuleSoccer::setConfig(&g_cfg); ModuleStocks::setConfig(&g_cfg);
  ModuleReminders::setRequiredProfiles(Layout::reminderProfileMask(g_cfg.layout, g_cfg));
  bool remindersDirty = false;
  bool newsDirty = false;
  for (uint8_t i = 0; i < desired.moduleCount; ++i) {
    if (!plan.dirty[i]) continue;
    if (desired.modules[i].key == "reminders") remindersDirty = true;
    if (desired.modules[i].key == "news") newsDirty = true;
  }
  if (remindersDirty) ModuleReminders::preload();
  if (newsDirty) ModuleNews::preload();
  ensureDisplay(); Theme::set(g_cfg.theme); resetTextStateForDashboard();

  bool success = true;
  for (uint8_t i = 0; i < plan.regionCount && success; ++i)
    success = Layout::drawRegionWithContent(g_cfg.layout, g_cfg, plan.regions[i], false);
  shutdownDisplay();

  // Never publish hashes/counters until every synchronous panel operation has completed.
  if (success) SmartRefresh::commitSuccessfulDisplay(desired, plan);
  return success;
}

static uint64_t explicitTimingRevision = 0;
static uint32_t explicitTimingStartedAtMs = 0;
static uint32_t explicitRevisionObservedAtMs = 0;

// The worker owns NetClient's shared HTTPS session while the loop task
// exclusively owns the e-paper/SPI and currently displayed g_cfg. All results
// are staged until the task notification joins both operations.
struct ManualUpdatePrefetch {
  FrameConfig stagedConfig{};
  SmartRenderState desired{};
  String token;
  TaskHandle_t waiter = nullptr;
  FrameConfigApi::FetchResult configResult = FrameConfigApi::FETCH_ERROR;
  bool renderStateOk = false;
  uint32_t configMs = 0;
  uint32_t renderStateMs = 0;
  uint32_t totalMs = 0;
};

static void manualUpdatePrefetchTask(void* arg) {
  ManualUpdatePrefetch* job = static_cast<ManualUpdatePrefetch*>(arg);
  const uint32_t startedAt = millis();
  const uint32_t configStartedAt = millis();
  job->configResult = FrameConfigApi::fetchWithStatus(job->stagedConfig, job->token);
  job->configMs = millis() - configStartedAt;
  if (job->configResult == FrameConfigApi::FETCH_OK) {
    const uint32_t renderStartedAt = millis();
    job->renderStateOk = SmartRefresh::fetchRenderState(job->token, "all", job->desired);
    job->renderStateMs = millis() - renderStartedAt;
  }
  job->totalMs = millis() - startedAt;
  // No job/network data is touched after this join notification.
  xTaskNotifyGive(job->waiter);
  vTaskDelete(nullptr);
}

static bool fetchAndRenderExplicit(
  const BatteryState& batt,
  const PowerSenseDebug& pwr,
  uint64_t revision
) {
  if (explicitTimingRevision != revision) g_manualTimingAttempts = 0;
  explicitTimingRevision = revision;
  explicitTimingStartedAtMs = millis();
  g_manualTiming = ManualUpdateTimings{};
  g_manualTiming.attempts = ++g_manualTimingAttempts;
  g_manualTiming.probeToPendingMs = explicitRevisionObservedAtMs
    ? explicitTimingStartedAtMs - explicitRevisionObservedAtMs : 0;
  g_manualTiming.mqttSubscribed = MqttPushPilot::connected() ? 1 : 0;
  g_manualTiming.mqttHintReceived = g_mqttHintVerifiedRevision == revision ? 1 : 0;
  g_manualTiming.mqttSubscriptionResync = g_mqttResyncVerifiedRevision == revision ? 1 : 0;
  Serial.printf(
    "LiveUpdate timing probe_to_pending_ms=%lu\n",
    (unsigned long)g_manualTiming.probeToPendingMs
  );
  // Start authenticated HTTPS fetch before drawing the physical Updating
  // feedback. A short-lived worker isolates g_cfg and the shared HTTP session.
  // If task/heap allocation fails, retain the existing sequential fallback.
  ManualUpdatePrefetch* prefetch = new (std::nothrow) ManualUpdatePrefetch();
  bool parallelFetch = false;
  if (prefetch) {
    prefetch->token = DeviceIdentity::getToken();
    prefetch->waiter = xTaskGetCurrentTaskHandle();
    TaskHandle_t workerTask = nullptr;
    parallelFetch = xTaskCreatePinnedToCore(
      manualUpdatePrefetchTask, "manual-fetch", 16384,
      prefetch, 1, &workerTask, 0) == pdPASS;
    if (!parallelFetch) {
      delete prefetch;
      prefetch = nullptr;
      Serial.println("LiveUpdate: worker unavailable; sequential fallback");
    }
  } else {
    Serial.println("LiveUpdate: no worker memory; sequential fallback");
  }

  // The user must still see the Updating screen as immediate physical feedback.
  if (interactiveModeEnabled(pwr.usbPresent)) {
    ensureDisplay();
    Theme::set(g_cfg.theme);
    DisplayCore::drawUpdatingScreen();
    shutdownDisplay();
    Serial.println("LiveUpdate: Updating screen displayed");
  }
  g_manualTiming.updatingScreenMs = millis() - explicitTimingStartedAtMs;
  g_manualTiming.parallelFetch = parallelFetch ? 1 : 0;

  SmartRenderState desired;
  FrameConfigApi::FetchResult result = FrameConfigApi::FETCH_ERROR;
  bool renderStateOk = false;
  if (parallelFetch) {
    const uint32_t waitStartedAtMs = millis();
    // Do not abandon a running worker; it owns NetClient until the join.
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    g_manualTiming.fetchWaitMs = millis() - waitStartedAtMs;
    g_manualTiming.configFetchMs = prefetch->configMs;
    g_manualTiming.renderStateFetchMs = prefetch->renderStateMs;
    result = prefetch->configResult;
    renderStateOk = prefetch->renderStateOk;
    if (result == FrameConfigApi::FETCH_OK && renderStateOk) {
      g_cfg = prefetch->stagedConfig;
      desired = std::move(prefetch->desired);
    }
    Serial.printf(
      "LiveUpdate: parallel fetch total_ms=%lu after_feedback_wait_ms=%lu\n",
      (unsigned long)prefetch->totalMs,
      (unsigned long)g_manualTiming.fetchWaitMs);
    delete prefetch;
  } else {
    const uint32_t startedAt = millis();
    result = FrameConfigApi::fetchWithStatus(g_cfg, DeviceIdentity::getToken());
    g_manualTiming.configFetchMs = millis() - startedAt;
    if (result == FrameConfigApi::FETCH_OK) {
      const uint32_t renderStartedAt = millis();
      renderStateOk = SmartRefresh::fetchRenderState(
        DeviceIdentity::getToken(), "all", desired);
      g_manualTiming.renderStateFetchMs = millis() - renderStartedAt;
    }
  }
  Serial.printf(
    "LiveUpdate timing config_fetch_ms=%lu render_state_fetch_ms=%lu\n",
    (unsigned long)g_manualTiming.configFetchMs,
    (unsigned long)g_manualTiming.renderStateFetchMs);
  if (result != FrameConfigApi::FETCH_OK) {
    Serial.printf("LiveUpdate: revision %" PRIu64 " frame fetch failed\n", revision);
    return false;
  }
  if (!renderStateOk) return false;
  setupPendingScreenDisplayed = false;
  SmartDisplayPlan displayPlan = SmartRefresh::plan(desired, false);

  // The app's Update button is an explicit user request for the freshest
  // visible values. Background hashes intentionally ignore insignificant
  // Weather/Surf jitter, but manual Update must bypass that suppression and
  // perform one screen-wide render with the latest fetched source values.
  displayPlan.type = SmartDisplayPlan::FULL;
  displayPlan.regionCount = 1;
  displayPlan.regions[0] = Cell{0, 0, 800, 480, 0, 0, 0, 4, 4, CELL_XL};
#if TEMP_REFRESH_AUDIT_ENABLED
  const uint64_t TEMP_REFRESH_AUDIT_backendBefore = SmartRefresh::displayedRevision();
  const String TEMP_REFRESH_AUDIT_previous = SmartRefresh::TEMP_REFRESH_AUDIT_physicalRenderHash(desired);
#endif
  // New servers deliver the exact News titles with their render hash, so
  // preload must NOT refetch a different snapshot. Older servers keep the
  // previous on-demand source request as a compatibility fallback.
  if (!desired.newsSnapshotReady) ModuleNews::invalidate();
  g_captureManualRenderTimings = true;
  const bool rendered = renderSmartDashboard(batt, pwr, desired, displayPlan);
  g_captureManualRenderTimings = false;
  const uint32_t postRenderStartedAtMs = millis();
#if TEMP_REFRESH_AUDIT_ENABLED
  TempRefreshAudit::TEMP_REFRESH_AUDIT_record("manual_refresh", "all", desired,
    TEMP_REFRESH_AUDIT_previous, displayPlan, rendered, TEMP_REFRESH_AUDIT_backendBefore,
    revision, batt, pwr.usbPresent, "interactive", FW_VER);
  // TEMP_REFRESH_AUDIT manual work is an explicit opportunity to drain a batch.
  TempRefreshAudit::TEMP_REFRESH_AUDIT_flushPiggyback(DeviceIdentity::getToken(), true);
#endif
  if (!rendered) return false;
  // The manual display used cached Surf data. Keep any earlier Surf source
  // deadline rather than pretending the manual redraw refreshed the forecast.
  SmartRefresh::preserveManualSurfFreshness(g_smartState, desired);
  SmartRefresh::mergeScheduler(g_smartState, desired, true);
  g_revisionCheckedAt = time(nullptr);
  g_nextScheduledWake = g_revisionCheckedAt + SmartRefresh::secondsUntilNextWake(
    g_smartState, g_revisionCheckedAt, g_revisionCheckedAt, false, false);
  SmartRefresh::saveScheduler(g_smartState, g_revisionCheckedAt);
  ContentRevisionState contentRevision;
  if (SmartRefresh::probeRevision(DeviceIdentity::getToken(), SmartRefresh::displayedRevision(), contentRevision))
    SmartRefresh::saveDisplayedRevision(contentRevision.revision);
  LiveUpdate::saveRenderedAwaitingAck(revision);
  // A successful physical render also satisfies the one-time renderer-version
  // maintenance redraw, even if its revision ACK needs a network retry.
  UpdateChecker::saveFirmwareVersion(FW_VER);
  g_manualTiming.postRenderMs = millis() - postRenderStartedAtMs;
  g_manualTiming.ready = true;
  Serial.printf("LiveUpdate: revision %" PRIu64 " evaluated; display=%s\n", revision,
                g_lastEvaluationDrew ? "updated" : "unchanged");
  return true;
}

static bool refreshContentSignatureBestEffort() {
  String renderedSignature;
  if (UpdateChecker::fetchContentSignature(DeviceIdentity::getToken(), renderedSignature)) {
    UpdateChecker::saveContentSignature(renderedSignature);
    return true;
  } else {
    Serial.println("LiveUpdate: rendered content signature could not be persisted");
    return false;
  }
}

static bool retryRenderedAck(uint64_t backendDisplayed) {
  uint64_t rendered = LiveUpdate::getRenderedAwaitingAck();
  if (rendered == 0) return true;
  if (backendDisplayed >= rendered) {
    LiveUpdate::clearRenderedAwaitingAckThrough(backendDisplayed);
    return true;
  }

  const uint32_t ackStartedAtMs = millis();
  const bool reportManualTiming = rendered == explicitTimingRevision && g_manualTiming.ready;
  if (reportManualTiming) g_manualTiming.beforeAckMs = ackStartedAtMs - explicitTimingStartedAtMs;
  if (LiveUpdate::acknowledge(DeviceIdentity::getToken(), rendered,
                              reportManualTiming ? &g_manualTiming : nullptr)) {
    LiveUpdate::clearRenderedAwaitingAckThrough(rendered);
    Serial.printf("LiveUpdate: ACK %" PRIu64 " success\n", rendered);
    if (rendered == explicitTimingRevision) {
      Serial.printf(
        "LiveUpdate timing ack_ms=%lu\n",
        (unsigned long)(millis() - ackStartedAtMs)
      );
      Serial.printf(
        "LiveUpdate timing total_ms=%lu\n",
        (unsigned long)(millis() - explicitTimingStartedAtMs)
      );
      explicitTimingRevision = 0;
      g_manualTiming.ready = false;
    }
    return true;
  }

  Serial.printf("LiveUpdate: ACK %" PRIu64 " failed, retrying without redraw\n", rendered);
  return false;
}

static void runFirmwareMaintenanceIfNeeded(
  const BatteryState& batt,
  const PowerSenseDebug& pwr
) {
  if (!UpdateChecker::shouldForceRedrawForFirmware(FW_VER)) return;

  // This endpoint reads the committed device_settings row. Browser drafts are
  // local-only and therefore cannot participate in this boot maintenance pass.
  FrameConfigApi::FetchResult result =
    FrameConfigApi::fetchWithStatus(g_cfg, DeviceIdentity::getToken());
  if (result != FrameConfigApi::FETCH_OK) {
    Serial.println("Renderer maintenance config unavailable; will retry next boot");
    return;
  }

  DisplayCore::forceNextFullRefresh(true);
  const bool maintenanceRendered = renderLoadedDashboard(batt, pwr);
#if TEMP_REFRESH_AUDIT_ENABLED
  TempRefreshAudit::TEMP_REFRESH_AUDIT_recordIntentionalRefresh(
    "firmware_maintenance", "Intentional full refresh after renderer version change",
    maintenanceRendered, batt, pwr.usbPresent, "startup", FW_VER);
  TempRefreshAudit::TEMP_REFRESH_AUDIT_flushPiggyback(DeviceIdentity::getToken(), pwr.usbPresent);
#endif
  if (!maintenanceRendered) return;
  UpdateChecker::saveFirmwareVersion(FW_VER);
  postDeviceStatus(batt, pwr, true);
  refreshContentSignatureBestEffort();
  Serial.println("Renderer version changed; maintenance redraw complete");
}

static void deferFailedScheduledRefresh(const char* reason) {
  // Transient server outages must not repeatedly wake a battery-powered frame.
  // This changes only failed-request retries, not module deadlines or redraws.
  const uint32_t retrySeconds = g_powerSaverMode ? 30UL * 60UL : 60UL;
  g_revisionRetryNotBefore = time(nullptr) + retrySeconds;
  g_nextScheduledWake = g_revisionRetryNotBefore;
  Serial.printf("SmartRefresh: %s; retry in %lu seconds\n", reason, (unsigned long)retrySeconds);
}

// Plugging or unplugging the charger is also the user's physical display-reset
// gesture. Always perform a full-screen dashboard refresh: never partial-update
// a power edge, and never let it advance the normal content-check clock.
// An actual full render clears the pending flag in renderLoadedDashboard.
static void refreshPowerOverlayIfNeeded(const BatteryState& batt, const PowerSenseDebug& pwr) {
  if (!g_powerRefreshPending) return;
  if (!g_dashboardLoaded) {
    if (FrameConfigApi::fetchWithStatus(g_cfg, DeviceIdentity::getToken()) !=
        FrameConfigApi::FETCH_OK) return;
  }
  DisplayCore::forceNextFullRefresh(true);
  const bool powerRendered = renderLoadedDashboard(batt, pwr);
#if TEMP_REFRESH_AUDIT_ENABLED
  TempRefreshAudit::TEMP_REFRESH_AUDIT_recordIntentionalRefresh(
    pwr.usbPresent ? "charger_connected" : "charger_disconnected",
    "Intentional full refresh for local battery/USB overlay and display reset gesture",
    powerRendered, batt, pwr.usbPresent, "charger_edge", FW_VER);
  // TEMP_REFRESH_AUDIT USB may drain immediately; battery retains records until
  // the normal threshold without delaying this operational path.
  TempRefreshAudit::TEMP_REFRESH_AUDIT_flushPiggyback(DeviceIdentity::getToken(), pwr.usbPresent);
#endif
  if (powerRendered) {
    postDeviceStatus(batt, pwr, true);
    Serial.println("Power state change: full-screen dashboard reset refresh complete");
  }
}

static InteractiveModeResult runInteractiveMode(
  BatteryState& batt,
  PowerSenseDebug& pwr,
  LiveUpdateState& state
) {
  Serial.println("LiveUpdate: entering interactive mode");
  if (!WiFiManagerV2::applyOperationalPowerPolicy(pwr.usbPresent, true) && !pwr.usbPresent) {
    Serial.println("LiveUpdate: connected light sleep unavailable; use dynamic deep-sleep fallback");
    return INTERACTIVE_FINISHED;
  }

  uint64_t lastRequested = state.requestedRevision;
  uint64_t lastDisplayed = state.displayedRevision;
  uint32_t configRetryMs = MANUAL_RENDER_RETRY_START_MS;
#if FRAME_MQTT_PILOT_ENABLED
  // MQTT service is local socket processing, NOT an HTTPS revision request.
  // Track it independently so a stale 10-second HTTP probe clock cannot
  // cause a hot-loop while a broker subscription is active.
  uint32_t lastMqttServiceAtMs = 0;
  uint32_t lastDebouncedPowerReadAtMs = 0;
#endif

  while (true) {
#if FRAME_MQTT_PILOT_ENABLED
    // The old loop's 100ms USB debounce on every 1-second MQTT service
    // would waste CPU and defeat automatic light sleep. Sample cheaply and
    // debounce only every 10s or when battery->USB is detected. USB->battery
    // is checked on the same 10s baseline as before this pilot.
    const bool usbJustConnected = !pwr.usbPresent && digitalRead(POWER_SENSE_PIN) == LOW;
    const bool debounceNow = lastDebouncedPowerReadAtMs == 0 ||
      (uint32_t)(millis() - lastDebouncedPowerReadAtMs) >= MANUAL_UPDATE_POLL_MS ||
      usbJustConnected;
    const PowerSenseDebug sampledPower = debounceNow ? readPowerSenseDebug() : pwr;
    if (debounceNow) lastDebouncedPowerReadAtMs = millis();
#else
    const PowerSenseDebug sampledPower = readPowerSenseDebug();
#endif
    if (sampledPower.stable && sampledPower.usbPresent != pwr.usbPresent) {
      pwr = sampledPower;
      batt = BatteryManager::readAndUpdate(pwr.usbPresent);
      bool hadPrevious = false;
      UpdateChecker::detectAndPersistUsbStateChange(pwr.usbPresent, true, hadPrevious);
      g_powerRefreshPending = true;
      Serial.println(pwr.usbPresent ? "USB connected" : "USB disconnected");
      if (batt.requiresRecharge) {
        showRechargeAndSleep(batt, pwr);
        return INTERACTIVE_FINISHED;
      }

      // On USB insertion, stop automatic light sleep before doing any lengthy
      // display/network work so the native USB PHY can enumerate immediately.
      if (pwr.usbPresent) {
        WiFiManagerV2::applyOperationalPowerPolicy(true, true);
      }

      // A charger edge remains a deliberate full-screen reset gesture. On
      // unplug, complete it before entering the battery policy/fallback.
      refreshPowerOverlayIfNeeded(batt, pwr);

      if (!pwr.usbPresent) {
        if (!WiFiManagerV2::applyOperationalPowerPolicy(false, true)) {
          Serial.println("LiveUpdate: unplugged after full-screen reset -> dynamic deep-sleep fallback");
          return INTERACTIVE_FINISHED;
        }
        // Correct the one-shot power-edge status telemetry after the battery
        // policy has actually become active.
        postDeviceStatus(batt, pwr, false);
        if (g_powerSaverMode) {
          Serial.println("Power Saver: USB removed; returning to scheduled deep sleep");
          return INTERACTIVE_FINISHED;
        }
      }
    }
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("LiveUpdate: Wi-Fi disconnected; reconnecting");
      if (!WiFiManagerV2::connectSaved(12000)) {
        delay(REALTIME_FAILURE_BACKOFF_MS);
        continue;
      }
      // connectSaved() re-enters STA mode and begins a new connection, so
      // restore the source-aware operational power policy after every reconnect.
      if (!WiFiManagerV2::applyOperationalPowerPolicy(pwr.usbPresent, true) && !pwr.usbPresent) {
        Serial.println("LiveUpdate: reconnect succeeded but connected light sleep is unavailable");
        return INTERACTIVE_FINISHED;
      }
      Serial.println("LiveUpdate: Wi-Fi reconnected");
    }
    if (scheduledSyncDueNow()) {
      Serial.println("LiveUpdate: scheduled module deadline became due while interactive");
      // Preserve manual update priority if a command coincides with a module deadline.
      LiveUpdateState deadlineState{};
      if (LiveUpdate::probe(DeviceIdentity::getToken(), deadlineState)) {
        state = deadlineState;
      }
      return INTERACTIVE_NORMAL_SYNC_DUE;
    }
    uint64_t awaitingAck = LiveUpdate::getRenderedAwaitingAck();
    if (retryRenderedAck(state.displayedRevision)) {
      if (awaitingAck > state.displayedRevision) {
        state.displayedRevision = awaitingAck;
        // Physical status and signature bookkeeping are deliberately after
        // durable physical ACK, including when the first ACK attempt failed.
        postDeviceStatus(batt, pwr, true);
        refreshContentSignatureBestEffort();
      }
    }

    uint64_t rendered = LiveUpdate::getRenderedAwaitingAck();
    if (state.requestedRevision > state.displayedRevision &&
        state.requestedRevision > rendered) {
      const uint64_t revisionToDisplay = state.requestedRevision;
      if (explicitRevisionObservedAtMs == 0) explicitRevisionObservedAtMs = millis();
      Serial.printf("LiveUpdate: revision %" PRIu64 " pending\n", revisionToDisplay);

      // The low-power connected-idle policy is for discovery. Once a manual
      // revision is observed, temporarily run the radio/CPU at realtime speed
      // for config/content fetches, e-paper preparation and the revision ACK.
      WiFiManagerV2::beginRealtimeNetworkBurst();
      const bool explicitRendered =
        fetchAndRenderExplicit(batt, pwr, revisionToDisplay);

      bool explicitAcked = false;
      if (explicitRendered && retryRenderedAck(state.displayedRevision)) {
        state.displayedRevision = revisionToDisplay;
        refreshContentSignatureBestEffort();
        explicitRevisionObservedAtMs = 0;
        explicitAcked = true;
        setPowerSaverMode(g_cfg.powerSaver);
      }

      if (g_powerSaverMode && !pwr.usbPresent && explicitAcked) {
        // Do not add a status-only network round-trip here. The update is
        // already durably acknowledged; Power Save should go straight to sleep.
        Serial.println("Power Saver: explicit update committed; leaving interactive mode for deep sleep");
        return INTERACTIVE_FINISHED;
      }

      const bool operationalPolicyRestored =
        WiFiManagerV2::applyOperationalPowerPolicy(pwr.usbPresent, true);
      if (!pwr.usbPresent && !operationalPolicyRestored) {
        Serial.println("LiveUpdate: update burst complete but connected light sleep restore failed");
        return INTERACTIVE_FINISHED;
      }

      if (!explicitRendered) {
        // The revision remains pending. Stay interactive and retry with a
        // bounded backoff rather than turning one transient fetch into sleep.
        delay(configRetryMs);
        configRetryMs = (configRetryMs >= 2500U)
          ? 5000U
          : configRetryMs * 2U;
      } else {
        configRetryMs = MANUAL_RENDER_RETRY_START_MS;
        if (explicitAcked) {
          // Report after restoring ALS so telemetry records the steady-state
          // power mode rather than the short realtime burst.
          postDeviceStatus(batt, pwr, true);
        }
      }
    }

    // Preserve pending physical ACKs and give explicit revisions priority.
    if (LiveUpdate::getRenderedAwaitingAck() == 0 &&
        state.requestedRevision <= state.displayedRevision) {
      refreshPowerOverlayIfNeeded(batt, pwr);
    }

    // Exactly one cheap revision probe per idle cadence. Rendering above is
    // synchronous, so a revision arriving during it is observed serially here.
    // If USB was inserted during battery ALS, return to the top immediately
    // so the source-aware USB policy disables light sleep before any network
    // request or e-paper work can delay host enumeration.
#if FRAME_MQTT_PILOT_ENABLED
    // Broker traffic is served every 1s when connected, letting push hints
    // reach the HTTPS verifier promptly. When offline, retain the existing
    // 10-second HTTP cadence. Keep this an opt-in pilot: the extra wake-ups
    // and radio-listen behavior must be measured before shipping.
    const uint32_t probeCadenceMs =
      MqttPushPilot::appActivityIsActive() ? 1000UL : MANUAL_UPDATE_POLL_MS;
    const uint32_t lastProbeStartedAtMs = lastMqttServiceAtMs;
#else
    const uint32_t probeCadenceMs = MANUAL_UPDATE_POLL_MS;
    const uint32_t lastProbeStartedAtMs = LiveUpdate::lastNetworkProbeStartedAtMs();
#endif
    const uint32_t sinceProbeStartedMs =
      lastProbeStartedAtMs == 0 ? probeCadenceMs : millis() - lastProbeStartedAtMs;
    const uint32_t remainingProbeWaitMs =
      sinceProbeStartedMs >= probeCadenceMs ? 0 : probeCadenceMs - sinceProbeStartedMs;
    if (remainingProbeWaitMs > 0 &&
        waitForInteractiveCadence(pwr.usbPresent, remainingProbeWaitMs)) continue;
    // A hard module deadline may have landed inside the normal 1 s / 10 s idle
    // wait. Return to the top before issuing another manual-update probe so the
    // scheduled module work runs at its intended boundary.
    if (scheduledSyncDueNow()) continue;

    // The experimental push path keeps HTTPS as an authoritative verifier.
    // While subscribed, avoid the 10-second HTTPS no-change probes; missed
    // messages are recovered by a bounded periodic safety probe.
#if FRAME_MQTT_PILOT_ENABLED
    lastMqttServiceAtMs = millis();
#endif
    const bool pushConnected = MqttPushPilot::poll(DeviceIdentity::getToken(), pwr.usbPresent);
    MqttPushPilot::maintainActivityPowerPolicy(pwr.usbPresent);
    const bool pushHint = MqttPushPilot::takeNotification();
    const bool subscriptionResync = MqttPushPilot::takeSubscriptionResync();
    const uint32_t lastProbeMs = LiveUpdate::lastNetworkProbeStartedAtMs();
    const uint32_t nowProbeMs = millis();
    const bool safetyProbeDue = lastProbeMs == 0 ||
      (uint32_t)(nowProbeMs - lastProbeMs) >= MQTT_MISSED_HINT_RECOVERY_MS;
    if (pushConnected && !pushHint && !subscriptionResync && !safetyProbeDue) continue;

    LiveUpdateState next{};
    const uint32_t probeStartedAtMs = millis();
    if (!LiveUpdate::probe(DeviceIdentity::getToken(), next,
                          pushHint || subscriptionResync)) {
      if (pushHint) MqttPushPilot::restoreNotification();
      if (subscriptionResync) MqttPushPilot::restoreSubscriptionResync();
      Serial.println("LiveUpdate: interactive probe failed; staying awake");
      delay(REALTIME_FAILURE_BACKOFF_MS);
      continue;
    }

    if (pushHint && next.requestedRevision > next.displayedRevision) {
      g_mqttHintVerifiedRevision = next.requestedRevision;
    }
    if (subscriptionResync && next.requestedRevision > next.displayedRevision) {
      g_mqttResyncVerifiedRevision = next.requestedRevision;
      Serial.println("MQTT reconnect: recovered pending display revision by HTTPS");
    }
    if (next.requestedRevision != lastRequested ||
        next.displayedRevision != lastDisplayed) {
      if (next.requestedRevision > next.displayedRevision) {
        explicitRevisionObservedAtMs = probeStartedAtMs;
      }
      Serial.printf(
        "LiveUpdate: probe requested=%" PRIu64 " displayed=%" PRIu64 "\n",
        next.requestedRevision, next.displayedRevision
      );
      lastRequested = next.requestedRevision;
      lastDisplayed = next.displayedRevision;
    }
    state = next;
  }
}

// --------------------------------------
// Setup
// --------------------------------------
void setup() {
#if defined(FRAME_IS_ALFRED_V1_2)
  // Assert the switched display rail off before any peripheral or network work.
  digitalWrite(HardwareProfile::kEpdPower, LOW);
  pinMode(HardwareProfile::kEpdPower, OUTPUT);
  digitalWrite(HardwareProfile::kEpdPower, LOW);
  gpio_deep_sleep_hold_dis();
  gpio_hold_dis((gpio_num_t)HardwareProfile::kEpdPower);
  digitalWrite(HardwareProfile::kEpdPower, LOW);
  pinMode(HardwareProfile::kEpdPower, OUTPUT);
  digitalWrite(HardwareProfile::kEpdPower, LOW);
#endif
  Serial.begin(115200);
  delay(200);
#if defined(FRAME_IS_ALFRED_V1_2)
  Serial.printf("Alfred V1.2 PSRAM configured/detected: %u bytes\n", ESP.getPsramSize());
#endif

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
  g_powerRefreshPending = chargerStateChanged;
  if (chargerStateChanged) {
    Serial.print("Power state changed (prev=");
    Serial.print(previousUsbPresent ? "plugged" : "battery");
    Serial.print(", now=");
    Serial.print(pwrEarly.usbPresent ? "plugged" : "battery");
    Serial.println(")");
  }

  const esp_sleep_wakeup_cause_t wakeCause = esp_sleep_get_wakeup_cause();
  // Cold boot initializes content; thereafter only module deadlines trigger
  // automatic source work. Manual probes and charger edges do not.
  bool normalSyncDue =
    wakeCause == ESP_SLEEP_WAKEUP_UNDEFINED ||
    (g_nextScheduledWake > 0 && time(nullptr) >= g_nextScheduledWake);
  if (normalSyncDue) Serial.println("SmartRefresh: cold boot or module deadline due");


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
        shutdownDisplay();
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
    // A normally paired test frame is a continuously running appliance. A
    // transient disconnect must neither launch provisioning nor deep sleep.
    while (pwrEarly.usbPresent && WiFiManagerV2::hasCreds() && DeviceIdentity::hasToken()) {
      Serial.println("LiveUpdate: startup reconnect failed; retrying while awake");
      delay(REALTIME_FAILURE_BACKOFF_MS);
      if (WiFiManagerV2::connectSaved(12000)) break;
    }
    if (WiFi.status() != WL_CONNECTED) {
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
      g_displayReady = false;
      reconnectedViaProvisioning = true;
    }
  }

  if (isCompletingWifiSetup) {
    ensureDisplay();
    ScreenPairing::showWifiConnected();
    shutdownDisplay();
  }

  // Normal mode, including the USB override of Power Save, starts the
  // source-aware policy as soon as Wi-Fi has association + DHCP.
  const bool startupOperationalPolicyReady = interactiveModeEnabled(pwrEarly.usbPresent)
    ? WiFiManagerV2::applyOperationalPowerPolicy(pwrEarly.usbPresent, true)
    : false;
  if (interactiveModeEnabled(pwrEarly.usbPresent) &&
      !pwrEarly.usbPresent && !startupOperationalPolicyReady) {
    Serial.println("WiFi power policy: startup connected-idle unavailable; fallback remains armed");
  }

  TimeSync::ensure(8000);
  if (SmartRefresh::loadScheduler(g_smartState, g_revisionCheckedAt)) {
    const time_t restoredNow = time(nullptr);
    g_nextScheduledWake = restoredNow + SmartRefresh::secondsUntilNextWake(
      g_smartState, restoredNow, g_revisionCheckedAt, false, false);
    // A failed network refresh must not cause immediate retries after a sleep
    // or reconnect just because its original source deadline is overdue.
    if (g_revisionRetryNotBefore > restoredNow &&
        g_nextScheduledWake < g_revisionRetryNotBefore)
      g_nextScheduledWake = g_revisionRetryNotBefore;
    Serial.printf("SmartRefresh: restored %u module schedules\n", g_smartState.moduleCount);
  } else {
    g_nextScheduledWake = 0;
    Serial.println("SmartRefresh: scheduler unavailable; screen-wide re-evaluation required");
  }

  activeSetupStep = SETUP_STEP_PAIRING;
  PairingResult pairing = ensurePairedNoReboot(chargerStateChanged);
  if (pairing != PAIRING_PAIRED) {
    if (pairing == PAIRING_EXPIRED) {
      showPairingShelfAndSleep(pwrEarly.usbPresent);
      return;
    }

    ensureDisplay();
    ScreenPairing::showError("Could not pair frame");
    shutdownDisplay();
    goToSleep(pwrEarly.usbPresent);
    return;
  }

  activeSetupStep = SETUP_STEP_NONE;

  // A claimed frame deliberately has no dashboard until onboarding commits its
  // canonical settings. Keep the pairing result useful rather than rendering
  // the frame-config endpoint's former arbitrary fallback dashboard.
  FrameConfigApi::FetchResult postPairConfig =
    FrameConfigApi::fetchWithStatus(g_cfg, DeviceIdentity::getToken());

  // A wake-time backend/network hiccup must never replace a valid e-paper
  // dashboard with a fatal setup screen. Retry briefly in-place first; if the
  // service is still unavailable, leave the physical pixels untouched and
  // retry from a clean wake.
  if (postPairConfig == FrameConfigApi::FETCH_ERROR) {
    const uint32_t retryDelaysMs[] = {2000UL, 5000UL};
    for (uint8_t attempt = 0; attempt < 2 && postPairConfig == FrameConfigApi::FETCH_ERROR; ++attempt) {
      Serial.printf(
        "frame-config transient failure; retry %u/2 in %lu ms\n",
        (unsigned int)(attempt + 1),
        (unsigned long)retryDelaysMs[attempt]
      );
      delay(retryDelaysMs[attempt]);
      postPairConfig = FrameConfigApi::fetchWithStatus(g_cfg, DeviceIdentity::getToken());
    }
  }

  if (postPairConfig == FrameConfigApi::FETCH_SETUP_PENDING) {
    if (!setupPendingScreenDisplayed) {
      ensureDisplay();
      ScreenPairing::showWaitingForSetup();
      shutdownDisplay();
      setupPendingScreenDisplayed = true;
    } else {
      Serial.println("Setup-pending screen already displayed; skipping e-paper redraw");
    }
  } else if (postPairConfig == FrameConfigApi::FETCH_UNPAIRED) {
    Serial.println("frame-config unpaired");
    if (recoverPairingIfTokenLost("initial frame fetch", pwrEarly.usbPresent)) return;
  } else if (postPairConfig == FrameConfigApi::FETCH_ERROR) {
    Serial.println("frame-config still unavailable; preserving existing e-paper content");
    Serial.println("Retrying frame-config on a clean wake in 10 seconds");
    goToSleepForUs(10ULL * 1000000ULL, pwrEarly.usbPresent);
  } else if (postPairConfig == FrameConfigApi::FETCH_OK) {
    setupPendingScreenDisplayed = false;
    setPowerSaverMode(g_cfg.powerSaver);
  }

  // Complete one-time renderer maintenance deterministically after networking
  // and pairing are ready, before starting revision listening.
  runFirmwareMaintenanceIfNeeded(
    BatteryManager::readAndUpdate(pwrEarly.usbPresent),
    pwrEarly
  );

  LiveUpdateState liveState{};
  bool liveProbeOk = false;
  if (interactiveModeEnabled(pwrEarly.usbPresent)) {
    const uint32_t liveProbeStartedAtMs = millis();
    liveProbeOk = LiveUpdate::probe(DeviceIdentity::getToken(), liveState);
    if (liveProbeOk) {
      if (liveState.requestedRevision > liveState.displayedRevision) {
        explicitRevisionObservedAtMs = liveProbeStartedAtMs;
      }
      Serial.printf(
        "LiveUpdate: probe requested=%" PRIu64 " displayed=%" PRIu64 "\n",
        liveState.requestedRevision, liveState.displayedRevision
      );
      uint64_t awaitingAck = LiveUpdate::getRenderedAwaitingAck();
      if (retryRenderedAck(liveState.displayedRevision) &&
          awaitingAck > liveState.displayedRevision) {
        liveState.displayedRevision = awaitingAck;
        refreshContentSignatureBestEffort();
      }
    } else {
      Serial.println("LiveUpdate: probe failed");
    }
  } else {
    Serial.println("Power Saver: live update probe skipped");
  }

  const uint64_t locallyRendered = LiveUpdate::getRenderedAwaitingAck();
  bool explicitRevisionPending =
    liveProbeOk &&
    liveState.requestedRevision > liveState.displayedRevision &&
    liveState.requestedRevision > locallyRendered;

  if (interactiveModeEnabled(pwrEarly.usbPresent) &&
      !explicitRevisionPending && LiveUpdate::getRenderedAwaitingAck() == 0) {
    PowerSenseDebug overlayPwr = readPowerSenseDebug();
    BatteryState overlayBatt = BatteryManager::readAndUpdate(overlayPwr.usbPresent);
    refreshPowerOverlayIfNeeded(overlayBatt, overlayPwr);
  }

  const bool connectedIdleReady = interactiveModeEnabled(pwrEarly.usbPresent)
    ? WiFiManagerV2::applyOperationalPowerPolicy(pwrEarly.usbPresent, true)
    : false;
  if (interactiveModeEnabled(pwrEarly.usbPresent) &&
      !pwrEarly.usbPresent && !connectedIdleReady && !normalSyncDue && !explicitRevisionPending) {
    goToSleep(pwrEarly.usbPresent);
    return;
  }

run_normal_sync:
  bool renderedWithoutSignature = false;
  // A manual revision always wins over a coincident scheduled boundary.
  if (liveProbeOk && liveState.requestedRevision > liveState.displayedRevision &&
      liveState.requestedRevision > LiveUpdate::getRenderedAwaitingAck()) {
    PowerSenseDebug manualPwr = readPowerSenseDebug();
    BatteryState manualBatt = BatteryManager::readAndUpdate(manualPwr.usbPresent);
    if (fetchAndRenderExplicit(manualBatt, manualPwr, liveState.requestedRevision) &&
        retryRenderedAck(liveState.displayedRevision)) {
      liveState.displayedRevision = liveState.requestedRevision;
      setPowerSaverMode(g_cfg.powerSaver);
      postDeviceStatus(manualBatt, manualPwr, true);
      renderedWithoutSignature = !refreshContentSignatureBestEffort();
    }
  }

  // The just-completed physical render satisfies a coincident content boundary.
  // If signature bookkeeping failed, do not immediately duplicate that render;
  // the next revision-safety evaluation will conservatively re-evaluate it.
  if (renderedWithoutSignature) normalSyncDue = false;

  // Battery, recharge, pairing and OTA maintenance remain independent of the
  // display-content cadence. Manual-command discovery never fetches content.
  PowerSenseDebug pwr = readPowerSenseDebug();
  BatteryState batt = BatteryManager::readAndUpdate(pwr.usbPresent);
  BatteryManager::logState("post-wifi-pair", batt);
  logPowerSenseDebug(batt, pwr);
  DisplayCore::setBatteryStatus(batt.percent, batt.isCharging, pwr.usbPresent);
  if (batt.requiresRecharge) {
    showRechargeAndSleep(batt, pwr);
    return;
  }

  if (!normalSyncDue) {
    if (interactiveModeEnabled(pwr.usbPresent) &&
        runInteractiveMode(batt, pwr, liveState) == INTERACTIVE_NORMAL_SYNC_DUE) {
      normalSyncDue = true;
      goto run_normal_sync;
    }
    goToSleep(pwr.usbPresent);
    return;
  }

  runOtaCheckIfDue();
  ContentRevisionState revisionState;
  const uint64_t knownRevision = SmartRefresh::displayedRevision();
  String scheduledModules = SmartRefresh::dueModuleCsv(g_smartState, time(nullptr));
  if (wakeCause == ESP_SLEEP_WAKEUP_UNDEFINED && !scheduledModules.length()) scheduledModules = "all";
  if (!SmartRefresh::probeRevision(DeviceIdentity::getToken(), knownRevision, revisionState)) {
    deferFailedScheduledRefresh("revision probe unavailable");
    Serial.println("Scheduled revision check unavailable; preserving display and sources");
  } else if (!revisionState.changed && !scheduledModules.length()) {
    g_revisionRetryNotBefore = 0;
    g_revisionCheckedAt = time(nullptr);
    g_nextScheduledWake = g_revisionCheckedAt + SmartRefresh::secondsUntilNextWake(
      g_smartState, g_revisionCheckedAt, g_revisionCheckedAt, false, false);
    SmartRefresh::saveScheduler(g_smartState, g_revisionCheckedAt);
    Serial.println("Scheduled revision unchanged; no config, source, or display work");
#if TEMP_REFRESH_AUDIT_ENABLED
    // TEMP_REFRESH_AUDIT: represent the cheap unchanged evaluation without
    // manufacturing source/render detail that was deliberately not fetched.
    SmartRenderState noDesiredState;
    SmartDisplayPlan noDisplayPlan;
    const String unchangedHash = SmartRefresh::TEMP_REFRESH_AUDIT_renderHash(noDesiredState);
    TempRefreshAudit::TEMP_REFRESH_AUDIT_record("scheduled_revision_poll", "", noDesiredState,
      unchangedHash, noDisplayPlan, true, knownRevision, revisionState.revision,
      batt, pwr.usbPresent, wakeCause == ESP_SLEEP_WAKEUP_TIMER ? "timer" : "startup", FW_VER);
    TempRefreshAudit::TEMP_REFRESH_AUDIT_flushPiggyback(DeviceIdentity::getToken(), pwr.usbPresent);
#endif
    postDeviceStatus(batt, pwr, false);
  } else {
    g_revisionRetryNotBefore = 0;
    String affected = SmartRefresh::unionModuleCsv(revisionState.affectedModules, scheduledModules);
    if (!affected.length()) affected = "all";
    if (affected == "all" && FrameConfigApi::fetchWithStatus(g_cfg, DeviceIdentity::getToken()) != FrameConfigApi::FETCH_OK) {
      deferFailedScheduledRefresh("config fetch failed");
      Serial.println("Changed layout/config fetch failed; preserving physical state");
    } else {
      SmartRenderState desired;
      if (!SmartRefresh::fetchRenderState(DeviceIdentity::getToken(), affected, desired, scheduledModules)) {
        deferFailedScheduledRefresh("render-state fetch failed");
        Serial.println("Affected render-state fetch failed; preserving freshness and hashes");
      } else {
        // Only scheduled Surf deadlines invalidate the ESP32's local Surf value.
        // Manual Update and unrelated module changes keep drawing the last
        // completed scheduled Surf result.
        ModuleSurf::invalidateScheduled(scheduledModules);
        SmartDisplayPlan displayPlan = SmartRefresh::plan(desired, false);
        // The render-state News snapshot is already the authoritative source
        // and repairs a retained local cache without needing a redraw. On an
        // older server, keep the prior fallback for changed News content only.
        if (!desired.newsSnapshotReady) {
          for (uint8_t i = 0; i < desired.moduleCount; ++i) {
            if (desired.modules[i].key == "news" && displayPlan.dirty[i]) {
              ModuleNews::invalidate();
              break;
            }
          }
        }
#if TEMP_REFRESH_AUDIT_ENABLED
        const String TEMP_REFRESH_AUDIT_previous = SmartRefresh::TEMP_REFRESH_AUDIT_physicalRenderHash(desired);
#endif
        const bool rendered = renderSmartDashboard(batt, pwr, desired, displayPlan);
#if TEMP_REFRESH_AUDIT_ENABLED
        TempRefreshAudit::TEMP_REFRESH_AUDIT_record(
          revisionState.changed ? "backend_revision_changed" : "scheduled_revision_poll",
          affected, desired, TEMP_REFRESH_AUDIT_previous, displayPlan, rendered,
          knownRevision, revisionState.revision, batt, pwr.usbPresent,
          wakeCause == ESP_SLEEP_WAKEUP_TIMER ? "timer" : (wakeCause == ESP_SLEEP_WAKEUP_EXT1 ? "charger_edge" : "startup"), FW_VER);
        // TEMP_REFRESH_AUDIT upload is only attempted here, immediately after
        // the already-required revision/render-state session is known active.
        TempRefreshAudit::TEMP_REFRESH_AUDIT_flushPiggyback(DeviceIdentity::getToken(), pwr.usbPresent);
#endif
        if (rendered) {
          const bool screenWide = affected == "all";
          SmartRefresh::mergeScheduler(g_smartState, desired, screenWide);
          SmartRefresh::saveDisplayedRevision(revisionState.revision);
          if (batt.percent >= 0) UpdateChecker::saveBatteryPercent(batt.percent);
          g_revisionCheckedAt = time(nullptr);
          g_nextScheduledWake = time(nullptr) + SmartRefresh::secondsUntilNextWake(
            g_smartState, time(nullptr), g_revisionCheckedAt, false, false);
          SmartRefresh::saveScheduler(g_smartState, g_revisionCheckedAt);
          postDeviceStatus(batt, pwr, displayPlan.type != SmartDisplayPlan::NONE);
          Serial.println(displayPlan.type == SmartDisplayPlan::NONE
            ? "Revision changed schedule/source state only; display untouched"
            : "Changed visible modules committed after display success");
        } else {
          deferFailedScheduledRefresh("physical display failed");
        }
      }
    }
  }

  normalSyncDue = false;
  if (interactiveModeEnabled(pwr.usbPresent) &&
      runInteractiveMode(batt, pwr, liveState) == INTERACTIVE_NORMAL_SYNC_DUE) {
    normalSyncDue = true;
    goto run_normal_sync;
  }
  goToSleep(pwr.usbPresent);

}

void loop() {}
