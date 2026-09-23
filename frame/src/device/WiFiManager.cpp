#include "WiFiManager.h"
#include <WiFi.h>
#include <Preferences.h>
#include <esp_pm.h>
#include <esp_wifi.h>
#include <sdkconfig.h>

static Preferences prefs;

namespace {
// 100 beacon intervals is approximately 10.2 seconds on the common 102.4 ms
// beacon period. The AP buffers unicast traffic for a sleeping station; this
// deliberately trades a small amount of latency for much lower radio duty.
static const uint16_t CONNECTED_IDLE_LISTEN_INTERVAL_BEACONS = 100;
static bool g_policyInitialized = false;
static bool g_lastPolicyUsbPresent = false;
static bool g_lastBatteryConnectedIdleReady = false;
static bool g_lastAssociationPreparedForConnectedIdle = false;

bool stationHasIp() {
  if (WiFi.status() != WL_CONNECTED) return false;
  const IPAddress ip = WiFi.localIP();
  return (uint32_t)ip != 0;
}

bool configureAutomaticLightSleep(bool enable) {
#if defined(CONFIG_PM_ENABLE) && CONFIG_PM_ENABLE && \
    defined(CONFIG_FREERTOS_USE_TICKLESS_IDLE) && CONFIG_FREERTOS_USE_TICKLESS_IDLE && \
    defined(CONFIG_IDF_TARGET_ESP32S3)
  esp_pm_config_esp32s3_t config{};
  config.max_freq_mhz = 240;
  config.min_freq_mhz = 40;
  config.light_sleep_enable = enable;
  const esp_err_t err = esp_pm_configure(&config);
  if (err != ESP_OK) {
    Serial.print("WiFi power policy: esp_pm_configure failed: ");
    Serial.println((int)err);
    return false;
  }
  return true;
#else
  (void)enable;
  return false;
#endif
}

bool configureListenIntervalBeforeConnect() {
  wifi_config_t config{};
  const esp_err_t getErr = esp_wifi_get_config(WIFI_IF_STA, &config);
  if (getErr != ESP_OK) {
    Serial.print("WiFi listen interval: get config failed: ");
    Serial.println((int)getErr);
    return false;
  }

  config.sta.listen_interval = CONNECTED_IDLE_LISTEN_INTERVAL_BEACONS;
  const esp_err_t setErr = esp_wifi_set_config(WIFI_IF_STA, &config);
  if (setErr != ESP_OK) {
    Serial.print("WiFi listen interval: set config failed: ");
    Serial.println((int)setErr);
    return false;
  }
  return true;
}
}

namespace WiFiManagerV2 {

void begin() {
  prefs.begin("wifi", false);
}

bool hasCreds() {
  return prefs.isKey("ssid");
}

String getSsid() {
  return prefs.getString("ssid", "");
}

void saveCreds(const String& ssid, const String& pass) {
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
}

void clearCreds() {
  prefs.remove("ssid");
  prefs.remove("pass");
}

bool connectSaved(uint32_t timeoutMs) {
  if (!hasCreds()) return false;

  String ssid = prefs.getString("ssid", "");
  String pass = prefs.getString("pass", "");

  if (ssid.length() == 0) return false;

  WiFi.mode(WIFI_STA);

  // Proven production association sequence:
  // 1) associate with Wi-Fi power save disabled,
  // 2) advertise listen_interval=100 before association,
  // 3) wait for a real DHCP address,
  // 4) only then may the caller enable MAX_MODEM + automatic light sleep.
  const esp_err_t connectPsErr = esp_wifi_set_ps(WIFI_PS_NONE);
  if (connectPsErr != ESP_OK) {
    Serial.print("WiFi connect policy: WIFI_PS_NONE failed: ");
    Serial.println((int)connectPsErr);
  }

  // WiFi.begin(..., connect=false) writes credentials without associating.
  WiFi.begin(ssid.c_str(), pass.c_str(), 0, nullptr, false);
  const bool listenIntervalReady = configureListenIntervalBeforeConnect();
  g_lastAssociationPreparedForConnectedIdle =
    connectPsErr == ESP_OK && listenIntervalReady;
  esp_wifi_connect();
  g_policyInitialized = false;  // Association/reconnect can reset Wi-Fi PS state.

  Serial.print("Connecting WiFi (saved): ");
  Serial.println(ssid);

  uint32_t start = millis();
  while (!stationHasIp() && (millis() - start) < timeoutMs) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (stationHasIp()) {
    Serial.print("✅ WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
    return true;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("❌ WiFi associated but DHCP/IP was not ready before timeout.");
  } else {
    Serial.println("❌ WiFi connect failed.");
  }
  return false;
}

bool applyOperationalPowerPolicy(bool usbPresent, bool force) {
  if (!force && g_policyInitialized && usbPresent == g_lastPolicyUsbPresent) {
    return usbPresent ? true : g_lastBatteryConnectedIdleReady;
  }

  g_policyInitialized = true;
  g_lastPolicyUsbPresent = usbPresent;

  if (usbPresent) {
    // USB power is the debugging/realtime case: prioritize latency and native
    // USB stability over battery savings.
    configureAutomaticLightSleep(false);
    WiFi.setSleep(false);
    const esp_err_t err = esp_wifi_set_ps(WIFI_PS_NONE);
    g_lastBatteryConnectedIdleReady = false;
    Serial.println("WiFi power policy: USB realtime");
    return err == ESP_OK;
  }

  // Battery policy: only enter the measured connected-idle sequence after
  // association and DHCP are complete.
  if (!stationHasIp()) {
    Serial.println("WiFi power policy: battery policy requested before IP is ready");
    g_lastBatteryConnectedIdleReady = false;
    return false;
  }

  WiFi.setSleep(true);
  const esp_err_t psErr = esp_wifi_set_ps(WIFI_PS_MAX_MODEM);
  const bool lightSleepReady = configureAutomaticLightSleep(true);
  g_lastBatteryConnectedIdleReady =
    g_lastAssociationPreparedForConnectedIdle &&
    psErr == ESP_OK &&
    lightSleepReady;

  if (g_lastBatteryConnectedIdleReady) {
    Serial.println("WiFi power policy: battery connected-idle (~10s listen interval)");
    return true;
  }

  Serial.println("WiFi power policy: connected light sleep unavailable; deep-sleep fallback required");
  return false;
}

const char* operationalPowerMode() {
  if (!g_policyInitialized) return "uninitialized";
  if (g_lastPolicyUsbPresent) return "usb_realtime";
  return g_lastBatteryConnectedIdleReady
    ? "battery_connected_idle"
    : "deep_sleep_fallback";
}

}
