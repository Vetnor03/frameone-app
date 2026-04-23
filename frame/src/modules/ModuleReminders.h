#pragma once
#include <Arduino.h>
#include "Types.h"
#include "FrameConfig.h"

namespace ModuleReminders {

  void setConfig(const FrameConfig* cfg);

  // single-instance for now: "reminders"
  // later we can support "reminders:2" if needed
  void render(const Cell& c, const String& moduleName);

}