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
  // Content-first split. The previous fixed 56/44 split squeezed
  // six-week following months to ~16px rows in a full 4x4 Date.
  // 66px reserves both 8px vertical paddings, 22px title, 10px gap
  // and 18px weekday header from drawMonthCalendar / DateMonthGridPlan.
  const int firstRows=DateMonthGridPlan::firstMonday(year,month0)+
                      DateMonthGridPlan::days(year,month0);
  const int secondRows=DateMonthGridPlan::firstMonday(nextYear,nextMonth0)+
                       DateMonthGridPlan::days(nextYear,nextMonth0);
  const int aRows=DateEditorialPlan::mi(6,DateEditorialPlan::ma(4,(firstRows+6)/7));
  const int bRows=DateEditorialPlan::mi(6,DateEditorialPlan::ma(4,(secondRows+6)/7));
  const int chrome=16+22+10+18;
  const int margin=4,gap=8;
  const int usable=safe.h-2*margin-gap;
  const int firstMin=chrome+26*aRows; // >=11px today-ring radius
  const int secondMin=chrome+21*bRows; // complete original FreeSans9 rows
  const int spare=usable-firstMin-secondMin;
  if(spare<0)return out; // never squeeze a month; legacy remains untouched
  const int currentH=firstMin+spare*aRows/(aRows+bRows);
  const int nextH=usable-currentH;
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
