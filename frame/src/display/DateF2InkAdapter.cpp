#include "DateF2InkAdapter.h"
#include "FrameText.h"
#include "RemindEditorialFonts.h"
#include <stdio.h>
#include <string.h>

namespace DateF2Ink {
namespace {
// Strict visible date labels: F2 normally discards unsupported UTF-8;
// accepting partial input here would violate Date's no-truncation contract.
// Date module uses ASCII weekdays/months; Norwegian ÆØÅæøå are supported.
bool strictDateLabel(const char* s) {
  if (!s || !*s || strlen(s) >= 96) return false;
  const unsigned char* p = reinterpret_cast<const unsigned char*>(s);
  while (*p) {
    if ((*p >= 'A' && *p <= 'Z') || (*p >= 'a' && *p <= 'z') ||
        (*p >= '0' && *p <= '9') || *p == ' ' || *p == '-' ||
        *p == '.' || *p == 0x27) { ++p; continue; }
    if (p[0] == 0xC3 && p[1] &&
        (p[1] == 0x86 || p[1] == 0x98 || p[1] == 0x85 ||
         p[1] == 0xA6 || p[1] == 0xB8 || p[1] == 0xA5)) {
      p += 2; continue;
    }
    return false;
  }
  return true;
}
bool ink(const GFXfont* font, const char* utf8, DateRolePlanner::Ink& result) {
  char normalized[96] = {};
  if (!strictDateLabel(utf8)) return false;
  FrameText::normalizeUtf8ForDisplay(normalized,sizeof normalized,utf8);
  if (!normalized[0]) return false;
  EditorialText::LineMetrics measured = {};
  if (EditorialText::measureLine(font,normalized,measured) !=
      EditorialText::Status::OK || measured.inkWidth <= 0 ||
      measured.inkHeight <= 0) return false;
  result = {static_cast<int>(measured.inkWidth),
            static_cast<int>(measured.inkHeight)};
  return true;
}
bool align(const GFXfont* font, const char* utf8,
           const DateRolePlanner::Rect& inkArea, Text& output) {
  output = {};
  output.font=font;
  const EditorialText::Rect area(inkArea.x,inkArea.y,inkArea.w,inkArea.h);
  const auto status=EditorialText::planLine(font,utf8,output.latin1,
      sizeof output.latin1,area,0,EditorialText::Horizontal::CENTER,
      EditorialText::Vertical::CENTER,output.line);
  if (status != EditorialText::Status::OK) return false;
  return output.line.ink.x == inkArea.x &&
         output.line.ink.y == inkArea.y &&
         output.line.ink.w == inkArea.w &&
         output.line.ink.h == inkArea.h;
}
} // namespace

bool planWholeDate(const DateRolePlanner::Rect& cell,int day,
                   const char* monthUtf8,const char* weekdayUtf8,
                   Result& output) {
  output = {};
  if(day<1||day>31 || !strictDateLabel(monthUtf8) ||
     !strictDateLabel(weekdayUtf8))return false;
  char dayText[8] = {};
  snprintf(dayText,sizeof dayText,"%d",day);
  const GFXfont* heroFonts[] = {
    RemindEditorialFonts::fraunces72(),RemindEditorialFonts::fraunces48()};
  const GFXfont* contextFonts[] = {
    RemindEditorialFonts::dm24(),RemindEditorialFonts::dm18()};
  for(uint8_t d=0;d<2;++d){
    DateRolePlanner::Ink dayInk={};
    if(!ink(heroFonts[d],dayText,dayInk))continue;
    for(uint8_t m=0;m<2;++m){
      DateRolePlanner::Ink monthInk={};
      if(!ink(contextFonts[m],monthUtf8,monthInk))continue;
      for(uint8_t w=0;w<2;++w){
        DateRolePlanner::Ink weekdayInk={};
        if(!ink(contextFonts[w],weekdayUtf8,weekdayInk))continue;
        const DateRolePlanner::Input input={
          cell,dayInk,monthInk,weekdayInk};
        const auto geometry=DateRolePlanner::plan(input);
        if(!geometry.valid)continue;
        Result candidate = {};
        candidate.geometry=geometry;
        candidate.dayVariant=d;
        candidate.monthVariant=m;
        candidate.weekdayVariant=w;
        // Preflight EVERY line before marking the candidate drawable.
        if(!align(heroFonts[d],dayText,geometry.day,candidate.day) ||
           !align(contextFonts[m],monthUtf8,geometry.month,candidate.month) ||
           !align(contextFonts[w],weekdayUtf8,geometry.weekday,candidate.weekday))
          continue;
        candidate.valid=true;
        output=candidate;
        return true;
      }
    }
  }
  return false;
}
} // namespace DateF2Ink
