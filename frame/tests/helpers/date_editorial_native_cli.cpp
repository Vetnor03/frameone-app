// Test-only C++11 Date editorial ensemble geometry/parity; never draws.
#include <iostream>
#include "DateEditorialPlan.h"
using namespace DateEditorialPlan;
void outRect(const Rect& r){
  std::cout<<r.x<<','<<r.y<<','<<r.w<<','<<r.h;
}
int main(){
  Input in={};
  while(std::cin>>in.cell.x>>in.cell.y>>in.cell.w>>in.cell.h>>
    in.year>>in.month0>>in.day>>in.holidayCount>>
    in.years.ink.w>>in.years.ink.h>>
    in.weekdays.ink.w>>in.weekdays.ink.h>>
    in.days[0].ink.w>>in.days[0].ink.h>>
    in.days[1].ink.w>>in.days[1].ink.h>>
    in.months[0].ink.w>>in.months[0].ink.h>>
    in.months[1].ink.w>>in.months[1].ink.h){
    in.years.valid=in.years.ink.w>0&&in.years.ink.h>0;
    in.weekdays.valid=in.weekdays.ink.w>0&&in.weekdays.ink.h>0;
    for(int j=0;j<2;++j){
      in.days[j].valid=in.days[j].ink.w>0&&in.days[j].ink.h>0;
      in.months[j].valid=in.months[j].ink.w>0&&in.months[j].ink.h>0;
    }
    const Plan p=plan(in);
    if(!p.valid){std::cout<<"fallback\n";continue;}
    std::cout<<p.score<<'|'<<p.dayVariant<<','<<p.monthVariant<<'|'
      <<p.art<<','<<p.rule<<','<<p.showTitle<<','<<p.showDow<<','<<p.showWeeks;
    const Rect boxes[10]={p.visible,p.safe,p.hero,p.calendar,p.year,
       p.month,p.day,p.weekday,p.monthRule,p.botanical};
    for(const auto& box:boxes){std::cout<<'|';outRect(box);}
    std::cout<<'\n';
  }
}
