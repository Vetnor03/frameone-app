// Test-only serialization from real F1 ink + existing JS content planner.
// The C++ implementation independently repeats reservation decisions.
import {readFileSync} from 'node:fs'
import {planDateDisclosure} from '../../../app/lib/dateContentPlanner.mjs'
import {measureDateGfxInk} from '../../../app/lib/dateGfxInk.mjs'
const minYear=1900,maxYear=9999
function metric(text){return measureDateGfxInk(text,'DM18')??{w:0,h:0}}
function validMonth(y,m){return Number.isInteger(y)&&y>=minYear&&y<=maxYear&&Number.isInteger(m)&&m>=0&&m<=11}
function getInput(plan,facts){
  if(!plan)return null
  const year=Number.isInteger(facts.year)&&facts.year>=minYear&&facts.year<=maxYear?
    metric(String(facts.year)):{w:0,h:0}
  const metrics=[]
  for(const item of (Array.isArray(facts.holidays)?facts.holidays:[]).slice(0,2)){
    if(typeof item?.dateLabel!=='string'||typeof item?.title!=='string')break
    const ink=measureDateGfxInk(item.dateLabel+' - '+item.title,'DM18')
    if(!ink)break
    metrics.push([ink.w,ink.h])
  }
  while(metrics.length<2)metrics.push([0,0])
  const v=plan.visible,g=plan.group
  return [
    v.x,v.y,v.w,v.h,g.x,g.y,g.w,g.h,
    validMonth(facts.year,facts.month0)?1:0,
    validMonth(facts.nextMonthYear,facts.nextMonth0)?1:0,
    year.w,year.h,
    (Array.isArray(facts.holidays)?facts.holidays:[]).slice(0,2).length,
    ...metrics.flat()
  ]
}
const text=readFileSync(0,'utf8').trim()
if(text)for(const row of text.split(/\r?\n/)){
  const {cell,facts}=JSON.parse(row)
  const plan=planDateDisclosure(cell,facts)
  console.log(JSON.stringify({plan,args:getInput(plan,facts)}))
}
