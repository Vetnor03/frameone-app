#pragma once
#include <Arduino.h>
#include "Types.h"
#include "FrameConfig.h"

namespace ModuleGroceries {

  // Kept consistent with other modules.
  void setConfig(const FrameConfig* cfg);

  // Preload HTTP/JSON data before entering the e-paper paged draw loop.
  void preload();

  // moduleName supports "groceries" and "groceries:<id>" (id currently ignored).
  void render(const Cell& c, const String& moduleName);

} // namespace ModuleGroceries
