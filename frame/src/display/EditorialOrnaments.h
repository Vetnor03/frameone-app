#pragma once
#include <stdint.h>

// Deliberately tiny 1-bit line art: no bitmaps, heap allocations or grayscale.
// Used for long *section* dividers, not internal list rows or narrow grid edges.
// Any GFX-compatible canvas with drawLine/drawCircle can draw this.
namespace EditorialOrnaments {

template<class Canvas>
inline void horizontal(Canvas& d, int x0, int y, int x1,
                       uint16_t ink, bool ornament) {
  if (x1 <= x0) return;
  if (!ornament || x1 - x0 < 600) {
    d.drawLine(x0, y, x1, y, ink);
    return;
  }
  const int center = x0 + (x1 - x0) / 2;
  const int width = 33;
  d.drawLine(x0, y, center - width, y, ink);
  d.drawLine(center + width, y, x1, y, ink);
  // Restrained old-book flourish: mirrored leaves and a small centre jewel.
  d.drawCircle(center, y, 3, ink);
  for (int sign = -1; sign <= 1; sign += 2) {
    const int sx = center + sign * 10;
    const int tip = center + sign * 25;
    d.drawLine(sx, y, tip, y - 5, ink);
    d.drawLine(sx, y, tip, y + 5, ink);
    d.drawLine(tip, y - 5, center + sign * 18, y - 6, ink);
    d.drawLine(tip, y + 5, center + sign * 18, y + 6, ink);
    d.drawLine(center + sign * 18, y - 6, sx, y, ink);
    d.drawLine(center + sign * 18, y + 6, sx, y, ink);
  }
}

} // namespace EditorialOrnaments
