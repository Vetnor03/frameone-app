#pragma once
#include "Types.h"
#include "FrameConfig.h"

namespace ModuleDateAdaptive {
  void setConfig(const FrameConfig* cfg);
  void render(const Cell& c);
}
