#include <iostream>
#include "DateEditorialHolidays.h"
void print(DateRolePlanner::Rect r){
  std::cout<<r.x<<','<<r.y<<','<<r.w<<','<<r.h;
}
int main(){
  DateEditorialHolidays::Input in={};
  int art=0;
  while(std::cin>>in.editorial.valid>>art>>
    in.editorial.hero.x>>in.editorial.hero.y>>
    in.editorial.hero.w>>in.editorial.hero.h>>
    in.editorial.weekday.x>>in.editorial.weekday.y>>
    in.editorial.weekday.w>>in.editorial.weekday.h>>
    in.editorial.botanical.x>>in.editorial.botanical.y>>
    in.editorial.botanical.w>>in.editorial.botanical.h>>
    in.count>>in.heading.w>>in.heading.h>>
    in.rows[0].w>>in.rows[0].h>>
    in.rows[1].w>>in.rows[1].h){
    in.editorial.art=art!=0;
    const auto p=DateEditorialHolidays::plan(in);
    if(!p.valid){std::cout<<"fallback\n";continue;}
    std::cout<<p.count<<'|';
    print(p.heading);
    for(int i=0;i<2;++i){std::cout<<'|';print(p.rows[i]);}
    std::cout<<'\n';
  }
}
