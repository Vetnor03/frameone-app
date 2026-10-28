#pragma once
// Full-ink editorial upcoming holiday slots. Pure C++11 geometry, no paint.
// Data priority: all factual rows fit, otherwise the caller must use legacy.
#include "DateEditorialPlan.h"
namespace DateEditorialHolidays {
using DateRolePlanner::Rect;
using DateRolePlanner::Ink;
struct Input {
  DateEditorialPlan::Plan editorial;
  Ink heading, rows[2];
  int count;
};
struct Result {
  bool valid;
  int count;
  Rect heading,rows[2];
};
inline Rect centered(Rect area,Ink ink,int y){
  return {area.x+(area.w-ink.w)/2,y,ink.w,ink.h};
}
inline Result plan(const Input& input){
  Result out={};
  if(input.count<0||input.count>2||!input.editorial.valid)return out;
  out.count=input.count;
  if(!input.count){out.valid=true;return out;}
  const auto& p=input.editorial;
  if(!p.art||p.botanical.w<=0||p.botanical.h<=0 ||
     input.heading.w<=0||input.heading.h<=0)return out;
  const Rect area={p.hero.x+8,p.botanical.y-3,p.hero.w-16,
    (p.hero.y+p.hero.h-8)-(p.botanical.y-3)};
  if(!DateEditorialPlan::inside(area,p.hero)||
     area.y<p.weekday.y+p.weekday.h+9)return out;
  int total=input.heading.h+6;
  for(int i=0;i<input.count;++i){
    if(input.rows[i].w<=0||input.rows[i].h<=0)return out;
    total+=input.rows[i].h+(i?4:0);
  }
  if(total>area.h || input.heading.w>area.w)return out;
  for(int i=0;i<input.count;++i)if(input.rows[i].w>area.w)return out;
  int y=area.y+(area.h-total)/2;
  const Rect heading=centered(area,input.heading,y);
  y+=input.heading.h+6;
  Rect rows[2]={};
  for(int i=0;i<input.count;++i){
    if(i)y+=4;
    rows[i]=centered(area,input.rows[i],y);
    y+=input.rows[i].h;
  }
  if(!DateEditorialPlan::inside(heading,area))return out;
  for(int i=0;i<input.count;++i){
    if(!DateEditorialPlan::inside(rows[i],area))return out;
    if(DateEditorialPlan::overlap(heading,rows[i]))return out;
    for(int k=0;k<i;++k)if(DateEditorialPlan::overlap(rows[k],rows[i]))
      return out;
  }
  out.valid=true;out.heading=heading;
  for(int i=0;i<input.count;++i)out.rows[i]=rows[i];
  return out;
}
}
