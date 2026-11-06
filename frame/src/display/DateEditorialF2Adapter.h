#pragma once
// Native original-F1/F2 editorial Date *preflight*, never draws pixels.
// All-or-nothing measured typography, C++11, no heap.
#include "DateEditorialPlan.h"
#include "EditorialText.h"
#include <Adafruit_GFX.h>

namespace DateEditorialF2 {
struct Label {
  const GFXfont* font;
  char latin1[96];
  EditorialText::LinePlan line;
};
struct Result {
  bool valid;
  DateEditorialPlan::Plan geometry;
  Label year,month,day,weekday;
};
bool plan(const DateRolePlanner::Rect& cell,int year,int month0,int day,
          const char* monthUtf8,const char* weekdayUtf8,
          int holidayCount,Result& output);
} // namespace DateEditorialF2
