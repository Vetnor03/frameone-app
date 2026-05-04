#pragma once
#include <Arduino.h>
#include "../core/LayoutCells.h"
#include "../core/FrameConfig.h"

namespace ModuleGroceries {
  void begin(const FrameConfig* cfg);
  void render(const Cell& c, const String& moduleName);
}
