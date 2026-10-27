// Read JSON lines to test real GFX measurements and whole-plan layout.
import {readFileSync} from 'node:fs'
import {planDateWithRealGfx,measureDateGfxInk} from '../../../app/lib/dateGfxInk.mjs'
function serial(plan){
  if(!plan)return {valid:false}
  return {valid:true,mode:plan.mode,fonts:plan.fonts,
    boxes:Object.fromEntries(['visible','group','day','month','weekday'].map(k=>[k,plan[k]])),
    ink:plan.inkMetrics}
}
const input=readFileSync(0,'utf8').trim()
if(input)for(const line of input.split(/\r?\n/)){
  const v=JSON.parse(line)
  if(v.measure){
    console.log(JSON.stringify({metrics:measureDateGfxInk(v.measure.text,v.measure.font)}))
  }else console.log(JSON.stringify(serial(planDateWithRealGfx(v.cell,v.facts))))
}
