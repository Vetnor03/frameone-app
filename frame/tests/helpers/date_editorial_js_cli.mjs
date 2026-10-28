// JS original-F1 input measurements for native Date editorial parity.
import {readFileSync} from 'node:fs'
import {measureDateGfxInk as measure} from '../../../app/lib/dateGfxInk.mjs'
import {planDateEditorial} from '../../../app/lib/dateEditorialComposition.mjs'
const text=readFileSync(0,'utf8').trim()
function dims(s,font){
  const ink=typeof s==='string'?measure(s,font):null
  return ink?[ink.w,ink.h]:[0,0]
}
if(text)for(const line of text.split(/\r?\n/)){
  const {cell,facts}=JSON.parse(line)
  const year=Number.isInteger(facts?.year)?String(facts.year):null
  const day=Number.isInteger(facts?.day)?String(facts.day):null
  const month=typeof facts?.month==='string'?facts.month:facts?.monthName
  const weekday=facts?.weekday
  const args=[
    cell.x,cell.y,cell.w,cell.h,
    Number.isInteger(facts?.year)?facts.year:0,
    Number.isInteger(facts?.month0)?facts.month0:-1,
    Number.isInteger(facts?.day)?facts.day:0,
    Array.isArray(facts?.holidays)?facts.holidays.length:0,
    ...dims(year,'DM18'),...dims(weekday,'DM18'),
    ...dims(day,'Fraunces72'),...dims(day,'Fraunces48'),
    ...dims(month,'DM24'),...dims(month,'DM18')
  ]
  console.log(JSON.stringify({args,editorial:planDateEditorial(cell,facts)}))
}
