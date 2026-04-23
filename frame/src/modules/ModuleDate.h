#pragma once
#include "Types.h"
#include "FrameConfig.h"

namespace ModuleDate {
  // Give ModuleDate access to parsed module config (holidays, country, etc.)
  void setConfig(const FrameConfig* cfg);

  // Render date module inside a given cell
  void render(const Cell& c);
}
