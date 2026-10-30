#pragma once
// R4.6 experiment: small Date ink-only composition, never production default.
// One measured glyph grammar for micro stack and shallow fact ribbon.
// Values and glyph metrics are supplied by the caller; no time/text hardcoding.
#include "DateRolePlanner.h"
#include "DateRolePolicy.generated.h"
namespace DateEditorialCompact {
using DateRolePlanner::Rect;
using DateRolePlanner::Ink;
enum Mode { REJECT=0, MICRO=1, RIBBON=2, STACK=3 };
struct Input {
  Rect cell;
  Ink day, month, weekday, year;
};
struct Plan {
  bool valid,showMonth,showYear;
  Mode mode;
  Rect safe,group,day,month,weekday,year;
};
inline int mn(int a,int b){return a<b?a:b;}
inline int mx(int a,int b){return a>b?a:b;}
inline Rect r(int x,int y,int w,int h){return {x,y,w,h};}
inline bool inside(Rect a,Rect b){
  return a.w>0&&a.h>0&&a.x>=b.x&&a.y>=b.y&&
    a.x+a.w<=b.x+b.w&&a.y+a.h<=b.y+b.h;
}
inline bool overlap(Rect a,Rect b){
  return mn(a.x+a.w,b.x+b.w)>mx(a.x,b.x)&&
    mn(a.y+a.h,b.y+b.h)>mx(a.y,b.y);
}
// Match the existing functional disclosure, not a grid-span design template:
// micro Date displays day and weekday; shallow displays day+weekday+month,
// and also year when the legacy width condition supplies year.
inline Plan plan(const Input& in){
  Plan out={};
  const Rect c=in.cell;
  if(c.w<=0||c.h<=0||in.day.w<=0||in.day.h<=0||
     in.weekday.w<=0||in.weekday.h<=0)return out;
  const bool micro=c.w<150||c.h<88||(c.w<230&&c.h<140);
  const bool shallow=!micro&&c.w>c.h&&c.h<170;
  // Only add the four-fact editorial stack where the original renderer
  // never reserves a calendar. Do not use named 1x2 / 2x2 layout cases.
  // Conservative upper-bound of legacy calendarSplit geometry: if either
  // calendar branch might apply, leave the complete old Date untouched.
  const bool maybeCalendar=(c.w>=430&&c.h>=210)||
                           (c.w>=330&&c.h>=400);
  const bool stack=!micro&&!shallow&&!maybeCalendar&&c.h>=170;
  if(!micro&&!shallow&&!stack)return out;
  const bool year=stack||(shallow&&c.w>=500);
  const bool showMonth=shallow||stack;
  if(showMonth&&(in.month.w<=0||in.month.h<=0))return out;
  if(year&&(in.year.w<=0||in.year.h<=0))return out;
  // This preview follows the current full logical 800x480 device and clips
  // each independent user-owned cell. Physical housing still unverified.
  const Rect panel=r(0,0,DateRolePolicy::PANEL_WIDTH,
                     DateRolePolicy::PANEL_HEIGHT);
  if(!inside(c,panel))return out;
  const int inset=micro?8:12;
  const Rect safe=r(c.x+inset,c.y+inset,c.w-2*inset,c.h-2*inset);
  if(safe.w<=0||safe.h<=0)return out;
  Rect day={},month={},weekday={},yearBox={},group={};
  if(micro){
    const int gap=12;
    const int groupW=mx(in.day.w,in.weekday.w);
    const int groupH=in.day.h+gap+in.weekday.h;
    if(groupW>safe.w||groupH>safe.h)return out;
    group=r(safe.x+(safe.w-groupW)/2,safe.y+(safe.h-groupH)/2,
            groupW,groupH);
    day=r(group.x+(group.w-in.day.w)/2,group.y,in.day.w,in.day.h);
    weekday=r(group.x+(group.w-in.weekday.w)/2,day.y+day.h+gap,
              in.weekday.w,in.weekday.h);
  }else if(shallow){
    // Fraunces date / DM Sans month+weekday / optional subtle year. Source
    // ink and actual available width determine all positions.
    const int lineGap=12,colsGap=mx(16,mn(30,safe.w/20));
    const int contextW=mx(in.month.w,in.weekday.w);
    const int contextH=in.month.h+lineGap+in.weekday.h;
    const int groupW=in.day.w+colsGap+contextW+
                      (year?colsGap+in.year.w:0);
    const int groupH=mx(in.day.h,mx(contextH,year?in.year.h:0));
    if(groupW>safe.w||groupH>safe.h)return out;
    group=r(safe.x+(safe.w-groupW)/2,safe.y+(safe.h-groupH)/2,
            groupW,groupH);
    day=r(group.x,group.y+(groupH-in.day.h)/2,in.day.w,in.day.h);
    const int contextX=day.x+day.w+colsGap;
    const int contextY=group.y+(groupH-contextH)/2;
    month=r(contextX+(contextW-in.month.w)/2,contextY,
            in.month.w,in.month.h);
    weekday=r(contextX+(contextW-in.weekday.w)/2,
              month.y+month.h+lineGap,in.weekday.w,in.weekday.h);
    if(year)yearBox=r(contextX+contextW+colsGap,
                      group.y+(groupH-in.year.h)/2,
                      in.year.w,in.year.h);
  }else{
    // Editorial four-fact vertical reading order matches legacy content:
    // subtle year, month, Fraunces hero day, weekday. No optional illustration
    // or calendar can displace any factual string. Rule depends on measured ink.
    const int gap=mx(12,mn(24,safe.h/12));
    const int groupW=mx(mx(in.day.w,in.month.w),
                        mx(in.year.w,in.weekday.w));
    const int groupH=in.year.h+in.month.h+in.day.h+in.weekday.h+3*gap;
    if(groupW>safe.w||groupH>safe.h)return out;
    group=r(safe.x+(safe.w-groupW)/2,safe.y+(safe.h-groupH)/2,
            groupW,groupH);
    yearBox=r(group.x+(groupW-in.year.w)/2,group.y,
              in.year.w,in.year.h);
    month=r(group.x+(groupW-in.month.w)/2,yearBox.y+yearBox.h+gap,
            in.month.w,in.month.h);
    day=r(group.x+(groupW-in.day.w)/2,month.y+month.h+gap,
          in.day.w,in.day.h);
    weekday=r(group.x+(groupW-in.weekday.w)/2,day.y+day.h+gap,
              in.weekday.w,in.weekday.h);
  }
  if(!inside(day,safe)||!inside(weekday,safe)||
     overlap(day,weekday))return out;
  if(showMonth&&(!inside(month,safe)||overlap(day,month)||
       overlap(month,weekday)))return out;
  if(year&&(!inside(yearBox,safe)||overlap(yearBox,day)||
            overlap(yearBox,month)||overlap(yearBox,weekday)))return out;
  out.valid=true;out.mode=micro?MICRO:(shallow?RIBBON:STACK);out.safe=safe;
  out.group=group;out.day=day;out.month=month;out.weekday=weekday;
  out.year=yearBox;out.showMonth=showMonth;out.showYear=year;
  return out;
}
} // namespace DateEditorialCompact
