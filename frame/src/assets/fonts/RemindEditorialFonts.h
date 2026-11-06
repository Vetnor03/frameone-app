#pragma once
// F1 opt-in: not imported by ModuleRenderer or any existing module.
// Original screen-6 GFX font assets use 0x20..0xFF Latin-1, not UTF-8.
// Full license notices in licenses/Fraunces-OFL.txt and DM-Sans-OFL.txt.
#include <Adafruit_GFX.h>
namespace RemindEditorialFonts {
const GFXfont* fraunces72();
const GFXfont* fraunces48();
const GFXfont* dm24();
const GFXfont* dm18();
}
