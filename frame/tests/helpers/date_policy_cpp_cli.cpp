// Test-only standalone GNU++11 runner, no Arduino dependency.
#include <iostream>
#include "DateRolePlanner.h"
using namespace DateRolePlanner;
void printRect(Rect r){std::cout<<r.x<<','<<r.y<<','<<r.w<<','<<r.h;}
int main(){
  Input input={};
  while(std::cin>>input.cell.x>>input.cell.y>>input.cell.w>>input.cell.h>>
    input.day.w>>input.day.h>>input.month.w>>input.month.h>>
    input.weekday.w>>input.weekday.h){
    const Plan p=plan(input);
    if(!p.valid){std::cout<<"fallback\n";continue;}
    std::cout<<(p.mode==STACK?"stack":p.mode==RIBBON?"ribbon":"card")<<'|';
    printRect(p.visible);std::cout<<'|';printRect(p.group);std::cout<<'|';
    printRect(p.month);std::cout<<'|';printRect(p.day);std::cout<<'|';
    printRect(p.weekday);std::cout<<'\n';
  }
}
