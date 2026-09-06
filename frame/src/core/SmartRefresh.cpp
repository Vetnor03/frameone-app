#include "SmartRefresh.h"
#include "Config.h"
#include "DeviceIdentity.h"
#include "NetClient.h"
#include <ArduinoJson.h>
#include <Preferences.h>
#include <inttypes.h>

namespace {
Preferences prefs;
String keyFor(const String& module) {
  uint32_t hash = 2166136261u;
  for (size_t i = 0; i < module.length(); ++i) { hash ^= (uint8_t)module[i]; hash *= 16777619u; }
  char key[14]; snprintf(key, sizeof(key), "rh_%08lx", (unsigned long)hash); return String(key);
}
bool overlapOrNear(const Cell& a, const Cell& b) {
  const int gap = 8;
  return a.x <= b.x + b.w + gap && b.x <= a.x + a.w + gap &&
         a.y <= b.y + b.h + gap && b.y <= a.y + a.h + gap;
}
Cell unite(const Cell& a, const Cell& b) {
  Cell c = a; int right = max(a.x + a.w, b.x + b.w), bottom = max(a.y + a.h, b.y + b.h);
  c.x = min(a.x, b.x); c.y = min(a.y, b.y); c.w = right - c.x; c.h = bottom - c.y; return c;
}
}

bool SmartRefresh::probeRevision(const String& token, uint64_t since, ContentRevisionState& out) {
  char revisionText[24]; snprintf(revisionText, sizeof(revisionText), "%" PRIu64, since);
  String url = String(BASE_URL) + "/api/device/content-revision?device_id=" + DeviceIdentity::getDeviceId() + "&since=" + revisionText;
  int code = 0; String body;
  if (!NetClient::httpGetAuth(url, token, code, body) || code != 200) return false;
  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, body) || !doc["revision"].is<uint64_t>()) return false;
  out.revision = doc["revision"].as<uint64_t>(); out.changed = doc["changed"] == true;
  out.affectedModules = "";
  for (JsonVariant value : doc["affected_modules"].as<JsonArray>()) {
    if (out.affectedModules.length()) out.affectedModules += ',';
    out.affectedModules += String(value.as<const char*>());
  }
  return true;
}

bool SmartRefresh::fetchRenderState(const String& token, const String& modules, SmartRenderState& out) {
  String url = String(BASE_URL) + "/api/device/render-state?device_id=" + DeviceIdentity::getDeviceId() + "&modules=" + modules;
  int code = 0; String body;
  if (!NetClient::httpGetAuth(url, token, code, body) || code != 200 || body.length() > 16384) return false;
  DynamicJsonDocument doc(16384);
  if (deserializeJson(doc, body)) return false;
  out.layoutHash = String((const char*)(doc["layout_hash"] | "")); out.moduleCount = 0;
  for (JsonObject item : doc["modules"].as<JsonArray>()) {
    if (out.moduleCount >= MAX_GRID_CELLS) break;
    SmartModuleState& module = out.modules[out.moduleCount++];
    module.key = String((const char*)(item["key"] | "")); module.hash = String((const char*)(item["render_hash"] | ""));
    module.bounds.x = item["bounds"]["x"] | 0; module.bounds.y = item["bounds"]["y"] | 0;
    module.bounds.w = item["bounds"]["w"] | 0; module.bounds.h = item["bounds"]["h"] | 0;
    module.partialSafe = item["partial_safe"] == true; module.deadlineCount = 0;
    for (JsonObject deadline : item["deadlines"].as<JsonArray>()) {
      if (module.deadlineCount >= 12) break;
      SmartDeadline& target = module.deadlines[module.deadlineCount++];
      target.at = (time_t)(deadline["at"].as<uint64_t>() / 1000ULL);
      target.type = String((const char*)(deadline["type"] | "soft")) == "hard" ? SMART_HARD : SMART_SOFT;
    }
  }
  return true;
}

