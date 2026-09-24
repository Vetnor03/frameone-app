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

// Change this string whenever you want to force one redraw after flashing/OTA
static const char* FW_VER = "v2.7.4";

// Public app page shown during pairing
static const char* APP_LOGIN_URL = "https://re-mind.no/login";

// Cheap live-update discovery wake. Keep it isolated from display decisions:
// waking and observing a revision never imply an e-paper transaction.
// Keep the short fallback probe for fast explicit app updates. The independent
// ten-minute background maximum and module deadlines decide content work; this
// probe never implies a source fetch or redraw.
static const uint32_t MAX_REVISION_POLL_SECONDS = 10 * 60;
// USB stays fully realtime. On battery, a PM-capable Alfred remains connected
// with MAX_MODEM/automatic light sleep and uses a short connected idle cadence.
// Builds without automatic light sleep use the revision-safety deep sleep.
static const uint32_t REALTIME_UPDATE_POLL_MS = 1000;
static const uint32_t BATTERY_CONNECTED_IDLE_LOOP_MS = 10000;
static const uint32_t REALTIME_FAILURE_BACKOFF_MS = 5000;

// Survives ESP32 deep sleep, but intentionally resets on reset/power loss.
RTC_DATA_ATTR static uint32_t normalSyncElapsedSeconds = 0;
RTC_DATA_ATTR static uint32_t plannedDeepSleepSeconds = SmartRefresh::REVISION_SAFETY_SECONDS;
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

