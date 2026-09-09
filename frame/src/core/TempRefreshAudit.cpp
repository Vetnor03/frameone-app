#include "TempRefreshAudit.h"
#include "Config.h"
#if TEMP_REFRESH_AUDIT_ENABLED
#include "DeviceIdentity.h"
#include "NetClient.h"
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WiFi.h>

namespace {
constexpr uint8_t TEMP_REFRESH_AUDIT_MAX_RECORDS = 8;
constexpr uint8_t TEMP_REFRESH_AUDIT_BATTERY_BATCH_THRESHOLD = 4;
// TEMP_REFRESH_AUDIT: use an explicit 64-bit type. Arduino-ESP32 2.0.14 builds
// some targets with a 32-bit time_t, so 2100 cannot be a time_t constant.
constexpr int64_t TEMP_REFRESH_AUDIT_MIN_VALID_UNIX_TIME = 1577836800LL; // 2020-01-01 UTC
constexpr int64_t TEMP_REFRESH_AUDIT_MAX_VALID_UNIX_TIME = 4102444800LL; // 2100-01-01 UTC
Preferences auditPrefs;

void persistTEMP_REFRESH_AUDIT(JsonDocument& doc) {
  auditPrefs.begin("refresh_audit", false);
  const uint64_t eventSeq = auditPrefs.getULong64("event_seq", 0) + 1;
  auditPrefs.putULong64("event_seq", eventSeq); doc["event_seq"] = eventSeq;
  const int64_t now = static_cast<int64_t>(time(nullptr));
  if (now >= TEMP_REFRESH_AUDIT_MIN_VALID_UNIX_TIME &&
      now <= TEMP_REFRESH_AUDIT_MAX_VALID_UNIX_TIME) doc["occurred_at"] = (int64_t)now;
  else doc["occurred_at"] = nullptr;
  String encoded; serializeJson(doc, encoded);
  uint8_t head = auditPrefs.getUChar("head", 0), count = auditPrefs.getUChar("count", 0);
  char key[5]; snprintf(key, sizeof(key), "r%u", head); auditPrefs.putString(key, encoded);
  auditPrefs.putUChar("head", (head + 1) % TEMP_REFRESH_AUDIT_MAX_RECORDS);
  auditPrefs.putUChar("count", count < TEMP_REFRESH_AUDIT_MAX_RECORDS ? count + 1 : TEMP_REFRESH_AUDIT_MAX_RECORDS);
  auditPrefs.end();
}
}

void TempRefreshAudit::TEMP_REFRESH_AUDIT_record(const char* trigger, const String& sourceModules,
  const SmartRenderState& desired, const String& previousPhysicalHash,
  const SmartDisplayPlan& plan, bool displaySucceeded,
  uint64_t backendBefore, uint64_t backendAfter, const BatteryState& battery,
  bool chargerConnected, const char* wakeReason, const char* firmwareVersion) {
  // Persist compact facts only. Module hashes are the existing normalized render
  // model; no second renderer is introduced by TEMP_REFRESH_AUDIT.
  const String previous = previousPhysicalHash;
  const String next = SmartRefresh::TEMP_REFRESH_AUDIT_renderHash(desired);
  const bool changed = !previous.length() || previous != next;
  const bool physical = plan.type != SmartDisplayPlan::NONE && displaySucceeded;
  const bool displayAttempted = plan.type != SmartDisplayPlan::NONE;
  const bool sourceChanged = backendAfter != backendBefore;
  const bool avoidableWake = !displayAttempted && !changed && !sourceChanged &&
    strcmp(trigger, "scheduled_revision_poll") == 0 && sourceModules.length() > 0 &&
    strcmp(wakeReason, "timer") == 0;
  const char* decision = displayAttempted && !displaySucceeded ? "display_failed"
    : physical ? (changed ? "useful_redraw" : "wasted_redraw")
    : avoidableWake ? "avoidable_wake"
    : (!changed && sourceChanged ? "filtered_change" : "no_redraw");
  DynamicJsonDocument doc(2048);
  doc["firmware_version"] = firmwareVersion; doc["trigger"] = trigger;
  doc["source"] = sourceModules; doc["module"] = sourceModules;
  JsonObject display = doc.createNestedObject("display_changes");
  display["canonical_modules_before"] = previous; display["canonical_modules_after"] = next;
  doc.createNestedObject("raw_changes"); // Raw snapshots are nullable/unavailable on-device.
  doc["previous_render_hash"] = previous; doc["new_render_hash"] = next;
  doc["render_changed"] = changed; doc["physical_refresh"] = physical;
  doc["display_attempted"] = displayAttempted;
  if (displayAttempted) doc["display_succeeded"] = displaySucceeded;
  else doc["display_succeeded"] = nullptr;
  doc["refresh_type_attempted"] = displayAttempted ? (plan.type == SmartDisplayPlan::FULL ? "full" : "partial") : "none";
  doc["refresh_type"] = physical ? (plan.type == SmartDisplayPlan::FULL ? "full" : "partial") : "none";
  JsonArray regions = doc.createNestedArray("dirty_regions");
  for (uint8_t i = 0; i < plan.regionCount; ++i) { JsonObject r = regions.createNestedObject(); r["x"] = plan.regions[i].x; r["y"] = plan.regions[i].y; r["w"] = plan.regions[i].w; r["h"] = plan.regions[i].h; }
  doc["decision"] = decision;
  doc["decision_reason"] = displayAttempted && !displaySucceeded ? "Required physical display update was attempted but failed"
    : physical ? (changed ? "Physical refresh changed canonical rendered output" : "Physical refresh occurred despite unchanged canonical render hash")
    : avoidableWake ? "Timer woke for due module evaluation but source revision and canonical display output were unchanged"
    : (!changed && sourceChanged ? "Source changed but normalized render output was identical" : "Evaluation required no physical display update");
  doc["backend_revision_before"] = backendBefore; doc["backend_revision_after"] = backendAfter;
  doc["battery_percent"] = battery.percent; doc["battery_voltage"] = battery.smoothedVoltage;
  doc["charger_connected"] = chargerConnected; doc["wake_reason"] = wakeReason;
  persistTEMP_REFRESH_AUDIT(doc);
}

