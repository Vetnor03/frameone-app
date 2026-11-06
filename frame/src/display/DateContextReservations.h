#pragma once
// R3 Date context rectangle reservations. OFFLINE pure geometry, not a renderer.
// Inputs: F2-measured factual group + actual calendar availability + full-line
// GFX ink sizes for year and up to two chronological holidays. No grid IDs.
#include "DateRolePlanner.h"
#include "DateRolePolicy.generated.h"
namespace DateContextReservations {
using DateRolePlanner::Rect;
using DateRolePlanner::Ink;
struct Input {
  Rect visible, group;
  bool hasCurrent, hasNext;
  Ink year;
  int holidayCount;
  Ink holidays[2];
};
struct Output {
  bool current, next, year;
  Rect currentRect, nextRect, yearRect;
  bool dow, weeks, title;
  bool nextDow, nextWeeks, nextTitle;
  int holidayCount;
  Rect holidayRects[2];
};
inline int mn(int a,int b){return a<b?a:b;}
inline int mx(int a,int b){return a>b?a:b;}
inline Rect r(int x,int y,int w,int h){return {x,y,w,h};}
inline bool inside(Rect inner,Rect outer){
  return inner.w>0&&inner.h>0&&outer.x<=inner.x&&outer.y<=inner.y&&
         inner.x+inner.w<=outer.x+outer.w&&inner.y+inner.h<=outer.y+outer.h;
}
inline Rect center(Rect zone,int w,int h) {
  return r(zone.x+(zone.w-w)/2,zone.y+(zone.h-h)/2,w,h);
}
struct Available {Rect zones[4];bool active[4];};
// A consumed region is removed atomically; subsequent facts cannot overlap.
inline bool take(Available& free,int minW,int minH,int maxW,int maxH,Rect& out){
  int best=-1,score=-1;
  for(int i=0;i<4;++i){
    const Rect z=free.zones[i];
    if(!free.active[i]||z.w<minW||z.h<minH)continue;
    const int s=mn(z.w,maxW)*mn(z.h,maxH);
    if(s>score){best=i;score=s;}
  }
  if(best<0)return false;
  const Rect z=free.zones[best];
  free.active[best]=false;
  out=center(z,mn(z.w,maxW),mn(z.h,maxH));
  return true;
}
inline void calendarFeatures(Rect cell,bool& dow,bool& weeks,bool& title){
  dow=cell.w>=DateRolePolicy::CALENDAR_DOW_WIDTH &&
      cell.h>=DateRolePolicy::CALENDAR_DOW_HEIGHT;
  weeks=dow && cell.w>=DateRolePolicy::CALENDAR_WEEK_WIDTH &&
               cell.h>=DateRolePolicy::CALENDAR_WEEK_HEIGHT;
  title=dow && cell.h>=DateRolePolicy::CALENDAR_TITLE_HEIGHT;
}
inline Output plan(const Input& facts){
  Output out={};
  const Rect vis=facts.visible,g=facts.group;
  const Rect matte=r(DateRolePolicy::MATTE_X,DateRolePolicy::MATTE_Y,
                     DateRolePolicy::MATTE_WIDTH,DateRolePolicy::MATTE_HEIGHT);
  if(!inside(vis,matte)||!inside(g,vis))return out;
  const bool tight=vis.w<DateRolePolicy::TIGHT_WIDTH_EXCLUSIVE ||
                   vis.h<DateRolePolicy::TIGHT_HEIGHT_EXCLUSIVE;
  const bool spacious=vis.w>=DateRolePolicy::SPREAD_MIN_WIDTH &&
                       vis.h>=DateRolePolicy::SPREAD_MIN_HEIGHT;
  const int inset=tight?DateRolePolicy::INSET_TIGHT:
            spacious?DateRolePolicy::INSET_SPACIOUS:DateRolePolicy::INSET_REGULAR;
  const int gap=tight?DateRolePolicy::GAP_TIGHT:
            spacious?DateRolePolicy::GAP_SPACIOUS:DateRolePolicy::GAP_REGULAR;
  const Rect safe=r(vis.x+inset,vis.y+inset,vis.w-2*inset,vis.h-2*inset);
  if(!inside(g,safe))return out;
  Available free={{
    r(safe.x,safe.y,g.x-safe.x-gap,safe.h),
    r(g.x+g.w+gap,safe.y,safe.x+safe.w-g.x-g.w-gap,safe.h),
    r(g.x,safe.y,g.w,g.y-safe.y-gap),
    r(g.x,g.y+g.h+gap,g.w,safe.y+safe.h-g.y-g.h-gap)
  },{true,true,true,true}};
  if(facts.hasCurrent){
    out.current=take(free,DateRolePolicy::CALENDAR_MIN_WIDTH,
      DateRolePolicy::CALENDAR_MIN_HEIGHT,
      DateRolePolicy::CONTEXT_CALENDAR_MAX_WIDTH,
      DateRolePolicy::CONTEXT_CALENDAR_MAX_HEIGHT,out.currentRect);
    if(out.current)calendarFeatures(out.currentRect,out.dow,out.weeks,out.title);
  }
  if(facts.year.w>0&&facts.year.h>0){
    Rect area={};
    out.year=take(free,facts.year.w+DateRolePolicy::CONTEXT_YEAR_INSET,
      facts.year.h+DateRolePolicy::CONTEXT_YEAR_INSET,
      DateRolePolicy::CONTEXT_YEAR_MAX_WIDTH,
      DateRolePolicy::CONTEXT_YEAR_MAX_HEIGHT,area);
    if(out.year)out.yearRect=center(area,facts.year.w,facts.year.h);
  }
  if(out.current && facts.hasNext){
    out.next=take(free,DateRolePolicy::CALENDAR_MIN_WIDTH,
      DateRolePolicy::CALENDAR_MIN_HEIGHT,
      DateRolePolicy::CONTEXT_CALENDAR_MAX_WIDTH,
      DateRolePolicy::CONTEXT_CALENDAR_MAX_HEIGHT,out.nextRect);
    if(out.next)calendarFeatures(out.nextRect,out.nextDow,out.nextWeeks,out.nextTitle);
  }
  int count=mn(mx(facts.holidayCount,0),DateRolePolicy::CONTEXT_MAX_HOLIDAY_ROWS);
  for(int i=0;i<count;++i)if(facts.holidays[i].w<=0 ||
      facts.holidays[i].h<=0){count=i;break;}
  while(count>0){
    int maxWidth=0,fullHeight=0;
    for(int i=0;i<count;++i){
      maxWidth=mx(maxWidth,facts.holidays[i].w);
      fullHeight+=facts.holidays[i].h;
    }
    fullHeight+=(count-1)*DateRolePolicy::CONTEXT_HOLIDAY_ROW_GAP;
    Rect area={};
    if(take(free,maxWidth+DateRolePolicy::CONTEXT_HOLIDAY_INSET,
         fullHeight+DateRolePolicy::CONTEXT_HOLIDAY_INSET,
         maxWidth+DateRolePolicy::CONTEXT_HOLIDAY_MAX_EXTRA,
         fullHeight+DateRolePolicy::CONTEXT_HOLIDAY_MAX_EXTRA,area)){
      int y=area.y+(area.h-fullHeight)/2;
      for(int i=0;i<count;++i){
        const Ink ink=facts.holidays[i];
        out.holidayRects[i]=r(area.x+(area.w-ink.w)/2,y,ink.w,ink.h);
        y+=ink.h+DateRolePolicy::CONTEXT_HOLIDAY_ROW_GAP;
      }
      out.holidayCount=count;
      break;
    }
    --count;
  }
  return out;
}
} // namespace DateContextReservations
