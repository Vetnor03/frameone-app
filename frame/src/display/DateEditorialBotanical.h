#pragma once
// R4 Date-only: single SOURCE of deterministic original 1-bit botanical ink.
// The line coordinates are intentionally hand-drawn and asymmetric. Do not
// SVG-smooth or independently repaint this art in browser/QA simulations.
// This optional motif is never used if actual dated holiday rows need the area.
// Not a frame capture, waveform proof or production design approval.
#include <stdint.h>
#include "DateRolePlanner.h"

namespace DateEditorialBotanical {
using DateRolePlanner::Rect;
struct Stroke { uint8_t x0,y0,x1,y1; };
static constexpr int DESIGN_W=84, DESIGN_H=88;
// BOTANICAL_STROKES_BEGIN
static constexpr Stroke strokes[]={
  {42,85,41,78},
  {41,78,41,70},
  {41,70,43,62},
  {43,62,42,53},
  {42,53,39,44},
  {39,44,37,36},
  {37,36,35,28},
  {35,28,33,18},
  {33,18,30,8},
  {41,70,48,62},
  {48,62,54,55},
  {54,55,59,52},
  {42,58,33,52},
  {33,52,25,46},
  {25,46,17,44},
  {39,45,49,39},
  {49,39,55,32},
  {55,32,59,25},
  {36,34,29,28},
  {29,28,22,22},
  {22,22,19,17},
  {34,23,42,17},
  {42,17,46,12},
  {51,59,58,58},
  {58,58,64,53},
  {64,53,68,45},
  {68,45,62,45},
  {62,45,55,49},
  {55,49,51,59},
  {51,59,59,51},
  {59,51,65,47},
  {27,48,20,50},
  {20,50,13,48},
  {13,48,8,43},
  {8,43,6,36},
  {6,36,13,35},
  {13,35,20,39},
  {20,39,27,48},
  {25,47,17,41},
  {17,41,9,38},
  {50,39,54,31},
  {54,31,61,27},
  {61,27,68,27},
  {68,27,66,34},
  {66,34,60,40},
  {60,40,50,39},
  {50,39,60,32},
  {60,32,65,29},
  {28,28,21,28},
  {21,28,14,24},
  {14,24,11,18},
  {11,18,12,11},
  {12,11,20,13},
  {20,13,26,19},
  {26,19,28,28},
  {27,27,19,20},
  {19,20,14,15},
  {41,19,42,12},
  {42,12,46,7},
  {46,7,54,4},
  {54,4,53,12},
  {53,12,49,18},
  {49,18,41,19},
  {42,18,48,12},
  {48,12,52,6},
  {31,12,26,10},
  {26,10,23,6},
  {23,6,23,3},
  {23,3,29,5},
  {29,5,32,9},
  {40,54,38,49},
};
// BOTANICAL_STROKES_END
static constexpr int strokeCount=sizeof(strokes)/sizeof(strokes[0]);
// Match the old renderer's integer scaling, but now both native and offline
// studies read precisely the same normalized stroke source.
inline int scaledX(Rect box,int x){return box.x+x*box.w/DESIGN_W;}
inline int scaledY(Rect box,int y){return box.y+y*box.h/DESIGN_H;}
} // namespace DateEditorialBotanical