void TempRefreshAudit::TEMP_REFRESH_AUDIT_recordIntentionalRefresh(const char* trigger,
  const char* reason, bool displaySucceeded, const BatteryState& battery,
  bool chargerConnected, const char* wakeReason, const char* firmwareVersion) {
  DynamicJsonDocument doc(1024);
  doc["firmware_version"] = firmwareVersion; doc["trigger"] = trigger;
  doc["source"] = "local_display"; doc["module"] = "display";
  doc.createNestedObject("raw_changes"); doc.createNestedObject("display_changes");
  doc["previous_render_hash"] = nullptr; doc["new_render_hash"] = nullptr;
  doc["render_changed"] = nullptr; doc["physical_refresh"] = displaySucceeded;
  doc["display_attempted"] = true; doc["display_succeeded"] = displaySucceeded;
  doc["refresh_type_attempted"] = "full";
  doc["refresh_type"] = displaySucceeded ? "full" : "none";
  doc.createNestedArray("dirty_regions"); doc["decision"] = "intentional_refresh";
  doc["decision_reason"] = reason; doc["battery_percent"] = battery.percent;
  doc["battery_voltage"] = battery.smoothedVoltage; doc["charger_connected"] = chargerConnected;
  doc["wake_reason"] = wakeReason; JsonObject metadata = doc.createNestedObject("metadata");
  metadata["intentional_refresh"] = true;
  persistTEMP_REFRESH_AUDIT(doc);
}

void TempRefreshAudit::TEMP_REFRESH_AUDIT_flushPiggyback(const String& token, bool force) {
  if (WiFi.status() != WL_CONNECTED) return; // Never creates a network session.
  auditPrefs.begin("refresh_audit", false);
  uint8_t head = auditPrefs.getUChar("head", 0), count = auditPrefs.getUChar("count", 0);
  if (!count) { auditPrefs.end(); return; }
  if (!force && count < TEMP_REFRESH_AUDIT_BATTERY_BATCH_THRESHOLD) { auditPrefs.end(); return; }
  DynamicJsonDocument batch(16384); batch["device_id"] = DeviceIdentity::getDeviceId(); JsonArray records = batch.createNestedArray("records");
  const uint8_t start = (head + TEMP_REFRESH_AUDIT_MAX_RECORDS - count) % TEMP_REFRESH_AUDIT_MAX_RECORDS;
  for (uint8_t i = 0; i < count; ++i) {
    char key[5]; snprintf(key, sizeof(key), "r%u", (start + i) % TEMP_REFRESH_AUDIT_MAX_RECORDS);
    String raw = auditPrefs.getString(key, "");
    if (raw.length()) { DynamicJsonDocument item(2048); if (!deserializeJson(item, raw)) records.add(item.as<JsonObject>()); }
  }
  String body; serializeJson(batch, body); int code = 0; String response;
  const bool sent = NetClient::TEMP_REFRESH_AUDIT_httpPostConnected(String(BASE_URL) + "/api/device/refresh-audit", token, body, code, response);
  if (sent && code >= 200 && code < 300) { for (uint8_t i = 0; i < TEMP_REFRESH_AUDIT_MAX_RECORDS; ++i) { char key[5]; snprintf(key, sizeof(key), "r%u", i); auditPrefs.remove(key); } auditPrefs.putUChar("count", 0); }
  auditPrefs.end();
}
#endif // TEMP_REFRESH_AUDIT_ENABLED
