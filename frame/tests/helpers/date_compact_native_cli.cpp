// Test-only geometry parity for Date compact, NEVER production painter.
#include <iostream>
#include "DateEditorialCompactPlan.h"
int main(){
  using namespace DateEditorialCompact;
  Input in={};
  while(std::cin>>in.cell.x>>in.cell.y>>in.cell.w>>in.cell.h>>
    in.day.w>>in.day.h>>in.month.w>>in.month.h>>
    in.weekday.w>>in.weekday.h>>in.year.w>>in.year.h){
    const auto p=plan(in);
    if(!p.valid){std::cout<<"fallback\n";continue;}
    auto out=[](Rect r){std::cout<<r.x<<","<<r.y<<","<<r.w<<","<<r.h;};
    std::cout<<(int)p.mode<<"|"<<p.showMonth<<","<<p.showYear<<","<<p.art;
    const Rect items[7]={p.safe,p.group,p.day,p.month,p.weekday,p.year,p.botanical};
    for(const auto& item:items){std::cout<<"|";out(item);}
    std::cout<<"\n";
  }
}
