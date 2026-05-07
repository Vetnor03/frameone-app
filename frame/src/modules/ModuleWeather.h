#pragma once
#include <Arduino.h>
#include "Types.h"
#include "FrameConfig.h"

namespace ModuleWeather {

  // Parsed config is stored in FrameConfig; we get a pointer each refresh.
  void setConfig(const FrameConfig* cfg);

  // Preload HTTP/JSON data before entering the e-paper paged draw loop.
  void preload(const String& moduleName);

  // moduleName will be "weather" or "weather:<id>" (e.g. "weather:2")
  void render(const Cell& c, const String& moduleName);

} // namespace ModuleWeather
