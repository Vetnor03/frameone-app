#include "EditorialText.h"

#include "FrameText.h"
#include <Arduino.h>
#include <limits.h>
#include <string.h>

namespace EditorialText {
namespace {

bool supported(const GFXfont* font) {
  if (!font) return false;
  const uint16_t first = pgm_read_word(&font->first);
  const uint16_t last = pgm_read_word(&font->last);
  const GFXglyph* glyphs =
      static_cast<const GFXglyph*>(pgm_read_ptr(&font->glyph));
  return glyphs && first >= 0x20 && last >= first && last <= 0xFF;
}

int32_t alignedStart(int32_t start, int32_t extent, int32_t inkExtent,
                     uint8_t align) {
  if (align == 1) return start + (extent - inkExtent) / 2;
  if (align == 2) return start + extent - inkExtent;
  return start;
}
}  // namespace

Status measureLine(const GFXfont* font, const char* latin1,
                   LineMetrics& result) {
  result = {};
  if (!latin1 || !supported(font)) return Status::INVALID_ARGUMENT;

  const uint16_t first = pgm_read_word(&font->first);
  const uint16_t last = pgm_read_word(&font->last);
  const GFXglyph* glyphs =
      static_cast<const GFXglyph*>(pgm_read_ptr(&font->glyph));
  result.lineAdvance = pgm_read_byte(&font->yAdvance);

  bool hasInk = false;
  int32_t minX = INT32_MAX, minY = INT32_MAX;
  int32_t maxX = INT32_MIN, maxY = INT32_MIN;
  int32_t cursor = 0;

  for (const unsigned char* p =
           reinterpret_cast<const unsigned char*>(latin1); *p; ++p) {
    if (*p < first || *p > last) return Status::UNSUPPORTED_GLYPH;
    const GFXglyph* glyph = glyphs + (*p - first);
    const int32_t width = pgm_read_byte(&glyph->width);
    const int32_t height = pgm_read_byte(&glyph->height);
    const int32_t advance = pgm_read_byte(&glyph->xAdvance);
    const int32_t xOffset = static_cast<int8_t>(pgm_read_byte(&glyph->xOffset));
    const int32_t yOffset = static_cast<int8_t>(pgm_read_byte(&glyph->yOffset));
    if (width && height) {
      const int32_t left = cursor + xOffset;
      const int32_t right = left + width;
      const int32_t bottom = yOffset + height;
      if (!hasInk || left < minX) minX = left;
      if (!hasInk || yOffset < minY) minY = yOffset;
      if (!hasInk || right > maxX) maxX = right;
      if (!hasInk || bottom > maxY) maxY = bottom;
      hasInk = true;
    }
    // A caller may provide an extremely long string directly. Refuse integer
    // overflow instead of reporting apparently valid (wrapped) ink bounds.
    if (cursor > INT32_MAX - advance) return Status::INVALID_ARGUMENT;
    cursor += advance;
  }
  result.advanceX = cursor;
  if (!hasInk) return Status::EMPTY;
  result.minX = minX;
  result.minY = minY;
  result.inkWidth = maxX - minX;
  result.inkHeight = maxY - minY;
  return Status::OK;
}

Status planLine(const GFXfont* font, const char* utf8,
                char* scratch, size_t scratchSize,
                const Rect& area, int32_t inset,
                Horizontal horizontal, Vertical vertical,
                LinePlan& result) {
  result = {};
  if (!font || !utf8 || !scratch || !scratchSize ||
      area.w <= 0 || area.h <= 0 || inset < 0 ||
      area.w > INT32_MAX / 2 || area.h > INT32_MAX / 2 ||
      inset > area.w / 2 || inset > area.h / 2) {
    return Status::INVALID_ARGUMENT;
  }
  scratch[0] = 0;

  // Existing normalizer guarantees output <= input bytes (including U+2026
  // -> "..."), so accepting only a strictly shorter source is fail-closed.
  if (strlen(utf8) >= scratchSize) return Status::BUFFER_TOO_SMALL;
  FrameText::normalizeUtf8ForDisplay(scratch, scratchSize, utf8);
  if (!scratch[0]) return Status::EMPTY;
  LineMetrics m;
  const Status measured = measureLine(font, scratch, m);
  if (measured != Status::OK) return measured;

  const int32_t usableWidth = area.w - 2 * inset;
  const int32_t usableHeight = area.h - 2 * inset;
  if (m.inkWidth > usableWidth || m.inkHeight > usableHeight ||
      m.inkWidth <= 0 || m.inkHeight <= 0) return Status::DOES_NOT_FIT;

  const int32_t left =
      alignedStart(area.x + inset, usableWidth, m.inkWidth,
                   static_cast<uint8_t>(horizontal));
  const int32_t top =
      alignedStart(area.y + inset, usableHeight, m.inkHeight,
                   static_cast<uint8_t>(vertical));
  // Unlike centering the cursor or advance, this centers the *visible ink*
  // after accounting for negative x/y glyph bearings.
  result.cursorX = left - m.minX;
  result.baselineY = top - m.minY;
  result.ink = {left, top, m.inkWidth, m.inkHeight};
  result.metrics = m;
  return Status::OK;
}

}  // namespace EditorialText
