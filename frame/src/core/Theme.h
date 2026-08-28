#pragma once
#include <Arduino.h>
#include "FrameConfig.h"

namespace Theme {
  void set(ThemeKey t);
  ThemeKey get();

  // Semantic frame palette. E-paper is currently monochrome, but callers use
  // roles rather than physical pigments so every shared renderer follows the
  // selected frame theme.
  uint16_t background();
  uint16_t foreground();
  uint16_t secondaryText();
  uint16_t divider();
  uint16_t fill();
  uint16_t onFill();

  // Backwards-compatible names for existing module drawing code.
  uint16_t paper();
  uint16_t ink();
}
