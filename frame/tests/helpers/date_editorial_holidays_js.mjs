import {readFileSync} from 'node:fs'
import {planDateEditorial} from '../../../app/lib/dateEditorialComposition.mjs'
import {planEditorialHolidays} from '../../../app/lib/dateEditorialHolidays.mjs'
import {measureDateGfxInk} from '../../../app/lib/dateGfxInk.mjs'
const input=readFileSync(0,'utf8').trim()
function dims(v){return v?[v.w,v.h]:[0,0]}
if(input)for(const row of input.split(/\r?\n/)){
  const {cell,facts}=JSON.parse(row)
  const editorial=planDateEditorial(cell,{...facts,holidays:[]})
  const lines=(facts.holidays??[]).slice(0,2).map(h=>h.dateLabel+' - '+h.title)
  const head=lines.length?measureDateGfxInk('UPCOMING HOLIDAYS','DM18'):null
  const ink=lines.map(s=>measureDateGfxInk(s,'DM18'))
  const result=planEditorialHolidays(editorial,head,ink)
  const hero=editorial?.regions.hero??{x:0,y:0,w:0,h:0}
  const weekday=editorial?.boxes.weekday??{x:0,y:0,w:0,h:0}
  const botanical=editorial?.ornaments.botanical??{x:0,y:0,w:0,h:0}
  const rect=r=>[r.x,r.y,r.w,r.h]
  console.log(JSON.stringify({result,
    args:[editorial?1:0,editorial?.illustration?1:0,
      ...rect(hero),...rect(weekday),...rect(botanical),
      lines.length,...dims(head),...dims(ink[0]),...dims(ink[1])]}))
}
