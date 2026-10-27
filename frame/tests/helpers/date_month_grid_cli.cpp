#include <iostream>
#include "DateMonthGridPlan.h"
using namespace DateMonthGridPlan;
int main(){
  int x,y,w,h,year,month0,title,dow,weeks;
  while(std::cin>>x>>y>>w>>h>>year>>month0>>title>>dow>>weeks){
    const Grid g=plan({x,y,w,h},year,month0,title!=0,weeks!=0,dow!=0);
    if(!g.valid){std::cout<<"fallback\n";continue;}
    int ny=0,nm=0;
    const bool hasNext=nextMonth(year,month0,ny,nm);
    std::cout<<g.firstMonday<<','<<g.days<<','<<g.rows<<','
      <<g.cellW<<','<<g.cellH<<','<<g.block.x<<','<<g.block.y<<','
      <<g.block.w<<','<<g.block.h<<','<<g.gridTop<<','<<g.dowX<<','
      <<(hasNext?ny:0)<<','<<(hasNext?nm:-1)<<'\n';
  }
}
