#pragma once
#include <Arduino.h>
#include "Types.h"
#include "FrameConfig.h"

namespace ModuleGroceries {

  // Kept consistent with other modules.
  void setConfig(const FrameConfig* cfg);

  // Groceries has one unnumbered instance; moduleName is currently unused.
  void render(const Cell& c, const String& moduleName);

} // namespace ModuleGroceries
