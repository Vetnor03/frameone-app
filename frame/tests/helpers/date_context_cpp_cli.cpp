// Native C++11 parity runner, no frame hardware or display calls.
#include <iostream>
#include "DateContextReservations.h"
using namespace DateContextReservations;
void print(Rect r){std::cout<<r.x<<','<<r.y<<','<<r.w<<','<<r.h;}
void showCalendar(bool ok,Rect r,bool dow,bool week,bool title){
  if(!ok){std::cout<<'-';return;}
  print(r);std::cout<<','<<int(dow)<<','<<int(week)<<','<<int(title);
}
int main(){
  Input in={};
  int current=0,next=0;
  while(std::cin>>in.visible.x>>in.visible.y>>in.visible.w>>in.visible.h>>
    in.group.x>>in.group.y>>in.group.w>>in.group.h>>
    current>>next>>in.year.w>>in.year.h>>in.holidayCount>>
    in.holidays[0].w>>in.holidays[0].h>>
    in.holidays[1].w>>in.holidays[1].h){
    in.hasCurrent=current!=0;in.hasNext=next!=0;
    const Output out=plan(in);
    showCalendar(out.current,out.currentRect,out.dow,out.weeks,out.title);
    std::cout<<'|';
    if(out.year)print(out.yearRect);else std::cout<<'-';
    std::cout<<'|';
    showCalendar(out.next,out.nextRect,out.nextDow,out.nextWeeks,out.nextTitle);
    std::cout<<'|'<<out.holidayCount;
    for(int i=0;i<2;++i){
      std::cout<<'|';
      if(i<out.holidayCount)print(out.holidayRects[i]);
      else std::cout<<'-';
    }
    std::cout<<'\n';
  }
}
