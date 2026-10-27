// EXPERIMENTAL Date editorial ensemble: role-based, NOT imported by live app or frame.
// Based on Layout Lab original full-screen Date PDF (2026-10-23, page 1).
// Calendar and day typography are composed TOGETHER, never leftover-zone packing.
// No colSpan/rowSpan branches or decorative requirement for smaller cells.
import {DateRolePolicy as P} from './dateRolePolicy.generated.mjs'
import {measureDateGfxInk as measure} from './dateGfxInk.mjs'
import {dateCalendarFeatures} from './dateResponsive.mjs'

const rect=(x,y,w,h)=>({x,y,w,h})
const inside=(a,b)=>a && a.w>0 && a.h>0 && a.x>=b.x && a.y>=b.y &&
  a.x+a.w<=b.x+b.w && a.y+a.h<=b.y+b.h
const overlaps=(a,b)=>Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x) &&
  Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y)
const validMonth=(year,month)=>Number.isInteger(year)&&year>=P.CONTEXT_YEAR_MIN &&
  year<=P.CONTEXT_YEAR_MAX&&Number.isInteger(month)&&month>=0&&month<12
const centerX=(region,ink,y)=>rect(region.x+Math.floor((region.w-ink.w)/2),y,ink.w,ink.h)
const measureRole=(text,fonts)=> {
  for(const font of fonts){
    const ink=measure(text,font)
    if(ink)return {text,font,ink}
  }
  return null
}
const safeSpace=cell=>{
  if(!cell||!['x','y','w','h'].every(k=>Number.isInteger(cell[k]))||
     cell.w<=0||cell.h<=0)return null
  const x=Math.max(cell.x,P.MATTE_X),y=Math.max(cell.y,P.MATTE_Y)
  const right=Math.min(cell.x+cell.w,P.MATTE_X+P.MATTE_WIDTH)
  const bottom=Math.min(cell.y+cell.h,P.MATTE_Y+P.MATTE_HEIGHT)
  if(right<=x||bottom<=y)return null
  const vis=rect(x,y,right-x,bottom-y)
  // Same policy inset as existing measured planner. No grid-size condition.
  const spacious=vis.w>=P.SPREAD_MIN_WIDTH&&vis.h>=P.SPREAD_MIN_HEIGHT
  const tight=vis.w<P.TIGHT_WIDTH_EXCLUSIVE||vis.h<P.TIGHT_HEIGHT_EXCLUSIVE
  const inset=tight?P.INSET_TIGHT:spacious?P.INSET_SPACIOUS:P.INSET_REGULAR
  const safe=rect(x+inset,y+inset,vis.w-2*inset,vis.h-2*inset)
  return safe.w>0&&safe.h>0?{vis,safe}:null
}

