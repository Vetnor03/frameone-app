#pragma once

#include "Types.h"
#include "FrameConfig.h"
#include <Arduino.h>

namespace ModuleNews {
  void setConfig(const FrameConfig* cfg);
  // Refresh only when News itself is scheduled, or a user explicitly asks
  // for a manual update. Unrelated screen redraws keep cached headlines.
  void invalidateScheduled(const String& modulesCsv);
  void invalidateManual();
  void preload();
  void render(const Cell& c, const String& moduleKey);
}
