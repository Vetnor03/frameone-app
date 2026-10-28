// Host-only F1/F2 native font source + editorial preflight. No hardware.
#include <iostream>
#include <string>
#include "DateEditorialF2Adapter.h"
using namespace DateEditorialF2;
using DateRolePlanner::Rect;
void show(Rect r){std::cout<<r.x<<','<<r.y<<','<<r.w<<','<<r.h;}
void cursor(const Label& label){
  std::cout<<label.line.cursorX<<','<<label.line.baselineY;
}
int main(){
  int x,y,w,h,year,month0,day,holidayCount;
  std::string month,weekday;
  while(std::cin>>x>>y>>w>>h>>year>>month0>>day>>
    holidayCount>>month>>weekday){
    Result out={};
    if(!plan({x,y,w,h},year,month0,day,month.c_str(),
             weekday.c_str(),holidayCount,out)||!out.valid){
      std::cout<<"fallback\n";continue;
    }
    const auto& p=out.geometry;
    std::cout<<p.score<<'|'<<p.dayVariant<<','<<p.monthVariant<<'|'
      <<p.art<<','<<p.rule<<'|';
    show(p.year);std::cout<<'|';show(p.month);std::cout<<'|';
    show(p.day);std::cout<<'|';show(p.weekday);
    std::cout<<'|';cursor(out.year);
    std::cout<<'|';cursor(out.month);
    std::cout<<'|';cursor(out.day);
    std::cout<<'|';cursor(out.weekday);
    std::cout<<'\n';
  }
}
