#pragma once
#include <stdint.h>
// Same layout and data types as Adafruit_GFX's GFX font structures.
struct GFXglyph {
  uint16_t bitmapOffset;
  uint8_t width,height,xAdvance;
  int8_t xOffset,yOffset;
};
struct GFXfont {
  uint8_t* bitmap;
  GFXglyph* glyph;
  uint16_t first,last;
  uint8_t yAdvance;
};
