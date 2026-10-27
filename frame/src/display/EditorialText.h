#pragma once
// F2 opt-in text measurement and placement. Does NOT change the active renderer.
// Coordinates are real display pixels, not typographic points.
#include <stddef.h>
#include <stdint.h>
#include <Adafruit_GFX.h>

namespace EditorialText {

struct Rect {
  int32_t x, y, w, h;
  // ESP32 Arduino builds under GNU++11; keep aggregate-style calls valid.
  Rect(int32_t left = 0, int32_t top = 0,
       int32_t width = 0, int32_t height = 0)
      : x(left), y(top), w(width), h(height) {}
};

enum class Horizontal : uint8_t { LEFT, CENTER, RIGHT };
enum class Vertical : uint8_t { TOP, CENTER, BOTTOM };
enum class Status : uint8_t {
  OK, EMPTY, INVALID_ARGUMENT, BUFFER_TOO_SMALL, UNSUPPORTED_GLYPH, DOES_NOT_FIT
};

struct LineMetrics {
  // Visible ink relative to the baseline cursor, including signed bearings.
  int32_t minX = 0;
  int32_t minY = 0;
  int32_t inkWidth = 0;
  int32_t inkHeight = 0;
  // Sum of GFX glyph xAdvance; it is NOT necessarily equal to inkWidth.
  int32_t advanceX = 0;
  int32_t lineAdvance = 0;  // font yAdvance, not pixels-per-point
};

struct LinePlan {
  int32_t cursorX = 0;
  int32_t baselineY = 0;
  Rect ink;
  LineMetrics metrics;
};

// Input MUST already use the normalizer's single-byte display encoding.
// A single line only; no silent glyph substitution, clipping, or wrapping.
Status measureLine(const GFXfont* font, const char* latin1,
                   LineMetrics& result);

// Normalizes using existing FrameText::normalizeUtf8ForDisplay before measuring.
// Scratch is caller-owned (no heap). Any input that might truncate the scratch
// buffer is rejected, even if normalization would have shortened that input.
// Caller draws the returned NUL-terminated scratch only on Status::OK, using
// the exact returned cursor and font, setTextSize(1), setTextWrap(false).
// Does not mutate a display, global font selection, or the Surf renderer.
Status planLine(const GFXfont* font, const char* utf8,
                char* scratch, size_t scratchSize,
                const Rect& area, int32_t inset,
                Horizontal horizontal, Vertical vertical,
                LinePlan& result);

}  // namespace EditorialText
