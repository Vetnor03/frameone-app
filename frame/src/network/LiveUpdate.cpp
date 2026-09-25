#include "LiveUpdate.h"

#include "Config.h"
#include "DeviceIdentity.h"
#include "NetClient.h"
#include "UpdateChecker.h"
#include "WiFiManager.h"
#include <ArduinoJson.h>
#include <Preferences.h>
#include <inttypes.h>

namespace {
static const uint32_t LIVE_PROBE_MIN_NETWORK_INTERVAL_MS = 10000;
static bool g_haveCachedProbeState = false;
static LiveUpdateState g_cachedProbeState{};
static uint32_t g_lastProbeNetworkStartedAtMs = 0;

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

void restoreOperationalPowerPolicyAfterProbe() {
  // The realtime loop historically forces WIFI_PS_NONE on entry/reconnect.
  // Re-apply the actual source-aware policy after each real network probe so a
  // battery-powered Alfred can settle back into MAX_MODEM connected idle. The
  // persisted USB state is refreshed by the main power-sense path.
  const bool usbPresent = UpdateChecker::hasLastUsbPresent()
    ? UpdateChecker::getLastUsbPresent()
    : true;
  WiFiManagerV2::applyOperationalPowerPolicy(usbPresent, true);
}
}

bool LiveUpdate::probe(const String& deviceToken, LiveUpdateState& out) {
  const uint32_t nowMs = millis();
  if (g_haveCachedProbeState &&
      (uint32_t)(nowMs - g_lastProbeNetworkStartedAtMs) < LIVE_PROBE_MIN_NETWORK_INTERVAL_MS) {
    out = g_cachedProbeState;
    return true;
  }

  String url = String(BASE_URL) + "/api/device/update-state?device_id=" + DeviceIdentity::getDeviceId();
  int code = 0;
  String body;
  const uint32_t networkProbeStartedAtMs = millis();

  // MAX_MODEM + automatic light sleep is ideal between probes, but it can add
  // several seconds of latency to a new HTTPS exchange. Temporarily use the
  // realtime network policy for this tiny revision read, then immediately
  // restore the normal source-aware low-power policy.
  WiFiManagerV2::beginRealtimeNetworkBurst();
  const bool ok = NetClient::httpGetAuth(url, deviceToken, code, body);
  restoreOperationalPowerPolicyAfterProbe();
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
  // Throttle from request START, not completion. Otherwise an 8-second network
  // exchange plus a 10-second idle interval silently becomes an ~18-second
  // user-visible update-detection cadence.
  g_lastProbeNetworkStartedAtMs = networkProbeStartedAtMs;
  out = g_cachedProbeState;
  return true;
}

uint32_t LiveUpdate::lastNetworkProbeStartedAtMs() {
  return g_lastProbeNetworkStartedAtMs;
}

bool LiveUpdate::acknowledge(const String& deviceToken, uint64_t revision, const ManualUpdateTimings* timings) {
  String json = "{\"device_id\":\"" + DeviceIdentity::getDeviceId() +
                "\",\"displayed_revision\":" + revisionString(revision);
  if (timings && timings->ready) {
    json += ",\"manual_timing\":{";
    json += "\"attempts\":" + String(timings->attempts);
    json += ",\"probe_to_pending_ms\":" + String(timings->probeToPendingMs);
    json += ",\"updating_screen_ms\":" + String(timings->updatingScreenMs);
    json += ",\"config_fetch_ms\":" + String(timings->configFetchMs);
    json += ",\"render_state_fetch_ms\":" + String(timings->renderStateFetchMs);
    json += ",\"reminders_preload_ms\":" + String(timings->remindersPreloadMs);
    json += ",\"news_preload_ms\":" + String(timings->newsPreloadMs);
    json += ",\"soccer_preload_ms\":" + String(timings->soccerPreloadMs);
    json += ",\"display_ms\":" + String(timings->displayMs);
    json += ",\"render_total_ms\":" + String(timings->renderTotalMs);
    json += ",\"post_render_ms\":" + String(timings->postRenderMs);
    json += ",\"before_ack_ms\":" + String(timings->beforeAckMs);
    json += "}";
  }
  json += "}";
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
