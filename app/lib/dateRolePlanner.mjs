// Isolated Date geometry planner. NOT wired to Studio or production firmware.
// Inputs are measured glyph ink sizes from caller; never estimate text from grid size.
// One candidate grammar for all cells and positions; no shape-specific renderers.
import {DateRolePolicy as P} from './dateRolePolicy.generated.mjs'

const maximum = (...values) => Math.max(...values)
const rect = (x,y,w,h) => ({x,y,w,h})
const centered = (outerX,outerY,outerW,outerH,w,h) =>
  rect(outerX+Math.floor((outerW-w)/2),outerY+Math.floor((outerH-h)/2),w,h)

export function planMeasuredDate(cell, ink) {
  if(!cell || !ink || !['day','month','weekday'].every(k=>
    Number.isInteger(ink[k]?.w)&&ink[k].w>0&&
    Number.isInteger(ink[k]?.h)&&ink[k].h>0)) return null
  if(!['x','y','w','h'].every(k=>Number.isInteger(cell[k])))return null
  if(cell.w<=0||cell.h<=0)return null
  const left=Math.max(cell.x,P.MATTE_X), top=Math.max(cell.y,P.MATTE_Y)
  const right=Math.min(cell.x+cell.w,P.MATTE_X+P.MATTE_WIDTH)
  const bottom=Math.min(cell.y+cell.h,P.MATTE_Y+P.MATTE_HEIGHT)
  const vw=right-left,vh=bottom-top
  if(vw<=0||vh<=0)return null
  const spacious=vw>=P.SPREAD_MIN_WIDTH&&vh>=P.SPREAD_MIN_HEIGHT
  const tight=vw<P.TIGHT_WIDTH_EXCLUSIVE||vh<P.TIGHT_HEIGHT_EXCLUSIVE
  const inset=tight?P.INSET_TIGHT:spacious?P.INSET_SPACIOUS:P.INSET_REGULAR
  const gap=tight?P.GAP_TIGHT:spacious?P.GAP_SPACIOUS:P.GAP_REGULAR
  const safe=rect(left+inset,top+inset,vw-2*inset,vh-2*inset)
  if(safe.w<=0||safe.h<=0)return null
  const d=ink.day,m=ink.month,w=ink.weekday
  const stack={mode:'stack',w:maximum(d.w,m.w,w.w),h:d.h+m.h+w.h+2*gap}
  const ribbon={mode:'ribbon',w:d.w+gap+maximum(m.w,w.w),h:maximum(d.h,m.h+gap+w.h)}
  const card={mode:'card',w:maximum(m.w,d.w+gap+w.w),h:m.h+gap+maximum(d.h,w.h)}
  let best=null,score=Infinity
  for(const candidate of [stack,ribbon,card]){
    if(candidate.w>safe.w||candidate.h>safe.h)continue
    const penalty=maximum(Math.floor(candidate.w*1000/safe.w),
                          Math.floor(candidate.h*1000/safe.h))
    if(penalty<score){best=candidate;score=penalty}
  }
  if(!best)return null
  const group=centered(safe.x,safe.y,safe.w,safe.h,best.w,best.h)
  let month,day,weekday
  if(best.mode==='stack'){
    month=rect(group.x+Math.floor((group.w-m.w)/2),group.y,m.w,m.h)
    day=rect(group.x+Math.floor((group.w-d.w)/2),month.y+m.h+gap,d.w,d.h)
    weekday=rect(group.x+Math.floor((group.w-w.w)/2),day.y+d.h+gap,w.w,w.h)
  }else if(best.mode==='ribbon'){
    const contextHeight=m.h+gap+w.h
    day=rect(group.x,group.y+Math.floor((group.h-d.h)/2),d.w,d.h)
    month=rect(group.x+d.w+gap,group.y+Math.floor((group.h-contextHeight)/2),m.w,m.h)
    weekday=rect(month.x,month.y+m.h+gap,w.w,w.h)
  }else{
    const rowHeight=maximum(d.h,w.h)
    month=rect(group.x+Math.floor((group.w-m.w)/2),group.y,m.w,m.h)
    day=rect(group.x,group.y+m.h+gap+Math.floor((rowHeight-d.h)/2),d.w,d.h)
    weekday=rect(group.x+d.w+gap,group.y+m.h+gap+Math.floor((rowHeight-w.h)/2),w.w,w.h)
  }
  return {mode:best.mode,visible:rect(left,top,vw,vh),group,month,day,weekday}
}
