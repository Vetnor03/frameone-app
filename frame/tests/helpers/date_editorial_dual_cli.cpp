#include <iostream>
#include "DateEditorialDualCalendar.h"
int main(){
  DateEditorialPlan::Plan base={};
  int year,month0;
  while(std::cin>>base.valid>>base.visible.x>>base.visible.y>>
    base.visible.w>>base.visible.h>>
    base.safe.x>>base.safe.y>>base.safe.w>>base.safe.h>>
    base.hero.x>>base.hero.y>>base.hero.w>>base.hero.h>>
    base.calendar.x>>base.calendar.y>>base.calendar.w>>
    base.calendar.h>>year>>month0){
    const auto out=DateEditorialDual::plan(base,year,month0);
    if(!out.valid){std::cout<<"fallback\n";continue;}
    const auto a=out.current,b=out.next;
    std::cout<<a.x<<','<<a.y<<','<<a.w<<','<<a.h<<'|'
      <<b.x<<','<<b.y<<','<<b.w<<','<<b.h<<'|'
      <<out.nextYear<<','<<out.nextMonth0<<','<<out.showNextYear<<'|'
      <<out.gap<<','<<out.margin<<'\n';
  }
}
