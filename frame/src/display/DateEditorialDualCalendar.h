#pragma once
// Experimental content-measured editorial dual-month reservation.
// No drawing, no image allocations. Consumes existing editorial geometry.
#include "DateEditorialPlan.h"
#include "DateMonthGridPlan.h"
namespace DateEditorialDual {
using DateRolePlanner::Rect;
struct Result {
  bool valid,showNextYear;
  int nextYear,nextMonth0,gap,margin;
  Rect current,next;
};
inline Result plan(const DateEditorialPlan::Plan& editorial,int year,int month0){
  Result out={};
  if(!editorial.valid||editorial.safe.h<320||editorial.calendar.w<254)
    return out;
  int nextYear=0,nextMonth0=0;
  if(!DateMonthGridPlan::nextMonth(year,month0,nextYear,nextMonth0))
    return out;
  const Rect safe=editorial.safe, region=editorial.calendar;
  const int margin=DateEditorialPlan::ma(8,safe.h/45);
  const int gap=DateEditorialPlan::ma(8,DateEditorialPlan::mi(14,safe.h/30));
  const int usable=safe.h-2*margin-gap;
  const int currentH=usable*56/100,nextH=usable-currentH;
  if(currentH<185||nextH<150)return out;
  const Rect current={region.x,safe.y+margin,region.w,currentH};
  const Rect next={region.x,current.y+current.h+gap,region.w,nextH};
  if(!DateEditorialPlan::inside(current,safe)||
     !DateEditorialPlan::inside(next,safe)||
     DateEditorialPlan::overlap(current,next)||
     DateEditorialPlan::overlap(current,editorial.hero)||
     DateEditorialPlan::overlap(next,editorial.hero))return out;
  out.valid=true;out.current=current;out.next=next;
  out.margin=margin;out.gap=gap;
  out.nextYear=nextYear;out.nextMonth0=nextMonth0;
  out.showNextYear=nextYear!=year;
  return out;
}
}
