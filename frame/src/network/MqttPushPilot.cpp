#include "MqttPushPilot.h"

#if FRAME_MQTT_PILOT_ENABLED

#include "BackendTrust.h"
#include "Config.h"
#include "DeviceIdentity.h"
#include "MqttPilotTrust.h"
#include "NetClient.h"
#include "WiFiManager.h"
#include <ArduinoJson.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

// Public hostname of the test-only EMQX Serverless broker; no secrets
// or customer configuration are compiled into the firmware.
#ifndef MQTT_PILOT_BROKER_HOST
#define MQTT_PILOT_BROKER_HOST "i5138504.ala.us-east-1.emqxsl.com"
#endif
#ifndef MQTT_PILOT_BROKER_PORT
#define MQTT_PILOT_BROKER_PORT 8883
#endif

namespace {
static WiFiClientSecure g_tls;
static PubSubClient g_mqtt(g_tls);
static bool g_configured = false;
static bool g_notificationPending = false;
static bool g_appActivePowerApplied = false;
static uint32_t g_appActiveDeadlineMs = 0;
static const uint32_t ACTIVITY_TTL_MS = 120000UL;
static uint32_t g_retryAfterMs = 0;
static const uint32_t CONNECT_RETRY_MS = 60000;
static const char* TOPIC_PREFIX = "remind/pilot/revisions/";
static String g_topic;

bool validDeviceId(const String& id) {
  if (id.length() < 1 || id.length() > 128) return false;
  for (size_t i = 0; i < id.length(); ++i) {
    const char c = id[i];
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
          (c >= '0' && c <= '9') || c == '-' || c == '_')) return false;
  }
  return true;
}

void onMessage(char* topic, byte* payload, unsigned int length) {
  if (g_topic != topic || length == 0 || length > 20) return;
  // A short-lived app presence hint never triggers a redraw or config fetch.
  // It only controls Wi-Fi listening policy; the device applies its own
  // 120-second ceiling and reverts even if the app crashes.
  if (length == 10 && memcmp(payload, "active:120", 10) == 0) {
    g_appActiveDeadlineMs = millis() + ACTIVITY_TTL_MS;
    return;
  }
  // MQTT is only a hint: always verify any revision with our authenticated
  // HTTPS backend before the display is allowed to redraw.
  if (payload[0] == '0') return;
  for (unsigned int i = 0; i < length; ++i) {
    if (payload[i] < '0' || payload[i] > '9') return;
  }
  g_notificationPending = true;
}

bool configure() {
  if (g_configured) return true;
  const String id = DeviceIdentity::getDeviceId();
  const String host(MQTT_PILOT_BROKER_HOST);
  if (!validDeviceId(id) || host.length() == 0 ||
      host.indexOf('/') >= 0 || host.indexOf('@') >= 0 ||
      host.indexOf(':') >= 0) return false;
  g_topic = String(TOPIC_PREFIX) + id;

  // Verified TLS certificate hostname and full chain. The EMQX Serverless
  // endpoint uses DigiCert Global Root G2, independently trusted from Vercel.
  g_tls.setCACert(kMqttPilotRootCaPem);
  g_mqtt.setServer(MQTT_PILOT_BROKER_HOST, MQTT_PILOT_BROKER_PORT);
  g_mqtt.setCallback(onMessage);
  g_mqtt.setKeepAlive(90);
  g_mqtt.setSocketTimeout(5);
  g_mqtt.setBufferSize(512);
  g_configured = true;
  return true;
}

bool fetchCredentials(const String& deviceToken, String& username, String& password) {
  const String url = String(BASE_URL) +
    "/api/device/mqtt-pilot/credentials?device_id=" + DeviceIdentity::getDeviceId();
  int code = 0;
  String body;
  // Uses the existing trusted HTTPS transport and physical device Bearer auth.
  // Credentials are never written to NVS, a URL, or the serial log.
  if (!NetClient::httpGetAuth(url, deviceToken, code, body) || code != 200) return false;

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, body)) return false;
  const char* mqttUsername = doc["username"] | "";
  const char* mqttPassword = doc["password"] | "";
  if (String(mqttUsername) != DeviceIdentity::getDeviceId()) return false;
  const size_t size = strlen(mqttPassword);
  if (size < 24 || size > 256) return false;
  username = mqttUsername;
  password = mqttPassword;
  return true;
}
}

namespace MqttPushPilot {
bool connected() { return g_mqtt.connected(); }

bool appActivityIsActive() {
  return g_mqtt.connected() && g_appActiveDeadlineMs != 0 &&
    (int32_t)(g_appActiveDeadlineMs - millis()) > 0;
}

void maintainActivityPowerPolicy(bool usbPresent) {
  const uint32_t now = millis();
  const bool active = g_mqtt.connected() && !usbPresent &&
    g_appActiveDeadlineMs != 0 &&
    (int32_t)(g_appActiveDeadlineMs - now) > 0;

  if (active) {
    // Check the real ESP Wi-Fi policy each tick; rendering temporarily sets
    // WIFI_PS_NONE and restore code may reset MAX_MODEM.
    g_appActivePowerApplied =
      WiFiManagerV2::applyAppActiveLightSleepPolicy(usbPresent);
  } else if (g_appActivePowerApplied) {
    g_appActivePowerApplied = false;
    WiFiManagerV2::applyOperationalPowerPolicy(usbPresent, true);
    Serial.println("WiFi power policy: Smart Instant expired; returning to connected idle");
  }
}

bool poll(const String& deviceToken, bool usbPresent) {
  if (!configure() || deviceToken.length() == 0 ||
      WiFi.status() != WL_CONNECTED) return false;
  if (g_mqtt.connected()) {
    return g_mqtt.loop() && g_mqtt.connected();
  }

  const uint32_t now = millis();
  if ((int32_t)(now - g_retryAfterMs) < 0) return false;
  g_retryAfterMs = now + CONNECT_RETRY_MS;

  if (!BackendTrust::ensureClock(1000)) return false;

  WiFiManagerV2::beginRealtimeNetworkBurst();
  String username;
  String password;
  const bool haveCredentials = fetchCredentials(deviceToken, username, password);
  bool subscribed = false;
  if (haveCredentials) {
    const String clientId = String("remind-") + DeviceIdentity::getDeviceId();
    const bool connected = g_mqtt.connect(
      clientId.c_str(), username.c_str(), password.c_str()
    );
    subscribed = connected && g_mqtt.subscribe(g_topic.c_str(), 1);
    if (connected && !subscribed) g_mqtt.disconnect();
  }
  // Clear the mutable copy after use; never log or persist it.
  password = "";
  username = "";

  // Always restore the correct USB/battery policy, including on failure.
  WiFiManagerV2::applyOperationalPowerPolicy(usbPresent, true);
  return subscribed;
}

bool takeNotification() {
  const bool pending = g_notificationPending;
  g_notificationPending = false;
  return pending;
}

void restoreNotification() {
  g_notificationPending = true;
}
}

#else

namespace MqttPushPilot {
bool connected() { return false; }
void maintainActivityPowerPolicy(bool) {}
bool poll(const String&, bool) { return false; }
bool takeNotification() { return false; }
void restoreNotification() {}
}

#endif
