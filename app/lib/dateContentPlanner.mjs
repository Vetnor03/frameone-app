// Date content-disclosure prototype. NOT wired to the live renderer.
// Uses measured original F1 glyph extents and matte-visible free rectangles.
import {DateRolePolicy as P} from './dateRolePolicy.generated.mjs'
import {measureDateGfxInk, planDateWithRealGfx} from './dateGfxInk.mjs'
import {dateCalendarFeatures, DATE_CALENDAR_MIN} from './dateResponsive.mjs'

const box=(x,y,w,h)=>({x,y,w,h})
const center=(r,w,h)=>box(r.x+Math.floor((r.w-w)/2),r.y+Math.floor((r.h-h)/2),w,h)
const valid=r=>r && r.w>0 && r.h>0
function visible(c){
  if(!c||!['x','y','w','h'].every(k=>Number.isInteger(c[k]))||c.w<=0||c.h<=0)return null
  const x=Math.max(c.x,P.MATTE_X),y=Math.max(c.y,P.MATTE_Y)
  const w=Math.min(c.x+c.w,P.MATTE_X+P.MATTE_WIDTH)-x
  const h=Math.min(c.y+c.h,P.MATTE_Y+P.MATTE_HEIGHT)-y
  return w>0&&h>0?box(x,y,w,h):null
}
function safe(v){
  const tight=v.w<P.TIGHT_WIDTH_EXCLUSIVE||v.h<P.TIGHT_HEIGHT_EXCLUSIVE
  const wide=v.w>=P.SPREAD_MIN_WIDTH&&v.h>=P.SPREAD_MIN_HEIGHT
  const pad=tight?P.INSET_TIGHT:wide?P.INSET_SPACIOUS:P.INSET_REGULAR
  return {r:box(v.x+pad,v.y+pad,v.w-2*pad,v.h-2*pad),
    gap:tight?P.GAP_TIGHT:wide?P.GAP_SPACIOUS:P.GAP_REGULAR}
}
function duo(r,gap,day,context){
  const variants=[
    {name:'column',w:Math.max(day.w,context.w),h:day.h+gap+context.h},
    {name:'ribbon',w:day.w+gap+context.w,h:Math.max(day.h,context.h)}
  ]
  let best=null,score=Infinity
  for(const p of variants){
    if(p.w>r.w||p.h>r.h)continue
    const candidate=Math.max(Math.floor(1000*p.w/r.w),Math.floor(1000*p.h/r.h))
    if(candidate<score){best=p;score=candidate}
  }
  if(!best)return null
  const group=center(r,best.w,best.h)
  const dayRect=best.name==='column'
    ?box(group.x+Math.floor((group.w-day.w)/2),group.y,day.w,day.h)
    :box(group.x,group.y+Math.floor((group.h-day.h)/2),day.w,day.h)
  const contextRect=best.name==='column'
    ?box(group.x+Math.floor((group.w-context.w)/2),group.y+day.h+gap,context.w,context.h)
    :box(group.x+day.w+gap,group.y+Math.floor((group.h-context.h)/2),context.w,context.h)
  return {mode:'pair-'+best.name,group,dayRect,contextRect}
}
function dateCore(cell,facts){
  const v=visible(cell)
  if(!v||!Number.isInteger(facts.day)||facts.day<1||facts.day>31)return null
  const {r,gap}=safe(v)
  if(!valid(r))return null
  const complete=planDateWithRealGfx(cell,facts)
  if(complete)return {visible:v,group:complete.group,mode:complete.mode,
    boxes:{day:complete.day,month:complete.month,weekday:complete.weekday},
    fonts:complete.fonts,omitted:[]}
  for(const font of ['Fraunces72','Fraunces48']){
    const day=measureDateGfxInk(String(facts.day),font)
    if(!day)continue
    for(const field of ['month','weekday']){
      if(typeof facts[field]!=='string'||!facts[field])continue
      for(const f of ['DM24','DM18']){
        const ink=measureDateGfxInk(facts[field],f)
        if(!ink)continue
        const plan=duo(r,gap,day,ink)
        if(plan)return {visible:v,group:plan.group,mode:plan.mode,
          boxes:{day:plan.dayRect,[field]:plan.contextRect},
          fonts:{day:font,[field]:f},
          omitted:['month','weekday'].filter(k=>k!==field)}
      }
    }
    if(day.w<=r.w&&day.h<=r.h){
      const group=center(r,day.w,day.h)
      return {visible:v,group,mode:'hero-only',boxes:{day:group},
        fonts:{day:font},omitted:['month','weekday']}
    }
  }
  return null
}
// Disjoint free regions; reserving one removes its entire region. We never
// place a calendar or annotation on top of the essential factual group.
function zones(core){
  const {r,gap}=safe(core.visible),g=core.group
  return [
    box(r.x,r.y,g.x-r.x-gap,r.h),
    box(g.x+g.w+gap,r.y,r.x+r.w-g.x-g.w-gap,r.h),
    box(g.x,r.y,g.w,g.y-r.y-gap),
    box(g.x,g.y+g.h+gap,g.w,r.y+r.h-g.y-g.h-gap)
  ].filter(valid)
}
function reserve(available,minW,minH,maxW,maxH){
  const fitting=available.filter(r=>r.w>=minW&&r.h>=minH)
  fitting.sort((a,b)=>Math.min(b.w,maxW)*Math.min(b.h,maxH)-
    Math.min(a.w,maxW)*Math.min(a.h,maxH))
  if(!fitting.length)return null
  const chosen=fitting[0]
  available.splice(available.indexOf(chosen),1)
  return center(chosen,Math.min(chosen.w,maxW),Math.min(chosen.h,maxH))
}
const monthValid=(y,m)=>Number.isInteger(y)&&y>=1900&&y<=9999&&
  Number.isInteger(m)&&m>=0&&m<=11
