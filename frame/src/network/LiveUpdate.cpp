#include "LiveUpdate.h"

#include "Config.h"
#include "DeviceIdentity.h"
#include "NetClient.h"
#include <ArduinoJson.h>
#include <Preferences.h>
#include <inttypes.h>

namespace {
static const uint32_t LIVE_PROBE_MIN_NETWORK_INTERVAL_MS = 10000;
static bool g_haveCachedProbeState = false;
static LiveUpdateState g_cachedProbeState{};
static uint32_t g_lastProbeNetworkAtMs = 0;

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
}

bool LiveUpdate::probe(const String& deviceToken, LiveUpdateState& out) {
  const uint32_t nowMs = millis();
  if (g_haveCachedProbeState &&
      (uint32_t)(nowMs - g_lastProbeNetworkAtMs) < LIVE_PROBE_MIN_NETWORK_INTERVAL_MS) {
    out = g_cachedProbeState;
    return true;
  }

  String url = String(BASE_URL) + "/api/device/update-state?device_id=" + DeviceIdentity::getDeviceId();
  int code = 0;
  String body;
  const bool ok = NetClient::httpGetAuth(url, deviceToken, code, body);
  if (code <= 0) {
    Serial.println("LiveUpdate probe transport failure");
    return false;
  }
  if (!ok || code != 200) {
    Serial.printf("LiveUpdate probe HTTP %d\n", code);
    return false;
  }

  StaticJsonDocument<384> doc;
  if (deserializeJson(doc, body)) {
    Serial.println("LiveUpdate probe invalid JSON");
    return false;
  }
  uint64_t requested = 0;
  uint64_t displayed = 0;
  if (!readRevision(doc["requested_revision"], requested) ||
      !readRevision(doc["displayed_revision"], displayed) ||
      displayed > requested) {
    Serial.println("LiveUpdate probe invalid revision values");
    return false;
  }

  g_cachedProbeState.requestedRevision = requested;
  g_cachedProbeState.displayedRevision = displayed;
  g_haveCachedProbeState = true;
  g_lastProbeNetworkAtMs = millis();
  out = g_cachedProbeState;
  return true;
}

bool LiveUpdate::acknowledge(const String& deviceToken, uint64_t revision) {
  String json = "{\"device_id\":\"" + DeviceIdentity::getDeviceId() +
                "\",\"displayed_revision\":" + revisionString(revision) + "}";
  int code = 0;
  String body;
  const bool ok = NetClient::httpPostAuthJson(
    String(BASE_URL) + "/api/device/update-state",
    deviceToken,
    json,
    code,
    body
  ) && code == 200;

  if (ok && g_haveCachedProbeState) {
    if (revision > g_cachedProbeState.displayedRevision) {
      g_cachedProbeState.displayedRevision = revision;
    }
    if (revision > g_cachedProbeState.requestedRevision) {
      g_cachedProbeState.requestedRevision = revision;
    }
  }
  return ok;
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