SmartDisplayPlan SmartRefresh::plan(const SmartRenderState& desired, bool grayscaleMode) {
  SmartDisplayPlan result; prefs.begin("smart_refresh", true);
  const String oldLayout = prefs.getString("layout", "");
  uint32_t partialCount = prefs.getUInt("partial_n", 0), dirtyArea = prefs.getUInt("dirty_area", 0);
  prefs.end();
  if (!oldLayout.length() || oldLayout != desired.layoutHash) result.type = SmartDisplayPlan::FULL;
  uint32_t addedArea = 0;
  for (uint8_t i = 0; i < desired.moduleCount; ++i) {
    const SmartModuleState& module = desired.modules[i];
    prefs.begin("smart_refresh", true); String shown = prefs.getString(keyFor(module.key).c_str(), ""); prefs.end();
    result.dirty[i] = shown != module.hash;
    if (!result.dirty[i]) continue;
    addedArea += module.bounds.w * module.bounds.h;
    if (grayscaleMode || !module.partialSafe) result.type = SmartDisplayPlan::FULL;
    if (result.regionCount && overlapOrNear(result.regions[result.regionCount - 1], module.bounds))
      result.regions[result.regionCount - 1] = unite(result.regions[result.regionCount - 1], module.bounds);
    else result.regions[result.regionCount++] = module.bounds;
  }
  if (result.type != SmartDisplayPlan::FULL && (partialCount >= 20 || dirtyArea + addedArea >= 3UL * 800UL * 480UL)) result.type = SmartDisplayPlan::FULL;
  if (result.type != SmartDisplayPlan::FULL) result.type = result.regionCount ? SmartDisplayPlan::PARTIAL : SmartDisplayPlan::NONE;
  if (result.type == SmartDisplayPlan::FULL) { result.regionCount = 1; result.regions[0] = Cell{0, 0, 800, 480, 0, 0, 0, 4, 4, CELL_XL}; }
  return result;
}

void SmartRefresh::commitSuccessfulDisplay(const SmartRenderState& desired, const SmartDisplayPlan& plan) {
  if (plan.type == SmartDisplayPlan::NONE) return;
  prefs.begin("smart_refresh", false);
  prefs.putString("layout", desired.layoutHash);
  for (uint8_t i = 0; i < desired.moduleCount; ++i) if (plan.type == SmartDisplayPlan::FULL || plan.dirty[i]) prefs.putString(keyFor(desired.modules[i].key).c_str(), desired.modules[i].hash);
  if (plan.type == SmartDisplayPlan::FULL) { prefs.putUInt("partial_n", 0); prefs.putUInt("dirty_area", 0); }
  else { prefs.putUInt("partial_n", prefs.getUInt("partial_n", 0) + 1); uint32_t area = 0; for (uint8_t i = 0; i < plan.regionCount; ++i) area += plan.regions[i].w * plan.regions[i].h; prefs.putUInt("dirty_area", prefs.getUInt("dirty_area", 0) + area); }
  prefs.end();
}
uint64_t SmartRefresh::displayedRevision() { prefs.begin("smart_refresh", true); uint64_t value = prefs.getULong64("revision", 0); prefs.end(); return value; }
void SmartRefresh::saveDisplayedRevision(uint64_t value) { prefs.begin("smart_refresh", false); prefs.putULong64("revision", value); prefs.end(); }

uint32_t SmartRefresh::secondsUntilNextWake(const SmartRenderState& state, time_t now, time_t revisionCheckedAt) {
  time_t next = revisionCheckedAt + REVISION_SAFETY_SECONDS;
  for (uint8_t i = 0; i < state.moduleCount; ++i) for (uint8_t j = 0; j < state.modules[i].deadlineCount; ++j) {
    const SmartDeadline& deadline = state.modules[i].deadlines[j];
    if (deadline.at > now && deadline.at < next) next = deadline.at; // hard is never delayed; soft establishes/coalesces this wake.
  }
  if (next <= now) return 1;
  return (uint32_t)(next - now);
}

String SmartRefresh::dueModuleCsv(const SmartRenderState& state, time_t now) {
  String result;
  for (uint8_t i = 0; i < state.moduleCount; ++i) {
    bool due = false;
    for (uint8_t j = 0; j < state.modules[i].deadlineCount; ++j) {
      const SmartDeadline& d = state.modules[i].deadlines[j];
      if (d.at <= now || (d.type == SMART_SOFT && d.at <= now + COALESCE_SECONDS)) { due = true; break; }
    }
    if (due) { if (result.length()) result += ','; result += state.modules[i].key; }
  }
  return result;
}
