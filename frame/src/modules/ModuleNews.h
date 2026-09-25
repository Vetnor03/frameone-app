#pragma once

#include "Types.h"
#include "FrameConfig.h"
#include <Arduino.h>

namespace ModuleNews {
  void setConfig(const FrameConfig* cfg);
  // Refresh only when visible News changes, or the user explicitly
  // requests an update. Unrelated redraws keep cached headlines.
  void invalidate();
  void preload();
  void render(const Cell& c, const String& moduleKey);
}
