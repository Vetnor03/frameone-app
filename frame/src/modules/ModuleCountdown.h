#pragma once
#include <Arduino.h>
#include "Types.h"
#include "FrameConfig.h"

namespace ModuleCountdown {

  void setConfig(const FrameConfig* cfg);

  // single-instance for now: "countdown"
  void render(const Cell& c, const String& moduleName);

}