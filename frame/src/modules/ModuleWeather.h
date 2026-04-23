#pragma once
#include <Arduino.h>
#include "Types.h"
#include "FrameConfig.h"

namespace ModuleWeather {

  // Parsed config is stored in FrameConfig; we get a pointer each refresh.
  void setConfig(const FrameConfig* cfg);

  // moduleName will be "weather" or "weather:<id>" (e.g. "weather:2")
  void render(const Cell& c, const String& moduleName);

} // namespace ModuleWeather
