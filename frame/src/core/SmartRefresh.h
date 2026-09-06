#pragma once
#include <Arduino.h>
#include <time.h>
#include "Types.h"

enum SmartDeadlineType : uint8_t { SMART_HARD, SMART_SOFT };
struct SmartDeadline { time_t at = 0; SmartDeadlineType type = SMART_SOFT; };
struct SmartModuleState {
  String key;
  String hash;
  Cell bounds{};
  bool partialSafe = false;
  SmartDeadline deadlines[12];
  uint8_t deadlineCount = 0;
};
struct SmartRenderState {
  String layoutHash;
  SmartModuleState modules[MAX_GRID_CELLS];
  uint8_t moduleCount = 0;
};
struct SmartDisplayPlan {
  enum Type : uint8_t { NONE, PARTIAL, FULL } type = NONE;
  Cell regions[MAX_GRID_CELLS];
  uint8_t regionCount = 0;
  bool dirty[MAX_GRID_CELLS]{};
};
struct ContentRevisionState {
  uint64_t revision = 0;
  bool changed = false;
  String affectedModules;
};

namespace SmartRefresh {
  static const uint32_t REVISION_SAFETY_SECONDS = 10 * 60;
  static const uint32_t MANUAL_PROBE_SECONDS = 10;
  static const uint32_t COALESCE_SECONDS = 15 * 60;
  bool probeRevision(const String& token, uint64_t since, ContentRevisionState& out);
  bool fetchRenderState(const String& token, const String& modules, SmartRenderState& out);
  SmartDisplayPlan plan(const SmartRenderState& desired, bool grayscaleMode = false);
  void commitSuccessfulDisplay(const SmartRenderState& desired, const SmartDisplayPlan& plan);
  uint64_t displayedRevision();
  void saveDisplayedRevision(uint64_t revision);
  uint32_t secondsUntilNextWake(const SmartRenderState& state, time_t now,
                                time_t revisionCheckedAt);
  String dueModuleCsv(const SmartRenderState& state, time_t now);
  bool loadScheduler(SmartRenderState& out, time_t& revisionCheckedAt);
  bool saveScheduler(const SmartRenderState& state, time_t revisionCheckedAt);
  void mergeScheduler(SmartRenderState& complete, const SmartRenderState& update,
                      bool screenWide);
  String unionModuleCsv(const String& first, const String& second);
}
