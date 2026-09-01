#pragma once
#include <Arduino.h>
#include "Types.h"
#include "FrameConfig.h"

namespace ModuleReminders {

  enum DisplayProfileMask : uint8_t { PROFILE_COMPACT = 1, PROFILE_STANDARD = 2, PROFILE_SPACIOUS = 4 };

  void setConfig(const FrameConfig* cfg);
  uint8_t profileForCell(const Cell& cell);
  void setRequiredProfiles(uint8_t mask);
  void preload();

  // single-instance for now: "reminders"
  // later we can support "reminders:2" if needed
  void render(const Cell& c, const String& moduleName);

}
