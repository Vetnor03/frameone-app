#pragma once
#include "Arduino.h"
// Test-only, byte-exact GFX bitmap/glyph structure used by original font data.
typedef struct {uint16_t bitmapOffset;uint8_t width,height,xAdvance;int8_t xOffset,yOffset;} GFXglyph;
typedef struct {uint8_t* bitmap;GFXglyph* glyph;uint8_t first,last,yAdvance;} GFXfont;