function calendar(available,year,month0){
  if(!monthValid(year,month0))return null
  const rect=reserve(available,DATE_CALENDAR_MIN.gridWidth,
    DATE_CALENDAR_MIN.gridHeight,300,240)
  return rect?{rect,year,month0,features:dateCalendarFeatures(rect.w,rect.h,{title:true})}:null
}
function yearFact(available,year){
  if(!Number.isInteger(year)||year<1900||year>9999)return null
  const ink=measureDateGfxInk(String(year),'DM18')
  if(!ink)return null
  const region=reserve(available,ink.w+12,ink.h+12,150,48)
  return region?{text:String(year),font:'DM18',rect:center(region,ink.w,ink.h)}:null
}
function holidayFacts(available,holidays){
  if(!Array.isArray(holidays)||!holidays.length)return []
  const rows=[]
  for(const item of holidays.slice(0,2)){
    if(typeof item?.dateLabel!=='string'||typeof item?.title!=='string')break
    const text=item.dateLabel+' · '+item.title
    const ink=measureDateGfxInk(text,'DM18')
    if(!ink)break
    rows.push({text,ink})
  }
  while(rows.length){
    const h=rows.reduce((v,e)=>v+e.ink.h,0)+(rows.length-1)*6
    const w=Math.max(...rows.map(e=>e.ink.w))
    const region=reserve(available,w+12,h+12,w+24,h+24)
    if(region){
      let y=region.y+Math.floor((region.h-h)/2)
      return rows.map(e=>{
        const result={text:e.text,font:'DM18',
          rect:box(region.x+Math.floor((region.w-e.ink.w)/2),y,e.ink.w,e.ink.h)}
        y+=e.ink.h+6
        return result
      })
    }
    rows.pop()
  }
  return []
}
// Geometry eligibility is not calendar drawing approval. Existing calendar
// and holiday runtime behavior is unchanged until opt-in integration.
export function planDateDisclosure(cell,input){
  if(!input||typeof input!=='object')return null
  const facts={...input,month:input.month??input.monthName}
  const core=dateCore(cell,facts)
  if(!core)return null
  const free=zones(core)
  const current=calendar(free,facts.year,facts.month0)
  const year=yearFact(free,facts.year)
  const next=current?calendar(free,facts.nextMonthYear,facts.nextMonth0):null
  const holidays=holidayFacts(free,facts.holidays)
  return {...core,calendar:current,year,nextCalendar:next,holidays,
    illustration:null,
    omitted:[...core.omitted,...(!current?['currentCalendar']:[]),
      ...(!year?['year']:[]),...(!next?['nextCalendar']:[]),
      ...(!holidays.length?['holidays']:[])]}
}
