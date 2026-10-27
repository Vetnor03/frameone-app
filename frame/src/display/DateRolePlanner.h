#pragma once
// Pure C++11 role-first Date geometry planner: unconnected to frame renderer.
// Accepts caller-measured glyph ink sizes; never assumes content by grid dimensions.
#include "DateRolePolicy.generated.h"
namespace DateRolePlanner {
struct Rect { int x, y, w, h; };
struct Ink { int w,h; };
struct Input { Rect cell; Ink day,month,weekday; };
enum Mode { FALLBACK=0, STACK=1, RIBBON=2, CARD=3 };
struct Plan { Mode mode; Rect visible, group, month,day,weekday; bool valid; };
inline int minI(int a,int b){return a<b?a:b;}
inline int maxI(int a,int b){return a>b?a:b;}
inline Rect rect(int x,int y,int w,int h){return {x,y,w,h};}
inline Rect centered(Rect area,int w,int h){
  return rect(area.x+(area.w-w)/2,area.y+(area.h-h)/2,w,h);
}
inline Plan plan(const Input& input){
  Plan out = {}; out.mode=FALLBACK; out.valid=false;
  const Rect c=input.cell;
  const Ink d=input.day,m=input.month,w=input.weekday;
  if(c.w<=0||c.h<=0||d.w<=0||d.h<=0||m.w<=0||m.h<=0||w.w<=0||w.h<=0)return out;
  const int l=maxI(c.x,DateRolePolicy::MATTE_X);
  const int t=maxI(c.y,DateRolePolicy::MATTE_Y);
  const int r=minI(c.x+c.w,DateRolePolicy::MATTE_X+DateRolePolicy::MATTE_WIDTH);
  const int b=minI(c.y+c.h,DateRolePolicy::MATTE_Y+DateRolePolicy::MATTE_HEIGHT);
  const int vw=r-l,vh=b-t;
  if(vw<=0||vh<=0)return out;
  const bool spacious=vw>=DateRolePolicy::SPREAD_MIN_WIDTH&&vh>=DateRolePolicy::SPREAD_MIN_HEIGHT;
  const bool tight=vw<DateRolePolicy::TIGHT_WIDTH_EXCLUSIVE||vh<DateRolePolicy::TIGHT_HEIGHT_EXCLUSIVE;
  const int inset=tight?DateRolePolicy::INSET_TIGHT:
    spacious?DateRolePolicy::INSET_SPACIOUS:DateRolePolicy::INSET_REGULAR;
  const int gap=tight?DateRolePolicy::GAP_TIGHT:
    spacious?DateRolePolicy::GAP_SPACIOUS:DateRolePolicy::GAP_REGULAR;
  const Rect safe=rect(l+inset,t+inset,vw-2*inset,vh-2*inset);
  if(safe.w<=0||safe.h<=0)return out;
  struct Candidate { Mode mode;int w,h; };
  const Candidate options[3]={
    {STACK,maxI(d.w,maxI(m.w,w.w)),d.h+m.h+w.h+2*gap},
    {RIBBON,d.w+gap+maxI(m.w,w.w),maxI(d.h,m.h+gap+w.h)},
    {CARD,maxI(m.w,d.w+gap+w.w),m.h+gap+maxI(d.h,w.h)}
  };
  int best=-1,score=2147483647;
  for(int i=0;i<3;++i){
    const Candidate a=options[i];
    if(a.w>safe.w||a.h>safe.h)continue;
    const int penalty=maxI(a.w*1000/safe.w,a.h*1000/safe.h);
    if(penalty<score){best=i;score=penalty;}
  }
  if(best<0)return out;
  const Candidate chosen=options[best];
  const Rect group=centered(safe,chosen.w,chosen.h);
  Rect month={},day={},weekday={};
  if(chosen.mode==STACK){
    month=rect(group.x+(group.w-m.w)/2,group.y,m.w,m.h);
    day=rect(group.x+(group.w-d.w)/2,month.y+m.h+gap,d.w,d.h);
    weekday=rect(group.x+(group.w-w.w)/2,day.y+d.h+gap,w.w,w.h);
  }else if(chosen.mode==RIBBON){
    const int contextHeight=m.h+gap+w.h;
    day=rect(group.x,group.y+(group.h-d.h)/2,d.w,d.h);
    month=rect(group.x+d.w+gap,group.y+(group.h-contextHeight)/2,m.w,m.h);
    weekday=rect(month.x,month.y+m.h+gap,w.w,w.h);
  }else{
    const int rowHeight=maxI(d.h,w.h);
    month=rect(group.x+(group.w-m.w)/2,group.y,m.w,m.h);
    day=rect(group.x,group.y+m.h+gap+(rowHeight-d.h)/2,d.w,d.h);
    weekday=rect(group.x+d.w+gap,group.y+m.h+gap+(rowHeight-w.h)/2,w.w,w.h);
  }
  out.mode=chosen.mode;out.visible=rect(l,t,vw,vh);out.group=group;
  out.month=month;out.day=day;out.weekday=weekday;out.valid=true;
  return out;
}
} // namespace DateRolePlanner
