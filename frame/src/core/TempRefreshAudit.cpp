#include "TempRefreshAudit.h"
#include "Config.h"
#include "DeviceIdentity.h"
#include "NetClient.h"
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WiFi.h>

namespace {
constexpr uint8_t TEMP_REFRESH_AUDIT_MAX_RECORDS = 8;
constexpr uint8_t TEMP_REFRESH_AUDIT_BATTERY_BATCH_THRESHOLD = 4;
Preferences auditPrefs;

void persistTEMP_REFRESH_AUDIT(JsonDocument& doc) {
  auditPrefs.begin("refresh_audit", false);
  const uint64_t eventSeq = auditPrefs.getULong64("event_seq", 0) + 1;
  auditPrefs.putULong64("event_seq", eventSeq); doc["event_seq"] = eventSeq;
  const time_t now = time(nullptr);
  if (now >= 1577836800) doc["occurred_at"] = (int64_t)now;
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
#if TEMP_REFRESH_AUDIT_ENABLED
  // Persist compact facts only. Module hashes are the existing normalized render
  // model; no second renderer is introduced by TEMP_REFRESH_AUDIT.
  const String previous = previousPhysicalHash;
  const String next = SmartRefresh::TEMP_REFRESH_AUDIT_renderHash(desired);
  const bool changed = !previous.length() || previous != next;
  const bool physical = plan.type != SmartDisplayPlan::NONE && displaySucceeded;
  const bool sourceChanged = backendAfter != backendBefore;
  const char* decision = physical ? (changed ? "useful_redraw" : "wasted_redraw")
    : (!changed && sourceChanged ? "filtered_change" : "no_redraw");
  DynamicJsonDocument doc(2048);
  doc["firmware_version"] = firmwareVersion; doc["trigger"] = trigger;
  doc["source"] = sourceModules; doc["module"] = sourceModules;
  JsonObject display = doc.createNestedObject("display_changes");
  display["canonical_modules_before"] = previous; display["canonical_modules_after"] = next;
  doc.createNestedObject("raw_changes"); // Raw snapshots are nullable/unavailable on-device.
  doc["previous_render_hash"] = previous; doc["new_render_hash"] = next;
  doc["render_changed"] = changed; doc["physical_refresh"] = physical;
  doc["refresh_type"] = physical ? (plan.type == SmartDisplayPlan::FULL ? "full" : "partial") : "none";
  JsonArray regions = doc.createNestedArray("dirty_regions");
  for (uint8_t i = 0; i < plan.regionCount; ++i) { JsonObject r = regions.createNestedObject(); r["x"] = plan.regions[i].x; r["y"] = plan.regions[i].y; r["w"] = plan.regions[i].w; r["h"] = plan.regions[i].h; }
  doc["decision"] = decision;
  doc["decision_reason"] = physical ? (changed ? "Physical refresh changed canonical rendered output" : "Physical refresh occurred despite unchanged canonical render hash")
    : (!changed && sourceChanged ? "Source changed but normalized render output was identical" : "Evaluation required no physical display update");
  doc["backend_revision_before"] = backendBefore; doc["backend_revision_after"] = backendAfter;
  doc["battery_percent"] = battery.percent; doc["battery_voltage"] = battery.smoothedVoltage;
  doc["charger_connected"] = chargerConnected; doc["wake_reason"] = wakeReason;
  persistTEMP_REFRESH_AUDIT(doc);
#endif
}

void TempRefreshAudit::TEMP_REFRESH_AUDIT_recordIntentionalRefresh(const char* trigger,
  const char* reason, bool displaySucceeded, const BatteryState& battery,
  bool chargerConnected, const char* wakeReason, const char* firmwareVersion) {
#if TEMP_REFRESH_AUDIT_ENABLED
  DynamicJsonDocument doc(1024);
  doc["firmware_version"] = firmwareVersion; doc["trigger"] = trigger;
  doc["source"] = "local_display"; doc["module"] = "display";
  doc.createNestedObject("raw_changes"); doc.createNestedObject("display_changes");
  doc["previous_render_hash"] = nullptr; doc["new_render_hash"] = nullptr;
  doc["render_changed"] = nullptr; doc["physical_refresh"] = displaySucceeded;
  doc["refresh_type"] = displaySucceeded ? "full" : "none";
  doc.createNestedArray("dirty_regions"); doc["decision"] = "intentional_refresh";
  doc["decision_reason"] = reason; doc["battery_percent"] = battery.percent;
  doc["battery_voltage"] = battery.smoothedVoltage; doc["charger_connected"] = chargerConnected;
  doc["wake_reason"] = wakeReason; JsonObject metadata = doc.createNestedObject("metadata");
  metadata["intentional_refresh"] = true;
  persistTEMP_REFRESH_AUDIT(doc);
#endif
}

void TempRefreshAudit::TEMP_REFRESH_AUDIT_flushPiggyback(const String& token, bool force) {
#if TEMP_REFRESH_AUDIT_ENABLED
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
#endif
}
