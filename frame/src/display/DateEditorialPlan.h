#pragma once
// Date editorial ensemble: pure C++11 measured-ink planner, no drawing.
// Mirrors app/lib/dateEditorialComposition.mjs. NEVER wired into live Date.
// Input glyphs are caller-measured original F1/F2 integer INK rectangles.
#include "DateRolePlanner.h"
#include "DateRolePolicy.generated.h"
#include "DateMonthGridPlan.h"

namespace DateEditorialPlan {
using DateRolePlanner::Rect;
using DateRolePlanner::Ink;
struct Variant { Ink ink; bool valid; };
struct Input {
  Rect cell;
  int year, month0, day, holidayCount;
  Variant years, weekdays, days[2], months[2];
};
struct Plan {
  bool valid, art, rule;
  int score, dayVariant, monthVariant;
  Rect visible,safe,hero,calendar;
  Rect year,month,day,weekday,monthRule,botanical;
  bool showTitle,showDow,showWeeks;
};
inline int mi(int a,int b){return a<b?a:b;}
inline int ma(int a,int b){return a>b?a:b;}
inline int ab(int a){return a<0?-a:a;}
inline Rect rect(int x,int y,int w,int h){return {x,y,w,h};}
inline bool inside(Rect a,Rect b){
  return a.w>0&&a.h>0&&a.x>=b.x&&a.y>=b.y&&
         a.x+a.w<=b.x+b.w&&a.y+a.h<=b.y+b.h;
}
inline bool overlap(Rect a,Rect b){
  return mi(a.x+a.w,b.x+b.w)>ma(a.x,b.x)&&
         mi(a.y+a.h,b.y+b.h)>ma(a.y,b.y);
}
inline Rect centered(Rect zone,Ink ink,int y){
  return rect(zone.x+(zone.w-ink.w)/2,y,ink.w,ink.h);
}
inline bool measured(Variant v){return v.valid&&v.ink.w>0&&v.ink.h>0;}
inline bool factFits(const Rect* facts){
  for(int i=0;i<4;++i)for(int j=i+1;j<4;++j)
    if(overlap(facts[i],facts[j]))return false;
  return true;
}
inline Plan plan(const Input& input){
  Plan result={};
  if(input.cell.w<=0||input.cell.h<=0||
     input.day<1||input.year<DateRolePolicy::CONTEXT_YEAR_MIN||
     input.year>DateRolePolicy::CONTEXT_YEAR_MAX||input.month0<0||
     input.month0>11||input.day>DateMonthGridPlan::days(input.year,input.month0)||
     input.holidayCount>0||!measured(input.years)||!measured(input.weekdays))
    return result;

  const Rect c=input.cell;
  const int x=ma(c.x,DateRolePolicy::MATTE_X);
  const int y=ma(c.y,DateRolePolicy::MATTE_Y);
  const int right=mi(c.x+c.w,DateRolePolicy::MATTE_X+DateRolePolicy::MATTE_WIDTH);
  const int bottom=mi(c.y+c.h,DateRolePolicy::MATTE_Y+DateRolePolicy::MATTE_HEIGHT);
  if(right<=x||bottom<=y)return result;
  const Rect visible=rect(x,y,right-x,bottom-y);
  const bool spacious=visible.w>=DateRolePolicy::SPREAD_MIN_WIDTH&&
                      visible.h>=DateRolePolicy::SPREAD_MIN_HEIGHT;
  const bool tight=visible.w<DateRolePolicy::TIGHT_WIDTH_EXCLUSIVE||
                   visible.h<DateRolePolicy::TIGHT_HEIGHT_EXCLUSIVE;
  const int inset=tight?DateRolePolicy::INSET_TIGHT:
    spacious?DateRolePolicy::INSET_SPACIOUS:DateRolePolicy::INSET_REGULAR;
  const Rect safe=rect(x+inset,y+inset,visible.w-2*inset,visible.h-2*inset);
  if(safe.w<=0||safe.h<230)return result;
  const int sep=ma(18,mi(30,safe.w*4/100));
  const int available=safe.w-sep;
  const int calMin=ma(DateRolePolicy::CALENDAR_WEEK_WIDTH+58,254);
  const int fractions[5]={40,44,48,52,56};
  for(int di=0;di<2;++di) {
    if(!measured(input.days[di]))continue;
    for(int mo=0;mo<2;++mo) {
      if(!measured(input.months[mo]))continue;
      const Ink diInk=input.days[di].ink, moInk=input.months[mo].ink;
      const Ink yrInk=input.years.ink, wdInk=input.weekdays.ink;
      const int longest=ma(ma(diInk.w,moInk.w),ma(yrInk.w,wdInk.w));
      const int minHero=longest+ma(32,(longest*32+50)/100);
      if(available<minHero+calMin)continue;
      for(int style=0;style<3;++style) {
        const bool art=style==0;
        const bool rule=style<=1;
        for(int fi=0;fi<5;++fi) {
          const int heroW=available*fractions[fi]/100;
          const int calW=available-heroW;
          if(heroW<minHero||calW<calMin)continue;
          const Rect hero=rect(safe.x,safe.y,heroW,safe.h);
          const Rect calendar=rect(hero.x+heroW+sep,
            safe.y+safe.h*75/1000,calW,
            mi(310,safe.h-safe.h*15/100));
          if(!inside(calendar,safe))continue;
          const bool dow=calendar.w>=DateRolePolicy::CALENDAR_DOW_WIDTH&&
                         calendar.h>=DateRolePolicy::CALENDAR_DOW_HEIGHT;
          const bool title=dow&&calendar.h>=DateRolePolicy::CALENDAR_TITLE_HEIGHT;
          const bool weeks=dow&&calendar.w>=DateRolePolicy::CALENDAR_WEEK_WIDTH&&
                           calendar.h>=DateRolePolicy::CALENDAR_WEEK_HEIGHT;
          if(!dow||!title)continue;
          const int artH=art?mi(84,safe.h/5):0;
          const int artGap=art?14:0;
          const int topPad=ma(14,safe.h*65/1000);
          const int bottomPad=ma(12,safe.h*4/100);
          const int ruleH=rule?20:0;
          const int extra=safe.h-(yrInk.h+moInk.h+diInk.h+wdInk.h);
          // JS Math.floor, including negative: require >=12 for acceptance.
          const int usable=extra-artH-artGap-topPad-bottomPad-ruleH;
          if(usable<36)continue;
          const int gaps=usable/3;
          int yy=safe.y+topPad;
          const Rect year=centered(hero,yrInk,yy);yy+=yrInk.h+gaps;
          const Rect month=centered(hero,moInk,yy);yy+=moInk.h;
          const Rect monthRule=rule?rect(
            hero.x+hero.w*22/100,yy+ma(6,gaps/2),hero.w*56/100,1):Rect{};
          yy+=gaps+ruleH;
          const Rect day=centered(hero,diInk,yy);yy+=diInk.h+gaps;
          const Rect weekday=centered(hero,wdInk,yy);
          const Rect botanical=art?rect(hero.x+(hero.w-82)/2,
            weekday.y+weekday.h+artGap,82,artH):Rect{};
          const Rect factual[4]={year,month,day,weekday};
          bool ok=true;
          for(int i=0;i<4;++i)if(!inside(factual[i],hero)||
            overlap(factual[i],calendar))ok=false;
          if(!ok||!factFits(factual))continue;
          if(rule){
            if(!inside(monthRule,hero))continue;
            for(int i=0;i<4;++i)if(overlap(factual[i],monthRule))ok=false;
          }
          if(art){
            if(!inside(botanical,hero))continue;
            for(int i=0;i<4;++i)if(overlap(factual[i],botanical))ok=false;
            if(rule&&overlap(monthRule,botanical))ok=false;
          }
          if(!ok)continue;
          const int whitespace=(hero.w-longest)+(calendar.w-calMin);
          const int visualBalance=100-
            (ab(hero.w*55-calendar.w*45)+200)/400;
          const int score=(di==0?10000:0)+(mo==0?1000:0)+
            whitespace+visualBalance+(art?24:0)+(rule?8:0);
          if(!result.valid||score>result.score){
            result.valid=true;result.score=score;
            result.dayVariant=di;result.monthVariant=mo;
            result.visible=visible;result.safe=safe;
            result.hero=hero;result.calendar=calendar;
            result.year=year;result.month=month;result.day=day;
            result.weekday=weekday;result.monthRule=monthRule;
            result.botanical=botanical;
            result.art=art;result.rule=rule;
            result.showTitle=title;result.showDow=dow;result.showWeeks=weeks;
          }
        }
      }
    }
  }
  return result;
}
} // namespace DateEditorialPlan
