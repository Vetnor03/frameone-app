#pragma once
// R3 opt-in F2 bridge. This file is not included by active ModuleDate/Surf.
// Actual GFX ink metrics are taken from the original screen-6 bitmap fonts.
#include "DateRolePlanner.h"
#include "EditorialText.h"
#include <Adafruit_GFX.h>
#include <stdint.h>

namespace DateF2Ink {
struct Text {
  const GFXfont* font;
  // Exact one-byte text paired with glyph positions and cursor; NEVER partial.
  char latin1[96];
  EditorialText::LinePlan line;
};
struct Result {
  bool valid;
  DateRolePlanner::Plan geometry;
  Text day, month, weekday;
  uint8_t dayVariant, monthVariant, weekdayVariant;
};
// All-or-nothing: caller must draw ONLY on success. Failure preserves legacy Date.
// The API accepts actual pixel-cell bounds, not colSpan/rowSpan or named sizes.
bool planWholeDate(const DateRolePlanner::Rect& cell, int day,
                   const char* monthUtf8, const char* weekdayUtf8,
                   Result& output);
}
