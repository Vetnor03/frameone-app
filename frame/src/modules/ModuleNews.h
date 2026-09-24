#pragma once

#include "Types.h"
#include "FrameConfig.h"
#include <Arduino.h>

namespace ModuleNews {
  void setConfig(const FrameConfig* cfg);
  void preload();
  void render(const Cell& c, const String& moduleKey);
}