static void setPowerSaverMode(bool enabled) {
  if (g_powerSaverMode == enabled) return;
  g_powerSaverMode = enabled;
  normalSyncElapsedSeconds = 0;

  const time_t now = time(nullptr);
  if (now >= 1000000000 && g_smartState.moduleCount > 0) {
    g_nextScheduledWake = now + SmartRefresh::secondsUntilNextWake(
      g_smartState, now, g_revisionCheckedAt, !g_powerSaverMode);
  }

  Serial.println(g_powerSaverMode
    ? "Power mode: Power Saver (scheduled deep sleep only)"
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
    g_smartState, now, checkedAt, !g_powerSaverMode);
  if (seconds <= 1 && g_revisionRetryNotBefore > now)
    seconds = (uint32_t)(g_revisionRetryNotBefore - now);
  // Invalid/unset wall time or scheduler state falls back to the revision
  // safety maximum for normal smart-refresh work.
  if (now < 1000000000 || seconds == 0) seconds = SmartRefresh::REVISION_SAFETY_SECONDS;
  // Deep sleep cannot receive a cloud manual-update request. Keep the smart
  // scheduler's due-work calculation, but never sleep longer than the manual
  // discovery ceiling so the app Update button remains responsive on battery.
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
  plannedDeepSleepSeconds = (uint32_t)(durationUs / 1000000ULL);
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
  json += "\"power_mode\":\"" + String(g_powerSaverMode ? "power_saver_deep_sleep" : WiFiManagerV2::operationalPowerMode()) + "\",";
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
  Serial.printf("Render timing reminders_preload_ms=%lu active=%u\n",
    (unsigned long)(millis() - remindersPreloadStartedAtMs), remindersActive ? 1U : 0U);

  uint8_t soccerAssignments = 0;
  const uint32_t soccerPreloadStartedAtMs = millis();
  for (int i = 0; i < activeAssignmentCount; ++i) {
    if (strncmp(activeAssignments[i].module, "soccer", 6) != 0) continue;
    ModuleSoccer::preload(String(activeAssignments[i].module));
    soccerAssignments++;
  }
  Serial.printf("Render timing soccer_preload_ms=%lu active_assignments=%u\n",
    (unsigned long)(millis() - soccerPreloadStartedAtMs), (unsigned int)soccerAssignments);

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
  ModuleReminders::setConfig(&g_cfg); ModuleSoccer::setConfig(&g_cfg); ModuleStocks::setConfig(&g_cfg);
  ModuleReminders::setRequiredProfiles(Layout::reminderProfileMask(g_cfg.layout, g_cfg));
  ModuleReminders::preload();
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

static bool fetchAndRenderExplicit(
  const BatteryState& batt,
  const PowerSenseDebug& pwr,
  uint64_t revision
) {
  explicitTimingRevision = revision;
  explicitTimingStartedAtMs = millis();
  Serial.printf(
    "LiveUpdate timing probe_to_pending_ms=%lu\n",
    (unsigned long)(explicitTimingStartedAtMs - explicitRevisionObservedAtMs)
  );
  // Manual Update is an intentional user action. Give immediate physical
  // acknowledgement before the slower config/content fetches begin. Power Save
  // never reaches this path for routine sleeping updates.
  if (!g_powerSaverMode) {
    ensureDisplay();
    Theme::set(g_cfg.theme);
    DisplayCore::drawUpdatingScreen();
    shutdownDisplay();
    Serial.println("LiveUpdate: Updating screen displayed");
  }

  const uint32_t configFetchStartedAtMs = millis();
  FrameConfigApi::FetchResult result =
    FrameConfigApi::fetchWithStatus(g_cfg, DeviceIdentity::getToken());
  Serial.printf(
    "LiveUpdate timing config_fetch_ms=%lu\n",
    (unsigned long)(millis() - configFetchStartedAtMs)
  );
  if (result != FrameConfigApi::FETCH_OK) {
    Serial.printf("LiveUpdate: revision %" PRIu64 " frame fetch failed\n", revision);
    return false;
  }

  setupPendingScreenDisplayed = false;
  SmartRenderState desired;
  const uint32_t renderStateStartedAtMs = millis();
  const bool renderStateOk =
    SmartRefresh::fetchRenderState(DeviceIdentity::getToken(), "all", desired);
  Serial.printf(
    "LiveUpdate timing render_state_fetch_ms=%lu\n",
    (unsigned long)(millis() - renderStateStartedAtMs)
  );
  if (!renderStateOk) return false;
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
  const bool rendered = renderSmartDashboard(batt, pwr, desired, displayPlan);
#if TEMP_REFRESH_AUDIT_ENABLED
  TempRefreshAudit::TEMP_REFRESH_AUDIT_record("manual_refresh", "all", desired,
    TEMP_REFRESH_AUDIT_previous, displayPlan, rendered, TEMP_REFRESH_AUDIT_backendBefore,
    revision, batt, pwr.usbPresent, "interactive", FW_VER);
  // TEMP_REFRESH_AUDIT manual work is an explicit opportunity to drain a batch.
  TempRefreshAudit::TEMP_REFRESH_AUDIT_flushPiggyback(DeviceIdentity::getToken(), true);
#endif
  if (!rendered) return false;
  SmartRefresh::mergeScheduler(g_smartState, desired, true);
  g_revisionCheckedAt = time(nullptr);
  g_nextScheduledWake = g_revisionCheckedAt + SmartRefresh::secondsUntilNextWake(
    g_smartState, g_revisionCheckedAt, g_revisionCheckedAt, !g_powerSaverMode);
  SmartRefresh::saveScheduler(g_smartState, g_revisionCheckedAt);
  ContentRevisionState contentRevision;
  if (SmartRefresh::probeRevision(DeviceIdentity::getToken(), SmartRefresh::displayedRevision(), contentRevision))
    SmartRefresh::saveDisplayedRevision(contentRevision.revision);
  LiveUpdate::saveRenderedAwaitingAck(revision);
  // A successful physical render also satisfies the one-time renderer-version
  // maintenance redraw, even if its revision ACK needs a network retry.
  UpdateChecker::saveFirmwareVersion(FW_VER);
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
  if (LiveUpdate::acknowledge(DeviceIdentity::getToken(), rendered)) {
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
  if (normalSyncElapsedSeconds >= MAX_REVISION_POLL_SECONDS) {
    normalSyncElapsedSeconds -= MAX_REVISION_POLL_SECONDS;
  }
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
  uint32_t configRetryMs = REALTIME_UPDATE_POLL_MS;
  const uint32_t interactiveStartedAtMs = millis();
  const uint32_t baselineElapsedAtEntry = normalSyncElapsedSeconds;

  while (true) {
    const PowerSenseDebug sampledPower = readPowerSenseDebug();
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
    const uint32_t awakeSeconds = (millis() - interactiveStartedAtMs) / 1000U;
    const bool scheduledSyncDue = scheduledSyncDueNow();
    const bool revisionSafetyDue =
      baselineElapsedAtEntry + awakeSeconds >= MAX_REVISION_POLL_SECONDS;
    if (scheduledSyncDue || revisionSafetyDue) {
      Serial.println(scheduledSyncDue
        ? "LiveUpdate: scheduled module deadline became due while interactive"
        : "LiveUpdate: normal sync became due while interactive");
      // Carry the freshest manual-update state into the baseline path. A failure
      // is non-blocking: scheduled/safety work is already due and must not wait.
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

      if (g_powerSaverMode && explicitAcked) {
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
        configRetryMs = REALTIME_UPDATE_POLL_MS;
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
    const uint32_t probeCadenceMs =
      pwr.usbPresent ? REALTIME_UPDATE_POLL_MS : BATTERY_CONNECTED_IDLE_LOOP_MS;
    const uint32_t lastProbeStartedAtMs = LiveUpdate::lastNetworkProbeStartedAtMs();
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

    LiveUpdateState next{};
    const uint32_t probeStartedAtMs = millis();
    if (!LiveUpdate::probe(DeviceIdentity::getToken(), next)) {
      Serial.println("LiveUpdate: interactive probe failed; staying awake");
      delay(REALTIME_FAILURE_BACKOFF_MS);
      continue;
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
  if (wakeCause == ESP_SLEEP_WAKEUP_TIMER && !g_powerSaverMode) {
    normalSyncElapsedSeconds += plannedDeepSleepSeconds;
  }
  // Power events never advance, reset, or trigger the display-content clock.
  // Cold boot initializes the baseline; subsequent checks are interval-only.
  bool normalSyncDue =
    wakeCause == ESP_SLEEP_WAKEUP_UNDEFINED ||
    (g_nextScheduledWake > 0 && time(nullptr) >= g_nextScheduledWake) ||
    (!g_powerSaverMode && normalSyncElapsedSeconds >= MAX_REVISION_POLL_SECONDS);
  if (normalSyncDue) {
    if (!g_powerSaverMode && normalSyncElapsedSeconds >= MAX_REVISION_POLL_SECONDS) {
      normalSyncElapsedSeconds -= MAX_REVISION_POLL_SECONDS;
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

  // Normal mode uses the measured connected-idle policy as soon as saved Wi-Fi
  // has association + DHCP, before time sync or any following backend traffic.
  const bool startupOperationalPolicyReady = g_powerSaverMode
    ? false
    : WiFiManagerV2::applyOperationalPowerPolicy(pwrEarly.usbPresent, true);
  if (!g_powerSaverMode && !pwrEarly.usbPresent && !startupOperationalPolicyReady) {
    Serial.println("WiFi power policy: startup connected-idle unavailable; fallback remains armed");
  }

  TimeSync::ensure(8000);
  if (SmartRefresh::loadScheduler(g_smartState, g_revisionCheckedAt)) {
    const time_t restoredNow = time(nullptr);
    g_nextScheduledWake = restoredNow + SmartRefresh::secondsUntilNextWake(
      g_smartState, restoredNow, g_revisionCheckedAt, !g_powerSaverMode);
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
    plannedDeepSleepSeconds = 10;
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
  if (!g_powerSaverMode) {
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

  if (!g_powerSaverMode &&
      !explicitRevisionPending && LiveUpdate::getRenderedAwaitingAck() == 0) {
    PowerSenseDebug overlayPwr = readPowerSenseDebug();
    BatteryState overlayBatt = BatteryManager::readAndUpdate(overlayPwr.usbPresent);
    refreshPowerOverlayIfNeeded(overlayBatt, overlayPwr);
  }

  const bool connectedIdleReady = g_powerSaverMode
    ? false
    : WiFiManagerV2::applyOperationalPowerPolicy(pwrEarly.usbPresent, true);
  if (!g_powerSaverMode &&
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
  // display-content cadence. A safety wake performs only the tiny revision read.
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
    if (!g_powerSaverMode &&
        runInteractiveMode(batt, pwr, liveState) == INTERACTIVE_NORMAL_SYNC_DUE) {
      consumeNormalSyncPeriod();
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
    g_revisionRetryNotBefore = time(nullptr) + 60;
    Serial.println("Revision safety poll unavailable; preserving display and sources");
  } else if (!revisionState.changed && !scheduledModules.length()) {
    g_revisionRetryNotBefore = 0;
    g_revisionCheckedAt = time(nullptr);
    g_nextScheduledWake = g_revisionCheckedAt + SmartRefresh::secondsUntilNextWake(
      g_smartState, g_revisionCheckedAt, g_revisionCheckedAt, !g_powerSaverMode);
    SmartRefresh::saveScheduler(g_smartState, g_revisionCheckedAt);
    Serial.println("Revision unchanged; no config, source, or display work");
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
      Serial.println("Changed layout/config fetch failed; preserving physical state");
    } else {
      SmartRenderState desired;
      if (!SmartRefresh::fetchRenderState(DeviceIdentity::getToken(), affected, desired)) {
        Serial.println("Affected render-state fetch failed; preserving freshness and hashes");
      } else {
        SmartDisplayPlan displayPlan = SmartRefresh::plan(desired, false);
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
            g_smartState, time(nullptr), g_revisionCheckedAt, !g_powerSaverMode);
          SmartRefresh::saveScheduler(g_smartState, g_revisionCheckedAt);
          postDeviceStatus(batt, pwr, displayPlan.type != SmartDisplayPlan::NONE);
          Serial.println(displayPlan.type == SmartDisplayPlan::NONE
            ? "Revision changed schedule/source state only; display untouched"
            : "Changed visible modules committed after display success");
        }
      }
    }
  }

  normalSyncDue = false;
  if (!g_powerSaverMode &&
      runInteractiveMode(batt, pwr, liveState) == INTERACTIVE_NORMAL_SYNC_DUE) {
    consumeNormalSyncPeriod();
    normalSyncDue = true;
    goto run_normal_sync;
  }
  goToSleep(pwr.usbPresent);

}

void loop() {}
