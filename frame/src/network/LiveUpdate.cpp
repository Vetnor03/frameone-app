#include "LiveUpdate.h"

#include "Config.h"
#include "DeviceIdentity.h"
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFiClientSecure.h>
#include <inttypes.h>

namespace {
String revisionString(uint64_t revision) {
  char value[24];
  snprintf(value, sizeof(value), "%" PRIu64, revision);
  return String(value);
}

bool readRevision(JsonVariantConst value, uint64_t& out) {
  if (value.isNull() || value.is<bool>() || !value.is<uint64_t>()) return false;
  out = value.as<uint64_t>();
  return true;
}

bool request(
  const String& url,
  const String& token,
  const char* method,
  const String* json,
  int& code,
  String& body
) {
  code = 0;
  body = "";
  if (WiFi.status() != WL_CONNECTED) return false;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.setConnectTimeout(4000);
  http.setTimeout(5000);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  if (!http.begin(client, url)) return false;
  http.addHeader("Authorization", "Bearer " + token);
  if (json) http.addHeader("Content-Type", "application/json");
  code = method[0] == 'P' ? http.POST(*json) : http.GET();
  if (code > 0) body = http.getString();
  http.end();
  return code >= 200 && code < 300;
}
}

bool LiveUpdate::probe(const String& deviceToken, LiveUpdateState& out) {
  String url = String(BASE_URL) + "/api/device/update-state?device_id=" + DeviceIdentity::getDeviceId();
  int code = 0;
  String body;
  if (!request(url, deviceToken, "GET", nullptr, code, body) || code != 200) return false;

  StaticJsonDocument<384> doc;
  if (deserializeJson(doc, body)) return false;
  if (!doc["app_active"].is<bool>()) return false;

  uint64_t requested = 0;
  uint64_t displayed = 0;
  if (!readRevision(doc["requested_revision"], requested) ||
      !readRevision(doc["displayed_revision"], displayed) ||
      displayed > requested) {
    return false;
  }

  out.appActive = doc["app_active"].as<bool>();
  out.requestedRevision = requested;
  out.displayedRevision = displayed;
  return true;
}

bool LiveUpdate::acknowledge(const String& deviceToken, uint64_t revision) {
  String json = "{\"device_id\":\"" + DeviceIdentity::getDeviceId() +
                "\",\"displayed_revision\":" + revisionString(revision) + "}";
  int code = 0;
  String body;
  return request(
    String(BASE_URL) + "/api/device/update-state",
    deviceToken,
    "POST",
    &json,
    code,
    body
  ) && code == 200;
}

uint64_t LiveUpdate::getRenderedAwaitingAck() {
  Preferences prefs;
  prefs.begin("frame", true);
  uint64_t revision = prefs.getULong64("live_render", 0);
  prefs.end();
  return revision;
}

void LiveUpdate::saveRenderedAwaitingAck(uint64_t revision) {
  Preferences prefs;
  prefs.begin("frame", false);
  prefs.putULong64("live_render", revision);
  prefs.end();
}

void LiveUpdate::clearRenderedAwaitingAckThrough(uint64_t revision) {
  Preferences prefs;
  prefs.begin("frame", false);
  if (prefs.getULong64("live_render", 0) <= revision) prefs.remove("live_render");
  prefs.end();
}
