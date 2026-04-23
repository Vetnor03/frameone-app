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
#include "FirmwareUpdater.h"

#include <Preferences.h>
#include <time.h>
#include <esp_sleep.h>

// Change this string whenever you want to force one redraw after flashing/OTA
static const char* FW_VER = "v2.4.7";

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

struct PowerSenseDebug {
  int raw;
  int highCount;
  bool usbPresent;
};

static void ensureDisplay() {
  if (!g_displayReady) {
    DisplayCore::begin();
    g_displayReady = true;
  }
}

static const uint64_t PWR_SENSE_WAKE_MASK = (1ULL << PWR_SENSE_DEBUG_PIN);

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
  out.usbPresent = (out.raw == HIGH);

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
  if (pwr.highCount >= 8) {
    Serial.println("HIGH");
  } else if (pwr.highCount <= 2) {
    Serial.println("LOW");
  } else {
    Serial.println("UNSTABLE");
  }

  Serial.print("is_usb_present: ");
  Serial.println(pwr.usbPresent ? "true" : "false");

  Serial.println("===================");
  Serial.println();
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
static bool ensurePairedNoReboot() {
  if (DeviceIdentity::hasToken()) {
    Serial.println("✅ Token in flash -> paired");
    return true;
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
        ensureDisplay();
        ScreenPairing::showPaired();
        delay(2200);
        return true;
      }
    }

    delay(500);
  }

  PairStartResponse startResp;
  if (!BackendApi::pairStart(startResp)) {
    return false;
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
        ScreenPairing::showPaired();
        delay(2600);
        return true;
      }
    }
  }

  return false;
}

static bool recoverPairingIfTokenLost(const char* reason, bool usbPresent) {
  if (DeviceIdentity::hasToken()) return false;

  Serial.print("🔐 Token lost: ");
  Serial.println(reason);

  if (ensurePairedNoReboot()) {
    delay(400);
    ESP.restart();
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

  Serial.print("device_id: ");
  Serial.println(DeviceIdentity::getDeviceId());

  {
    bool hasWifi = WiFiManagerV2::hasCreds();
    bool hasToken = DeviceIdentity::hasToken();

    Preferences prefs;
    prefs.begin("frame", false);
    bool shelfDone = prefs.getBool("shelf_done", false);

    if (!hasWifi && !hasToken && !shelfDone) {
      if (!pwrEarly.usbPresent) {
        ensureDisplay();
        DisplayCore::drawShelfScreen(DeviceIdentity::getDeviceId());
        prefs.putBool("shelf_done", true);
        prefs.end();
        goToShelfSleep(pwrEarly.usbPresent);
        return;
      } else {
        prefs.putBool("shelf_done", true);
      }
    }

    prefs.end();
  }

  UpdateChecker::noteWake();

  if (!WiFiManagerV2::connectSaved(12000)) {
    ensureDisplay();
    ProvisioningPortal::runBlocking();
  }

  TimeSync::ensure(8000);

  if (!ensurePairedNoReboot()) {
    ensureDisplay();
    ScreenPairing::showError("Could not pair frame");
    goToSleep(pwrEarly.usbPresent);
    return;
  }

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

  const bool lastUsbPresent = UpdateChecker::getLastUsbPresent();
  const int lastBatteryPercent = UpdateChecker::getLastBatteryPercent();

  const bool usbChanged = (pwr.usbPresent != lastUsbPresent);

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

  bool cfgOk =
    FrameConfigApi::fetch(
      g_cfg,
      DeviceIdentity::getToken()
    );

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
  }

  if (batteryJumpChanged) {
    Serial.println("🔋 Battery changed by >= 10% -> force redraw");
  }

  bool shouldRender =
    forceFw ||
    forcePeriodic ||
    configChanged ||
    remindersChanged ||
    surfChanged ||
    usbChanged ||
    batteryJumpChanged;

  // ---------------- No redraw ----------------
  if (!shouldRender) {
    Serial.println("😴 No change -> keep current ePaper image");

    postDeviceStatus(batt, pwr, false);
    UpdateChecker::saveUsbPresent(pwr.usbPresent);
    UpdateChecker::saveBatteryPercent(batt.percent);
    goToSleep(pwr.usbPresent);
    return;
  }

  // ---------------- Redraw ----------------
  if (!cfgOk) {
    if (!FrameConfigApi::fetch(g_cfg, DeviceIdentity::getToken())) {
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

  ensureDisplay();

  Theme::set(g_cfg.theme);
  resetTextStateForDashboard();

  Layout::drawWithContent(g_cfg.layout, g_cfg);

  postDeviceStatus(batt, pwr, true);

  UpdateChecker::saveApplied(updatedAt);
  if (reminderSig.length() > 0) UpdateChecker::saveReminderSig(reminderSig);
  if (surfSig.length() > 0) UpdateChecker::saveSurfSig(surfSig);
  UpdateChecker::saveFirmwareVersion(FW_VER);
  UpdateChecker::saveUsbPresent(pwr.usbPresent);
  UpdateChecker::saveBatteryPercent(batt.percent);

  if (forcePeriodic) {
    UpdateChecker::resetWakeCounter();
  }

  Serial.println("✅ Applied");
  goToSleep(pwr.usbPresent);
}

void loop() {}