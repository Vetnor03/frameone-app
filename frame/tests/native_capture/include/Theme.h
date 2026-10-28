#pragma once
// Host-only deterministic light/dark theme. No global production Theme calls.
#include "FrameConfig.h"
namespace NativeCapture {extern bool dark;}
namespace Theme {
  inline void set(ThemeKey theme){NativeCapture::dark=(theme==THEME_DARK);}
  inline ThemeKey get(){return NativeCapture::dark?THEME_DARK:THEME_LIGHT;}
  inline uint16_t paper(){return NativeCapture::dark?0:0xffff;}
  inline uint16_t ink(){return NativeCapture::dark?0xffff:0;}
}
