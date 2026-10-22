#pragma once
#include <stdint.h>

// Small one-colour engravings for the experimental RE:MIND editorial display.
// Decorative and non-interactive: primary information always wins the space.
namespace EditorialFigures {
// Preserve sky classification; precipitation has priority over wind.
enum CoastalSky { COAST_FAIR, COAST_OVERCAST, COAST_WIND, COAST_RAIN, COAST_SNOW };
inline CoastalSky coastalSkyFor(int wmo, float windMs) {
  if ((wmo >= 71 && wmo <= 77) || wmo == 85 || wmo == 86) return COAST_SNOW;
  if ((wmo >= 51 && wmo <= 67) || (wmo >= 80 && wmo <= 82) ||
      wmo >= 95) return COAST_RAIN;
  if (windMs >= 8.0f) return COAST_WIND;
  if (wmo >= 3) return COAST_OVERCAST;
  return COAST_FAIR;
}

// Weather v2: organic fine-line coastal engraving, matched to Date's plant.
// Each row is one hand-composed cubic Bézier stroke (start, handles, end) on
// a 140×96 plate. Curves are approximated with small integer segments so
// hardware remains strictly one-bit, deterministic and allocation-free.
template <class Canvas>
inline void drawCoastalCurves(Canvas& d, int x, int y, int w, int h,
                              const uint8_t (*curves)[8], unsigned count,
                              uint16_t ink) {
  const int steps=12;
  const int denom=steps*steps*steps;
  for (unsigned k=0; k<count; ++k) {
    const uint8_t* c=curves[k];
    int px=x+c[0]*w/140, py=y+c[1]*h/96;
    for(int i=1;i<=steps;++i) {
      const int a=steps-i,b=i;
      const int u=a*a*a,v=3*a*a*b,z=3*a*b*b,t=b*b*b;
      const int nx=(c[0]*u+c[2]*v+c[4]*z+c[6]*t);
      const int ny=(c[1]*u+c[3]*v+c[5]*z+c[7]*t);
      const int qx=x+(nx*w+(denom*140)/2)/(denom*140);
      const int qy=y+(ny*h+(denom*96)/2)/(denom*96);
      if(qx!=px||qy!=py)d.drawLine(px,py,qx,qy,ink);
      px=qx;py=qy;
    }
  }
}

template <class Canvas>
inline void weatherCoastalVignette(Canvas& d, int x, int y, int w, int h,
                                   int wmo, float windMs, uint16_t ink) {
  if(w<110 || h<70) return;
  const CoastalSky sky=coastalSkyFor(wmo,windMs);
  // The slim foreground grasses and long dune are one continuous silhouette.
  static const uint8_t shore[][8] = {
    {7,80,16,78,23,72,31,70},
    {31,70,43,66,51,73,62,75},
    {62,75,83,78,101,76,133,73},
    {11,86,24,85,33,83,48,85},
    {63,87,81,86,92,88,111,85},
    {119,89,124,88,132,88,137,86},
    {32,70,30,57,23,43,31,26},
    {31,26,34,20,39,17,47,16},
    {28,59,22,52,17,47,10,46},
    {10,46,16,45,23,48,28,54},
    {29,49,34,41,42,34,51,33},
    {51,33,47,40,39,46,31,51},
    {30,65,21,61,18,59,12,58},
    {34,58,39,55,45,53,51,53},
    {31,34,34,33,38,30,39,27},
    {38,20,41,21,44,21,46,20}
  };
  drawCoastalCurves(d,x,y,w,h,shore,sizeof(shore)/sizeof(shore[0]),ink);
  // No cartoon round sun or closed "bumpy" cloud outline.
  // A clear sky is mostly negative space. Partly cloudy keeps one airy bank.
  if (wmo!=0) {
  static const uint8_t cloud[][8] = {
    {58,39,69,38,73,30,84,29},
    {84,29,96,26,104,30,114,30},
    {114,30,126,30,131,35,137,37},
    {72,46,91,44,105,44,124,46},
    {84,23,96,21,101,23,112,26}
  };
    drawCoastalCurves(d,x,y,w,h,cloud,sizeof(cloud)/sizeof(cloud[0]),ink);
  }
  if(sky==COAST_FAIR) {
  static const uint8_t fair[][8] = {
    {69,18,82,16,90,18,101,20},
    {105,21,110,22,117,22,121,23}
  };
    drawCoastalCurves(d,x,y,w,h,fair,sizeof(fair)/sizeof(fair[0]),ink);
  } else if(sky==COAST_OVERCAST) {
  static const uint8_t overcast[][8] = {
    {56,30,66,28,75,22,90,23},
    {90,23,106,22,117,26,132,30},
    {65,53,84,51,104,53,127,51}
  };
    drawCoastalCurves(d,x,y,w,h,overcast,sizeof(overcast)/sizeof(overcast[0]),ink);
  } else if(sky==COAST_WIND) {
  static const uint8_t wind[][8] = {
    {8,27,22,23,34,25,46,24},
    {65,15,81,12,102,13,120,17},
    {106,57,116,54,126,55,135,52}
  };
    drawCoastalCurves(d,x,y,w,h,wind,sizeof(wind)/sizeof(wind[0]),ink);
  } else if(sky==COAST_RAIN) {
  static const uint8_t rain[][8] = {
    {79,53,78,56,76,60,74,64},
    {95,52,93,55,90,59,89,63},
    {111,54,110,56,108,59,107,62}
  };
    drawCoastalCurves(d,x,y,w,h,rain,sizeof(rain)/sizeof(rain[0]),ink);
  } else if(sky==COAST_SNOW) {
  static const uint8_t snow[][8] = {
    {77,56,79,58,81,60,83,62},
    {83,56,81,58,79,60,77,62},
    {96,53,98,55,100,57,102,59},
    {102,53,100,55,98,57,96,59},
    {114,57,116,59,118,61,120,63},
    {120,57,118,59,116,61,114,63}
  };
    drawCoastalCurves(d,x,y,w,h,snow,sizeof(snow)/sizeof(snow[0]),ink);
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
