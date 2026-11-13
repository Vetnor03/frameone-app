#pragma once
#include "Arduino.h"
// Byte-identical Adafruit GFX bitmap metadata, all fonts unscaled.
typedef struct {uint16_t bitmapOffset;uint8_t width,height,xAdvance;int8_t xOffset,yOffset;} GFXglyph;
typedef struct {uint8_t* bitmap;GFXglyph* glyph;uint8_t first,last,yAdvance;} GFXfont;
