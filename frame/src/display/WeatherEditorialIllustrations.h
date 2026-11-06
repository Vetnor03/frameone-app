#pragma once
#include "DisplayCore.h"
#include "Theme.h"
#include "Types.h"
#include <Arduino.h>
#include <math.h>

// RE:MIND Weather Design vNext — original 1-bit editorial illustration motifs.
// Decorative only: never replaces the actual weather icon or forecast data.
// The asymmetric line work deliberately matches the restrained hand-drawn
// language of Date's botanical motif.
namespace WeatherEditorialIllustrations {

struct Box { int x, y, w, h; };

inline int X(const Box& b, int v) { return b.x + v * b.w / 100; }
inline int Y(const Box& b, int v) { return b.y + v * b.h / 100; }

inline void line(const Box& b, int x0,int y0,int x1,int y1) {
  DisplayCore::get().drawLine(X(b,x0),Y(b,y0),X(b,x1),Y(b,y1),Theme::ink());
}
inline void dot(const Box& b, int x,int y,int r=1) {
  DisplayCore::get().fillCircle(X(b,x),Y(b,y),r,Theme::ink());
}
inline void circle(const Box& b, int x,int y,int rPct) {
  int r=max(1,min(b.w,b.h)*rPct/100);
  DisplayCore::get().drawCircle(X(b,x),Y(b,y),r,Theme::ink());
}

inline void stem(const Box& b, bool windy=false) {
  if (windy) {
    line(b,48,96,44,82); line(b,44,82,39,67); line(b,39,67,32,53);
    line(b,32,53,25,43); line(b,25,43,17,35);
    line(b,39,67,51,58); line(b,51,58,63,54);
    line(b,31,53,43,48); line(b,43,48,55,46);
    line(b,24,43,34,36); line(b,34,36,44,34);
    line(b,50,58,60,52); line(b,60,52,70,53); line(b,70,53,63,60); line(b,63,60,50,58);
    line(b,42,48,51,42); line(b,51,42,61,43); line(b,61,43,55,50); line(b,55,50,42,48);
    line(b,33,36,40,29); line(b,40,29,49,30); line(b,49,30,44,37); line(b,44,37,33,36);
    return;
  }
  line(b,48,97,48,82); line(b,48,82,49,68); line(b,49,68,46,55);
  line(b,46,55,43,43); line(b,43,43,40,30); line(b,40,30,38,16);
  line(b,49,73,61,64); line(b,61,64,70,58);
  line(b,46,58,34,51); line(b,34,51,24,45);
  line(b,43,44,56,37); line(b,56,37,65,29);
  line(b,60,64,69,58); line(b,69,58,78,60); line(b,78,60,72,68); line(b,72,68,60,64);
  line(b,35,51,26,46); line(b,26,46,17,48); line(b,17,48,23,55); line(b,23,55,35,51);
  line(b,55,37,62,29); line(b,62,29,72,28); line(b,72,28,68,37); line(b,68,37,55,37);
}

inline void clearMeadow(const Box& b) {
  stem(b,false);
  circle(b,70,19,9);
  line(b,70,4,70,0); line(b,86,19,94,19); line(b,82,8,88,2);
  line(b,82,30,89,36); line(b,57,7,53,1);
  line(b,15,97,33,92); line(b,31,97,45,93); line(b,52,96,68,91);
}

inline void rainBranch(const Box& b) {
  stem(b,false);
  line(b,76,24,73,34); dot(b,73,36,1);
  line(b,84,39,81,50); dot(b,81,52,1);
  line(b,15,23,12,34); dot(b,12,36,1);
  line(b,13,96,34,92); line(b,34,92,58,94); line(b,58,94,77,90);
}

inline void snowTwig(const Box& b) {
  line(b,48,98,47,81); line(b,47,81,43,64); line(b,43,64,39,49);
  line(b,39,49,34,34); line(b,34,34,31,18);
  line(b,43,66,57,55); line(b,57,55,67,47);
  line(b,39,50,28,42); line(b,28,42,19,34);
  line(b,35,35,47,27); line(b,47,27,56,19);
  const int pts[][2]={{72,18},{78,42},{18,18},{15,58},{61,74},{83,68}};
  for(auto &p:pts){
    dot(b,p[0],p[1],1);
    line(b,p[0]-4,p[1],p[0]+4,p[1]);
    line(b,p[0],p[1]-4,p[0],p[1]+4);
  }
}

inline void mistHills(const Box& b) {
  line(b,6,78,20,66); line(b,20,66,34,72); line(b,34,72,49,57); line(b,49,57,65,69); line(b,65,69,83,54); line(b,83,54,96,62);
  line(b,7,86,27,83); line(b,27,83,48,86); line(b,48,86,70,82); line(b,70,82,94,85);
  line(b,10,42,43,40); line(b,50,42,88,39);
  line(b,3,51,30,49); line(b,38,52,70,50); line(b,77,50,97,48);
  line(b,15,30,39,28); line(b,47,31,76,29);
}

inline void windStem(const Box& b) {
  stem(b,true);
  line(b,56,21,83,17); line(b,63,29,93,26); line(b,70,38,96,36);
}

inline void draw(const Box& b, int wmo, float windMs=0.0f) {
  if(b.w<42 || b.h<48) return;
  if(windMs >= 9.0f) { windStem(b); return; }
  if(wmo==45 || wmo==48) { mistHills(b); return; }
  if((wmo>=71 && wmo<=77) || wmo==85 || wmo==86) { snowTwig(b); return; }
  if((wmo>=51 && wmo<=67) || (wmo>=80 && wmo<=82) || wmo>=95) { rainBranch(b); return; }
  clearMeadow(b);
}

inline bool allowedForCell(const Cell& c) {
  return (c.colSpan==3 && (c.rowSpan==3 || c.rowSpan==4)) ||
         (c.colSpan==4 && c.rowSpan>=2);
}

} // namespace WeatherEditorialIllustrations
