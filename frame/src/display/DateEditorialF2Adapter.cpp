#include "DateEditorialF2Adapter.h"
#include "FrameText.h"
#include "RemindEditorialFonts.h"
#include <stdio.h>
#include <string.h>

namespace DateEditorialF2 {
namespace {
// FrameText's normalizer can skip unsupported UTF-8. Reject those inputs
// BEFORE calling it; otherwise the rendered date can silently lose glyphs.
// This stage accepts the same ASCII + Norwegian ÆØÅæøå as the F2 core.
bool completeLabel(const char* s) {
  if(!s||!*s||strlen(s)>=96)return false;
  const unsigned char* p=reinterpret_cast<const unsigned char*>(s);
  while(*p){
    if((*p>='A'&&*p<='Z')||(*p>='a'&&*p<='z')||
       (*p>='0'&&*p<='9')||*p==' '||*p=='-'||*p=='.'||*p==0x27){
      ++p;continue;
    }
    if(p[0]==0xC3&&p[1]&&
       (p[1]==0x86||p[1]==0x98||p[1]==0x85||
        p[1]==0xA6||p[1]==0xB8||p[1]==0xA5)) {
      p+=2;continue;
    }
    return false;
  }
  return true;
}
bool measured(const GFXfont* font,const char* utf8,
              DateEditorialPlan::Variant& variant){
  variant={};
  if(!font||!completeLabel(utf8))return false;
  char display[96]={};
  FrameText::normalizeUtf8ForDisplay(display,sizeof display,utf8);
  EditorialText::LineMetrics metrics={};
  if(!display[0]||EditorialText::measureLine(font,display,metrics)!=
      EditorialText::Status::OK||metrics.inkWidth<=0||
      metrics.inkHeight<=0)return false;
  variant.ink={static_cast<int>(metrics.inkWidth),
               static_cast<int>(metrics.inkHeight)};
  variant.valid=true;
  return true;
}
bool prepared(const GFXfont* font,const char* label,
              DateRolePlanner::Rect area,Label& result){
  result={};
  if(!completeLabel(label))return false;
  result.font=font;
  const EditorialText::Rect target(area.x,area.y,area.w,area.h);
  const auto status=EditorialText::planLine(font,label,result.latin1,
    sizeof result.latin1,target,0,EditorialText::Horizontal::CENTER,
    EditorialText::Vertical::CENTER,result.line);
  return status==EditorialText::Status::OK &&
    result.line.ink.x==area.x&&result.line.ink.y==area.y&&
    result.line.ink.w==area.w&&result.line.ink.h==area.h;
}
} // namespace

bool plan(const DateRolePlanner::Rect& cell,int year,int month0,int day,
          const char* monthUtf8,const char* weekdayUtf8,
          int holidayCount,Result& output){
  output={};
  if(day<1||day>31||holidayCount<0||!completeLabel(monthUtf8)||
     !completeLabel(weekdayUtf8))return false;
  char dayText[8]={},yearText[8]={};
  snprintf(dayText,sizeof dayText,"%d",day);
  snprintf(yearText,sizeof yearText,"%d",year);
  const GFXfont* hero[]={
    RemindEditorialFonts::fraunces72(),
    RemindEditorialFonts::fraunces48()};
  const GFXfont* context[]={
    RemindEditorialFonts::dm24(),RemindEditorialFonts::dm18()};
  DateEditorialPlan::Input input={};
  input.cell=cell;input.year=year;input.month0=month0;
  input.day=day;input.holidayCount=holidayCount;
  if(!measured(RemindEditorialFonts::dm18(),yearText,input.years)||
     !measured(RemindEditorialFonts::dm18(),weekdayUtf8,input.weekdays))
    return false;
  for(int i=0;i<2;++i){
    measured(hero[i],dayText,input.days[i]);
    measured(context[i],monthUtf8,input.months[i]);
  }
  const auto geometry=DateEditorialPlan::plan(input);
  if(!geometry.valid)return false;
  Result next={};
  next.geometry=geometry;
  // Never mark valid or mutate the display until every original glyph fits.
  if(!prepared(RemindEditorialFonts::dm18(),yearText,geometry.year,next.year)||
     !prepared(RemindEditorialFonts::dm18(),weekdayUtf8,geometry.weekday,next.weekday)||
     !prepared(hero[geometry.dayVariant],dayText,geometry.day,next.day)||
     !prepared(context[geometry.monthVariant],monthUtf8,geometry.month,next.month))
    return false;
  next.valid=true;
  output=next;
  return true;
}
} // namespace DateEditorialF2
