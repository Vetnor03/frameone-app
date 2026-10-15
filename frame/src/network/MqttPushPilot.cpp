#include "MqttPushPilot.h"

#if FRAME_MQTT_PILOT_ENABLED

#include "BackendTrust.h"
#include "DeviceIdentity.h"
#include "WiFiManager.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

#ifndef MQTT_PILOT_BROKER_HOST
#define MQTT_PILOT_BROKER_HOST ""
#endif
#ifndef MQTT_PILOT_BROKER_PORT
#define MQTT_PILOT_BROKER_PORT 8883
#endif

namespace {
static WiFiClientSecure g_tls;
static PubSubClient g_mqtt(g_tls);
static bool g_configured = false;
static bool g_notificationPending = false;
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
  // A packet from MQTT is only a hint, not authorization to refresh.
  // Require a positive decimal revision before querying our backend.
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

  // Uses the same verified public root CA set as the HTTPS backend;
  // TLS validates the broker hostname and server certificate.
  BackendTrust::configure(g_tls);
  g_mqtt.setServer(MQTT_PILOT_BROKER_HOST, MQTT_PILOT_BROKER_PORT);
  g_mqtt.setCallback(onMessage);
  g_mqtt.setKeepAlive(90);
  g_mqtt.setSocketTimeout(5);
  g_mqtt.setBufferSize(512);
  g_configured = true;
  return true;
}
}

namespace MqttPushPilot {
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

  // Broker must authorize each device token and enforce a read-only ACL
  // limiting the session to its own topic. No shared MQTT password is shipped.
  WiFiManagerV2::beginRealtimeNetworkBurst();
  const String id = DeviceIdentity::getDeviceId();
  const String clientId = String("remind-") + id;
  const bool connected = g_mqtt.connect(clientId.c_str(), id.c_str(), deviceToken.c_str());
  const bool subscribed = connected && g_mqtt.subscribe(g_topic.c_str(), 1);
  if (connected && !subscribed) g_mqtt.disconnect();

  // Resume battery connected light sleep immediately after TLS handshake.
  WiFiManagerV2::applyOperationalPowerPolicy(usbPresent, true);
  return subscribed;
}

bool takeNotification() {
  const bool pending = g_notificationPending;
  g_notificationPending = false;
  return pending;
}
}

#else

namespace MqttPushPilot {
bool poll(const String&, bool) { return false; }
bool takeNotification() { return false; }
}

#endif
