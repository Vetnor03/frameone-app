#pragma once
#include <stdint.h>

// Small one-colour engravings for the experimental RE:MIND editorial display.
// Decorative and non-interactive: primary information always wins the space.
namespace EditorialFigures {
template <class Canvas>
inline void weatherLandscape(Canvas& d, int x, int y, int w, int h,
                             int wmo, uint16_t ink) {
  if (w < 86 || h < 52) return;
  // Coordinates stay inside the caller-provided box.
  const int horizon = y + (h * 66) / 100;
  const int sunX = x + w * 25 / 100;
  const int sunY = y + h * 28 / 100;
  const int sunR = (h < 80 ? 8 : 11);
  const bool rainy = (wmo >= 51 && wmo <= 67) ||
                     (wmo >= 80 && wmo <= 82) || wmo >= 95;
  const bool snowy = wmo >= 71 && wmo <= 77;
  const bool overcast = wmo >= 3 && !rainy && !snowy;
  if (!overcast && !rainy && !snowy) {
    d.drawCircle(sunX, sunY, sunR, ink);
    const int rays = sunR + 4;
    d.drawLine(sunX - rays - 6, sunY, sunX - rays, sunY, ink);
    d.drawLine(sunX + rays, sunY, sunX + rays + 6, sunY, ink);
    d.drawLine(sunX, sunY - rays - 6, sunX, sunY - rays, ink);
    d.drawLine(sunX, sunY + rays, sunX, sunY + rays + 4, ink);
  }
  // Light cloud silhouette is deliberately not filled; no gray/halftone.
  if (wmo >= 2 || overcast || rainy || snowy) {
    const int cloudX = x + w * 48 / 100;
    const int cloudY = y + h * 27 / 100;
    d.drawLine(cloudX-15, cloudY+9, cloudX+28, cloudY+9, ink);
    d.drawCircle(cloudX-5, cloudY+4, 9, ink);
    d.drawCircle(cloudX+9, cloudY, 13, ink);
    d.drawCircle(cloudX+24, cloudY+5, 8, ink);
    if (rainy || snowy) for (int i=0;i<3;i++) {
      const int ax=cloudX-2+i*13;
      if (rainy) d.drawLine(ax, cloudY+19, ax-4, cloudY+27, ink);
      else { d.drawLine(ax-2,cloudY+21,ax+2,cloudY+25,ink);
             d.drawLine(ax+2,cloudY+21,ax-2,cloudY+25,ink); }
    }
  }
  // Nordic hillside and soft sea: decorative but recognizable at 1-bit.
  d.drawLine(x+4,horizon,x+w/5,horizon-h/10,ink);
  d.drawLine(x+w/5,horizon-h/10,x+w/3,horizon-h/14,ink);
  d.drawLine(x+w/3,horizon-h/14,x+w/2,horizon-h/5,ink);
  d.drawLine(x+w/2,horizon-h/5,x+w*2/3,horizon-h/12,ink);
  d.drawLine(x+w*2/3,horizon-h/12,x+w-4,horizon,ink);
  d.drawLine(x+4,horizon+6,x+w-4,horizon+6,ink);
  d.drawLine(x+w/12,horizon+12,x+w/3,horizon+12,ink);
  d.drawLine(x+w/2,horizon+12,x+w*9/10,horizon+12,ink);
}
// Small botanical sprig, inspired by vintage field guides and bookplates.
// Every point stays inside the allocated rectangle. Never overlay useful text.
template <class Canvas>
inline void botanicalSprig(Canvas& d, int x, int y, int w, int h, uint16_t ink) {
  if (w < 72 || h < 60) return;
  const int stemX = x + w/2;
  const int baseY = y + h - 3;
  const int middleY = y + h * 54 / 100;
  const int crownY = y + h * 12 / 100;
  d.drawLine(stemX, baseY, stemX-2, middleY, ink);
  d.drawLine(stemX-2, middleY, stemX+2, crownY, ink);
  // Paired, outlined leaves: neither large solids nor delicate gray strokes.
  for (int index=0; index<3; ++index) {
    const int by = y + h * (72 - index * 20) / 100;
    const int sign = index % 2 ? 1 : -1;
    const int fromX = stemX - (index ? 1 : 0);
    const int branchX = fromX + sign * (w/5);
    const int tipX = fromX + sign * (w/3);
    const int tipY = by - h/5;
    d.drawLine(fromX, by, branchX, by - h/11, ink);
    d.drawLine(fromX, by, tipX, tipY, ink);
    d.drawLine(tipX, tipY, fromX + sign * (w/4), by - h/16, ink);
    d.drawLine(fromX + sign * (w/4), by - h/16, fromX, by, ink);
    const int otherX = fromX - sign*(w/4);
    const int otherTipY = by - h/8;
    d.drawLine(fromX, by - h/12, otherX, otherTipY, ink);
    d.drawLine(otherX, otherTipY, fromX - sign * (w/6), by + h/24, ink);
    d.drawLine(fromX - sign * (w/6), by + h/24, fromX, by - h/12, ink);
  }
  d.drawLine(stemX - 7, baseY, stemX + 7, baseY, ink);
}
} // namespace EditorialFigures
