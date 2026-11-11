#pragma once
#include "Arduino.h"
// Exact Adafruit GFX bitmap font structures for offline glyph decoding.
// This is a native TEST adapter, not a replacement for firmware Adafruit_GFX.
typedef struct {
  uint16_t bitmapOffset;
  uint8_t width, height, xAdvance;
  int8_t xOffset, yOffset;
} GFXglyph;
typedef struct {
  uint8_t* bitmap;
  GFXglyph* glyph;
  uint8_t first, last, yAdvance;
} GFXfont;