/** Try a true two-column *factual ensemble* before proposing ornament/art. */
export function planDateEditorial(cell,source){
  if(!source||typeof source!=='object')return null
  const space=safeSpace(cell)
  if(!space)return null
  const {vis,safe}=space
  const monthText=source.month??source.monthName
  if(!Number.isInteger(source.day)||source.day<1||source.day>31||
    typeof monthText!=='string'||!monthText||
    typeof source.weekday!=='string'||!source.weekday||
    !validMonth(source.year,source.month0))return null
  // This first proof cannot yet place a complete holiday list. Failing closed
  // protects existing functional information until C++ parity is available.
  if(Array.isArray(source.holidays)&&source.holidays.length)return null
  const roles={
    year:measureRole(String(source.year),['DM18']),
    month:measureRole(monthText,['DM24','DM18']),
    day:measureRole(String(source.day),['Fraunces72','Fraunces48']),
    weekday:measureRole(source.weekday,['DM18'])
  }
  if(Object.values(roles).some(v=>!v))return null
  // A useful complete calendar has a title, DOW and seven legible columns.
  // Factual glyphs and calendar are peers; test several fluid divisions,
  // scored by how much readable breathing room they preserve.
  const sep=Math.max(18,Math.min(30,Math.floor(safe.w*.04)))
  const available=safe.w-sep
  const longest=Math.max(...Object.values(roles).map(v=>v.ink.w))
  const minHero=longest+Math.max(32,Math.round(longest*.32))
  const calMin=Math.max(P.CALENDAR_WEEK_WIDTH+58,254)
  const minHeight=230
  if(available<minHero+calMin||safe.h<minHeight)return null
  const candidates=[]
  // Fluid candidate widths. These fractions are editorial balance options,
  // not 4x4-specific positions; choose by actual ink and calendar capacity.
  for(const fraction of [.40,.44,.48,.52,.56]){
    const heroW=Math.floor(available*fraction),calW=available-heroW
    if(heroW<minHero||calW<calMin)continue
    const hero=rect(safe.x,safe.y,heroW,safe.h)
    const calendar=rect(hero.x+heroW+sep,safe.y+Math.floor(safe.h*.075),
      calW,Math.min(310,safe.h-Math.floor(safe.h*.15)))
    if(!inside(calendar,safe))continue
    const features=dateCalendarFeatures(calendar.w,calendar.h,{title:true})
    if(!features?.showDowHeader||!features.showMonthTitle)continue
    const extra=safe.h-(roles.year.ink.h+roles.month.ink.h+
      roles.day.ink.h+roles.weekday.ink.h)
    // Reserve a visual sprig zone when factual content leaves room.
    const artH=Math.min(84,Math.floor(safe.h*.2))
    const topPad=Math.max(14,Math.floor(safe.h*.065))
    const bottomPad=Math.max(12,Math.floor(safe.h*.04))
    const ornamentH=20
    const gaps=Math.floor((extra-artH-topPad-bottomPad-ornamentH)/3)
    if(gaps<12)continue
    let y=safe.y+topPad
    const year=centerX(hero,roles.year.ink,y);y+=roles.year.ink.h+gaps
    const month=centerX(hero,roles.month.ink,y);y+=roles.month.ink.h
    const ornament=rect(hero.x+Math.floor(hero.w*.22),y+Math.floor(gaps*.30),
      Math.floor(hero.w*.56),1)
    y+=gaps+ornamentH
    const day=centerX(hero,roles.day.ink,y);y+=roles.day.ink.h+gaps
    const weekday=centerX(hero,roles.weekday.ink,y)
    const art=rect(hero.x+Math.floor((hero.w-82)/2),weekday.y+weekday.h+14,
      82,artH)
    const factual=[year,month,day,weekday]
    if(!factual.every(v=>inside(v,hero))||!inside(art,hero)||
       factual.some(v=>overlaps(v,art))||factual.some(v=>overlaps(v,calendar))||
       factual.some((v,i)=>factual.slice(i+1).some(w=>overlaps(v,w))))continue
    // Higher score = balanced columns, genuine whitespace, useful calendar.
    const whitespace=(hero.w-longest)+(calendar.w-calMin)
    const visualBalance=100-Math.round(Math.abs(hero.w*.45-calendar.w*.55)/4)
    const score=whitespace+visualBalance+Math.min(40,Math.floor(art.h*.4))
    candidates.push({
      kind:'editorial-two-column',mode:'editorial',score,visible:vis,safe,
      regions:{hero,calendar},roles:{year,month,day,weekday},
      fonts:Object.fromEntries(Object.entries(roles).map(([k,v])=>[k,v.font])),
      text:Object.fromEntries(Object.entries(roles).map(([k,v])=>[k,v.text])),
      boxes:{year,month,day,weekday},
      calendar:{rect:calendar,year:source.year,month0:source.month0,features},
      ornaments:{monthRule:ornament,botanical:art},
      illustration:{role:'botanical-sprig',rect:art,optional:true},
      monthRollover:'calendar derives year and month from source; never synthetic'
    })
  }
  candidates.sort((a,b)=>b.score-a.score)
  return candidates[0]??null
}
