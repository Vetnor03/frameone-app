#pragma once
// R3: preflight-only exact Gregorian month grid geometry. Does not draw.
// Matches drawMonthCalendar's 7-column / 4-6-row grid and conservative
// six-row minimum to prevent its early-return branch after hero ink is drawn.
#include "DateRolePlanner.h"
#include "DateRolePolicy.generated.h"

namespace DateMonthGridPlan {
using DateRolePlanner::Rect;
struct Grid {
  bool valid;
  int year, month0, firstMonday, days, rows;
  int cellW, cellH, weekW, titleH, titleGap, dowH;
  Rect area, block;
  int gridTop, dowX;
  bool showTitle, showWeekNums, showDow;
};
inline bool leap(int year) {
  return year%4==0 && (year%100!=0 || year%400==0);
}
inline int days(int year,int month0) {
  const int lengths[12]={31,28,31,30,31,30,31,31,30,31,30,31};
  return lengths[month0]+((month0==1 && leap(year))?1:0);
}
// Proleptic Gregorian Sunday=0; independent of time zone/DST/mktime.
// Legacy drawMonthCalendar's mktime (tm_hour=12) must yield the same weekday.
inline int firstMonday(int year,int month0) {
  const int t[12]={0,3,2,5,0,3,5,1,4,6,2,4};
  const int y=year-(month0<2?1:0);
  const int sun=(y+y/4-y/100+y/400+t[month0]+1)%7;
  return sun==0?6:sun-1;
}
inline Grid plan(Rect area,int year,int month0,bool title,bool weeks,bool dow) {
  Grid out={};
  if(year<DateRolePolicy::CONTEXT_YEAR_MIN ||
     year>DateRolePolicy::CONTEXT_YEAR_MAX ||
     month0<0||month0>11||area.w<=0||area.h<=0)return out;
  const Rect matte={DateRolePolicy::MATTE_X,DateRolePolicy::MATTE_Y,
    DateRolePolicy::MATTE_WIDTH,DateRolePolicy::MATTE_HEIGHT};
  if(area.x<matte.x||area.y<matte.y||
     area.x+area.w>matte.x+matte.w||
     area.y+area.h>matte.y+matte.h)return out;

  const int titleH=title?22:0;
  const int titleGap=title?10:0;
  const int dowH=dow?18:0;
  const int weekW=weeks?26:0;
  const int availW=area.w-24,availH=area.h-16;
  if(availW<70||availH<titleH+titleGap+dowH+60 ||
     availW-weekW<63)return out;

  const int first=firstMonday(year,month0);
  const int dim=days(year,month0);
  const int rawRows=(first+dim+6)/7;
  const int rows=rawRows<4?4:rawRows>6?6:rawRows;
  const int cw=(availW-weekW)/7;
  const int ch=(availH-titleH-titleGap-dowH)/rows;
  if(cw<9||ch<10)return out;
  const int bw=weekW+7*cw;
  const int bh=titleH+titleGap+dowH+rows*ch;
  const Rect block={area.x+(area.w-bw)/2,
    area.y+(area.h-bh)/2,bw,bh};
  if(block.x<area.x||block.y<area.y||
     block.x+block.w>area.x+area.w||
     block.y+block.h>area.y+area.h)return out;

  out.valid=true;out.year=year;out.month0=month0;
  out.firstMonday=first;out.days=dim;out.rows=rows;
  out.cellW=cw;out.cellH=ch;out.weekW=weekW;
  out.titleH=titleH;out.titleGap=titleGap;out.dowH=dowH;
  out.area=area;out.block=block;
  out.gridTop=block.y+titleH+titleGap+dowH;
  out.dowX=block.x+weekW;
  out.showTitle=title;out.showWeekNums=weeks;out.showDow=dow;
  return out;
}
inline bool nextMonth(int year,int month0,int& nextYear,int& nextMonth0){
  if(year<DateRolePolicy::CONTEXT_YEAR_MIN ||
     year>DateRolePolicy::CONTEXT_YEAR_MAX ||
     month0<0||month0>11)return false;
  nextYear=year+(month0==11?1:0);
  nextMonth0=(month0+1)%12;
  return nextYear<=DateRolePolicy::CONTEXT_YEAR_MAX;
}
}  // namespace DateMonthGridPlan
