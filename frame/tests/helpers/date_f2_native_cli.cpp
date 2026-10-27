// Native-only F1/F2 render-plan inspection. Never compiled by the frame.
#include <iostream>
#include <string>
#include "DateF2InkAdapter.h"
using namespace DateF2Ink;
using namespace DateRolePlanner;
void coords(const Rect& r) { std::cout<<r.x<<','<<r.y<<','<<r.w<<','<<r.h; }
int main() {
  int x,y,w,h,day;std::string month,weekday;
  while(std::cin>>x>>y>>w>>h>>day>>month>>weekday) {
    Result out={};
    if(!planWholeDate({x,y,w,h},day,month.c_str(),weekday.c_str(),out)||
       !out.valid){std::cout<<"fallback\n";continue;}
    std::cout<<(out.geometry.mode==STACK?"stack":
      out.geometry.mode==RIBBON?"ribbon":"card")<<'|'
      <<int(out.dayVariant)<<','<<int(out.monthVariant)<<','
      <<int(out.weekdayVariant)<<'|';
    coords(out.geometry.visible);std::cout<<'|';
    coords(out.geometry.group);std::cout<<'|';
    coords(out.geometry.month);std::cout<<'|';
    coords(out.geometry.day);std::cout<<'|';
    coords(out.geometry.weekday);std::cout<<'|';
    std::cout<<out.day.line.cursorX<<','<<out.day.line.baselineY<<'|'
      <<out.month.line.cursorX<<','<<out.month.line.baselineY<<'|'
      <<out.weekday.line.cursorX<<','<<out.weekday.line.baselineY<<'\n';
  }
}
