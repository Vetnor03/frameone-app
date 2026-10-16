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
static String g_brokerHost;
static String g_brokerCaPem;
static bool g_ablyTokenActive = false;
static uint32_t g_tokenRenewAfterMs = 0;
static const uint32_t ABLY_RENEW_AFTER_MS = 50UL * 60UL * 1000UL;

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
  // Broker endpoint is also supplied by the authenticated RE:MIND backend.
  // The compiled address is only a compatibility fallback for older servers.
  g_brokerHost = MQTT_PILOT_BROKER_HOST;
  g_mqtt.setServer(g_brokerHost.c_str(), MQTT_PILOT_BROKER_PORT);
  g_mqtt.setCallback(onMessage);
  g_mqtt.setKeepAlive(90);
  g_mqtt.setSocketTimeout(5);
  g_mqtt.setBufferSize(512);
  g_configured = true;
  return true;
}

bool fetchCredentials(const String& deviceToken, String& username, String& password,
                      String& brokerHost, uint16_t& brokerPort, String& brokerCaPem,
                      bool& ablyToken) {
  const String url = String(BASE_URL) +
    "/api/device/mqtt-pilot/credentials?device_id=" + DeviceIdentity::getDeviceId();
  int code = 0;
  String body;
  // Uses the existing trusted HTTPS transport and physical device Bearer auth.
  // Credentials are never written to NVS, a URL, or the serial log.
  if (!NetClient::httpGetAuth(url, deviceToken, code, body) || code != 200) return false;

  // Public CA PEM can be >1KB; allocate JSON capacity on heap instead of
  // using >6KB of the ESP32 Arduino loop task's limited stack.
  DynamicJsonDocument doc(8192);
  if (deserializeJson(doc, body)) return false;
  const char* mqttUsername = doc["username"] | "";
  const char* mqttPassword = doc["password"] | "";
  // Existing EMQX contract uses device ID + separate MQTT password.
  // Ably's protocol adapter instead authenticates a scoped, expiring JWT as
  // MQTT username, with an empty password. Never send the RE:MIND device token.
  const char* authMode = doc["mqtt_auth"] | "emqx_password_v1";
  ablyToken = strcmp(authMode, "ably_jwt_v1") == 0;
  if (ablyToken) {
    const size_t jwtLength = strlen(mqttUsername);
    if (jwtLength < 200 || jwtLength > 1400 || mqttPassword[0] != '\0' ||
        (doc["token_ttl_sec"] | 0) != 3600) return false;
  } else {
    if (strcmp(authMode, "emqx_password_v1") != 0 ||
        String(mqttUsername) != DeviceIdentity::getDeviceId()) return false;
    const size_t size = strlen(mqttPassword);
    if (size < 24 || size > 256) return false;
  }
  const char* host = doc["broker_host"] | MQTT_PILOT_BROKER_HOST;
  const int port = doc["broker_port"] | MQTT_PILOT_BROKER_PORT;
  const String validatedHost(host);
  if (validatedHost.isEmpty() || validatedHost.length() > 253 || port < 1 || port > 65535) return false;
  if (ablyToken && (validatedHost != "main.mqtt.ably.net" || port != 8883)) return false;
  for (size_t i = 0; i < validatedHost.length(); ++i) {
    const char c = validatedHost[i];
    if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
          (c >= '0' && c <= '9') || c == '.' || c == '-')) return false;
  }
  // CA trust is provisioned only by the already TLS-authenticated RE:MIND
  // backend. If unset, continue using the built-in public DigiCert G2 root.
  const char* providedCa = doc["broker_ca_pem"] | "";
  const String receivedCa(providedCa);
  if (receivedCa.length() > 4096 ||
      (receivedCa.length() > 0 &&
        (receivedCa.indexOf("-----BEGIN CERTIFICATE-----") < 0 ||
         receivedCa.indexOf("-----END CERTIFICATE-----") < 0))) return false;
  // Ably's CA must be explicitly provisioned, never borrowed from the
  // EMQX compatibility default without verification.
  if (ablyToken && receivedCa.isEmpty()) return false;
  brokerCaPem = receivedCa;
  brokerHost = validatedHost;
  brokerPort = (uint16_t)port;
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
    if (!g_ablyTokenActive || (int32_t)(millis() - g_tokenRenewAfterMs) < 0) {
      return g_mqtt.loop() && g_mqtt.connected();
    }
    // MQTT 3.1.1 has no in-place AUTH command. Refresh proactively at 50m
    // (JWT expires after 60m) so the broker never drops us for token expiry.
    // A backend outage still falls through to the existing HTTPS fallback.
    g_mqtt.disconnect();
    g_retryAfterMs = millis();
    g_ablyTokenActive = false;
  }

  const uint32_t now = millis();
  if ((int32_t)(now - g_retryAfterMs) < 0) return false;
  g_retryAfterMs = now + CONNECT_RETRY_MS;

  if (!BackendTrust::ensureClock(1000)) return false;

  WiFiManagerV2::beginRealtimeNetworkBurst();
  String username;
  String password;
  String brokerHost;
  String brokerCaPem;
  uint16_t brokerPort = MQTT_PILOT_BROKER_PORT;
  bool ablyToken = false;
  const bool haveCredentials = fetchCredentials(
    deviceToken, username, password, brokerHost, brokerPort, brokerCaPem, ablyToken
  );
  bool subscribed = false;
  if (haveCredentials) {
    // Keep the hostname String alive for the lifetime of PubSubClient.
    g_brokerHost = brokerHost;
    g_brokerCaPem = brokerCaPem;
    g_tls.setCACert(g_brokerCaPem.isEmpty()
      ? kMqttPilotRootCaPem : g_brokerCaPem.c_str());
    g_mqtt.setServer(g_brokerHost.c_str(), brokerPort);
    // Ably accepts QoS0 subscriptions only and requires <=60s keepalive.
    // Its JWT username needs a larger MQTT CONNECT packet buffer.
    g_mqtt.setKeepAlive(ablyToken ? 60 : 90);
    const bool bufferReady = g_mqtt.setBufferSize(ablyToken ? 2048 : 512);
    const String clientId = String("remind-") + DeviceIdentity::getDeviceId();
    const bool connected = bufferReady && g_mqtt.connect(
      clientId.c_str(), username.c_str(), password.c_str()
    );
    subscribed = connected && g_mqtt.subscribe(g_topic.c_str(), ablyToken ? 0 : 1);
    if (connected && !subscribed) g_mqtt.disconnect();
    g_ablyTokenActive = subscribed && ablyToken;
    g_tokenRenewAfterMs = g_ablyTokenActive ? millis() + ABLY_RENEW_AFTER_MS : 0;
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
bool appActivityIsActive() { return false; }
void maintainActivityPowerPolicy(bool) {}
bool poll(const String&, bool) { return false; }
bool takeNotification() { return false; }
void restoreNotification() {}
}

#endif
