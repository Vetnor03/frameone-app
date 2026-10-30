// R4.6 experimental Date compact geometry — exact mirror of the C++11
// DateEditorialCompactPlan.h, NOT imported by the current app/frame.
// All glyph rectangles supplied as measured original-GFX integer INK.
import {DateRolePolicy as P} from './dateRolePolicy.generated.mjs'
const rect=(x,y,w,h)=>({x,y,w,h})
const inside=(a,b)=>a.w>0&&a.h>0&&a.x>=b.x&&a.y>=b.y&&
  a.x+a.w<=b.x+b.w&&a.y+a.h<=b.y+b.h
const overlap=(a,b)=>Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)&&
  Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y)
const validInk=i=>i&&Number.isInteger(i.w)&&Number.isInteger(i.h)&&
  i.w>0&&i.h>0
export function planDateEditorialCompact(input){
  if(!input||typeof input!=='object')return null
  const {cell:c,day:d,month:m,weekday:w,year:y}=input
  if(!c||!['x','y','w','h'].every(k=>Number.isInteger(c[k]))||
     c.w<=0||c.h<=0||!validInk(d)||!validInk(w))return null
  const micro=c.w<150||c.h<88||(c.w<230&&c.h<140)
  const shallow=!micro&&c.w>c.h&&c.h<170
  // Complete existing factual disclosure; no calendars are ever dropped.
  const maybeCalendar=(c.w>=430&&c.h>=210)||(c.w>=330&&c.h>=400)
  const stack=!micro&&!shallow&&!maybeCalendar&&c.h>=170
  if(!micro&&!shallow&&!stack)return null
  const hasYear=stack||(shallow&&c.w>=500)
  const hasMonth=shallow||stack
  if(hasMonth&&!validInk(m))return null
  if(hasYear&&!validInk(y))return null
  if(!inside(c,rect(0,0,P.PANEL_WIDTH,P.PANEL_HEIGHT)))return null
  const inset=micro?8:12
  const safe=rect(c.x+inset,c.y+inset,c.w-2*inset,c.h-2*inset)
  if(safe.w<=0||safe.h<=0)return null
  let day,month=null,weekday,year=null,group,botanical=null,art=false
  if(micro){
    const gap=12
    const groupW=Math.max(d.w,w.w)
    const groupH=d.h+gap+w.h
    if(groupW>safe.w||groupH>safe.h)return null
    group=rect(safe.x+Math.floor((safe.w-groupW)/2),
      safe.y+Math.floor((safe.h-groupH)/2),groupW,groupH)
    day=rect(group.x+Math.floor((group.w-d.w)/2),group.y,d.w,d.h)
    weekday=rect(group.x+Math.floor((group.w-w.w)/2),
      day.y+day.h+gap,w.w,w.h)
  }else if(shallow){
    const lineGap=12,colsGap=Math.max(16,Math.min(30,Math.floor(safe.w/20)))
    const contextW=Math.max(m.w,w.w)
    const contextH=m.h+lineGap+w.h
    const groupW=d.w+colsGap+contextW+(hasYear?colsGap+y.w:0)
    const groupH=Math.max(d.h,contextH,hasYear?y.h:0)
    if(groupW>safe.w||groupH>safe.h)return null
    group=rect(safe.x+Math.floor((safe.w-groupW)/2),
      safe.y+Math.floor((safe.h-groupH)/2),groupW,groupH)
    day=rect(group.x,group.y+Math.floor((groupH-d.h)/2),d.w,d.h)
    const contextX=day.x+day.w+colsGap
    const contextY=group.y+Math.floor((groupH-contextH)/2)
    month=rect(contextX+Math.floor((contextW-m.w)/2),
      contextY,m.w,m.h)
    weekday=rect(contextX+Math.floor((contextW-w.w)/2),
      month.y+month.h+lineGap,w.w,w.h)
    if(hasYear)year=rect(contextX+contextW+colsGap,
      group.y+Math.floor((groupH-y.h)/2),y.w,y.h)
  }else{
    let gap=Math.max(12,Math.min(24,Math.floor(safe.h/12)))
    const groupW=Math.max(d.w,m.w,y.w,w.w)
    const factsH=y.h+m.h+d.h+w.h
    let groupH=factsH+3*gap
    if(groupW>safe.w||groupH>safe.h)return null
    // Same original 84:88 ink and optional measured 14px fact rhythm.
    const artH=Math.min(56,Math.max(36,Math.floor(safe.h/5)))
    const artW=Math.floor(artH*84/88)
    const artGap=10,outer=8
    const extra=artH+artGap
    art=artW<=safe.w&&groupH+extra+2*outer<=safe.h
    if(!art&&artW<=safe.w&&gap>14&&
       factsH+3*14+extra+2*outer<=safe.h){
      gap=14;groupH=factsH+3*gap;art=true
    }
    const ensembleH=groupH+(art?extra:0)
    group=rect(safe.x+Math.floor((safe.w-groupW)/2),
      safe.y+Math.floor((safe.h-ensembleH)/2),groupW,groupH)
    if(art)botanical=rect(safe.x+Math.floor((safe.w-artW)/2),
      group.y+groupH+artGap,artW,artH)
    year=rect(group.x+Math.floor((groupW-y.w)/2),group.y,y.w,y.h)
    month=rect(group.x+Math.floor((groupW-m.w)/2),
      year.y+year.h+gap,m.w,m.h)
    day=rect(group.x+Math.floor((groupW-d.w)/2),
      month.y+month.h+gap,d.w,d.h)
    weekday=rect(group.x+Math.floor((groupW-w.w)/2),
      day.y+day.h+gap,w.w,w.h)
  }
  if(!inside(day,safe)||!inside(weekday,safe)||overlap(day,weekday))
    return null
  if(hasMonth&&(!inside(month,safe)||overlap(day,month)||
     overlap(month,weekday)))return null
  if(hasYear&&(!inside(year,safe)||overlap(year,day)||
     overlap(year,month)||overlap(year,weekday)))return null
  if(art&&(!inside(botanical,safe)||overlap(botanical,day)||
    overlap(botanical,month)||overlap(botanical,weekday)||
    overlap(botanical,year)))return null
  return {kind:'editorial-compact',mode:micro?'micro':shallow?'ribbon':'stack',
    valid:true,showMonth:hasMonth,showYear:hasYear,
    safe,group,day,month,weekday,year,art,botanical}
}
