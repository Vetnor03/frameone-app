#pragma once
#include <Arduino.h>
#include "FrameConfig.h"

namespace Theme {
  void set(ThemeKey t);
  ThemeKey get();

  // paper = background color, ink = line/text color
  uint16_t paper();
  uint16_t ink();
}
