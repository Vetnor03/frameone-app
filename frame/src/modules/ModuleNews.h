#pragma once

#include "Types.h"
#include "FrameConfig.h"
#include <Arduino.h>
#include <ArduinoJson.h>

namespace ModuleNews {
  void setConfig(const FrameConfig* cfg);
  // Refresh only when visible News changes, or the user explicitly
  // requests an update. Unrelated redraws keep cached headlines.
  void invalidate();
  // Atomically adopt the exact titles used for the backend render hash.
  // Called only by the scheduled/manual render-state request, not cheap probes.
  bool adoptRenderStateSnapshot(JsonVariantConst snapshot);
  void preload();
  void render(const Cell& c, const String& moduleKey);
}
