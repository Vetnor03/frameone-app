#pragma once
#include <stdint.h>

// Small one-colour engravings for the experimental RE:MIND editorial display.
// Decorative and non-interactive: primary information always wins the space.
namespace EditorialFigures {
// A quiet, one-bit coastal field-guide vignette to match the Date botanical.
// These are hand-drawn contour strokes, not filled weather pictograms. The
// scene is secondary to the condition-specific icon and measured forecast.
enum CoastalSky { COAST_FAIR, COAST_OVERCAST, COAST_WIND, COAST_RAIN, COAST_SNOW };
inline CoastalSky coastalSkyFor(int wmo, float windMs) {
  if ((wmo >= 71 && wmo <= 77) || wmo == 85 || wmo == 86) return COAST_SNOW;
  if ((wmo >= 51 && wmo <= 67) || (wmo >= 80 && wmo <= 82) ||
      wmo >= 95) return COAST_RAIN;
  if (windMs >= 8.0f) return COAST_WIND;
  if (wmo >= 3) return COAST_OVERCAST;
  return COAST_FAIR;
}

template <class Canvas>
inline void weatherCoastalVignette(Canvas& d, int x, int y, int w, int h,
                                    int wmo, float windMs, uint16_t ink) {
  if (w < 110 || h < 70) return;
  // Normalized 140 × 96 field-guide plate, scaled into its reserved cell.
  // The line-only strokes work on both white and black 1-bit e-paper.
  const auto line = [&](int a,int b,int c,int e) {
    d.drawLine(x + a*w/140, y + b*h/96,
               x + c*w/140, y + e*h/96, ink);
  };
  const CoastalSky sky = coastalSkyFor(wmo, windMs);
  // Very low Jæren shoreline with a little wild coastal grass.
  static const uint8_t shore[][4] = {
    {5,70,15,68},{15,68,24,64},{24,64,32,61},
    {32,61,40,63},{40,63,48,68},{48,68,57,70},
    {57,70,75,71},{75,71,93,71},{93,71,115,70},{115,70,135,71},
    {28,61,28,50},{28,56,22,51},{28,54,34,47},
    {24,58,19,57},{31,57,36,54},
    {9,81,29,81},{37,84,61,84},{70,80,101,80},
    {107,85,131,85},{63,89,85,89}
  };
  for (unsigned i=0;i<sizeof(shore)/sizeof(shore[0]);++i)
    line(shore[i][0],shore[i][1],shore[i][2],shore[i][3]);

  // A small sun, drawn as a fine interrupted outline. For clear weather the
  // sun is fully present; with fair cloud it peeks out from behind the bank.
  if (sky == COAST_FAIR) {
    static const uint8_t sun[][4] = {
      {22,27,24,21},{24,21,29,17},{29,17,35,16},
      {35,16,42,19},{42,19,45,25},{45,25,44,31},
      {44,31,40,36},{40,36,34,37},{34,37,27,34},
      {27,34,22,27},{34,10,34,7},{17,26,13,26},
      {46,13,49,10}
    };
    for (unsigned i=0;i<sizeof(sun)/sizeof(sun[0]);++i)
      line(sun[i][0],sun[i][1],sun[i][2],sun[i][3]);
  }

  // Organic cloud bank; segmented curves rather than geometric circles.
  if (wmo != 0 || sky != COAST_FAIR) {
    static const uint8_t cloud[][4] = {
      {54,45,60,43},{60,43,65,42},{65,42,67,36},
      {67,36,71,32},{71,32,77,30},{77,30,83,31},
      {83,31,88,35},{88,35,92,34},{92,34,97,35},
      {97,35,103,38},{103,38,106,43},{106,43,118,45},
      {58,48,76,48},{80,48,102,48},{107,48,118,48},
      {74,27,79,25},{79,25,86,26}
    };
    for (unsigned i=0;i<sizeof(cloud)/sizeof(cloud[0]);++i)
      line(cloud[i][0],cloud[i][1],cloud[i][2],cloud[i][3]);
  }
  if (sky == COAST_OVERCAST) {
    line(60,26,75,22); line(75,22,93,24);
    line(97,27,117,30);
  } else if (sky == COAST_WIND) {
    // Just three interrupted breeze strokes; never a large wind icon.
    line(10,22,25,20); line(30,19,48,20);
    line(95,15,109,13); line(114,14,130,17);
    line(112,57,126,55);
  } else if (sky == COAST_RAIN) {
    line(72,54,68,62);line(86,53,82,61);line(100,54,96,62);
  } else if (sky == COAST_SNOW) {
    line(70,56,76,62);line(76,56,70,62);
    line(87,52,93,58);line(93,52,87,58);
    line(105,57,111,63);line(111,57,105,63);
  }
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
