// Dedicated QA only: original measured editorial dual-calendar and holiday plans.
import {readFileSync} from 'node:fs'
import {planDateEditorial} from '../../../app/lib/dateEditorialComposition.mjs'
import {planDateDualCalendar} from '../../../app/lib/dateDualCalendar.mjs'
import {planEditorialHolidays} from '../../../app/lib/dateEditorialHolidays.mjs'
import {measureDateGfxInk} from '../../../app/lib/dateGfxInk.mjs'
const src=readFileSync(0,'utf8').trim()
if(src)for(const row of src.split(/\r?\n/)){
  const {cell,facts}=JSON.parse(row)
  const editorial=planDateEditorial(cell,{...facts,holidays:[]})
  const dual=planDateDualCalendar(editorial,facts)
  const labels=(facts.holidays??[]).slice(0,2)
    .map(h=>h.dateLabel+' - '+h.title)
  const ink=labels.map(s=>measureDateGfxInk(s,'DM18'))
  const heading=labels.length?
    measureDateGfxInk('UPCOMING HOLIDAYS','DM18'):null
  const holiday=planEditorialHolidays(editorial,heading,ink)
  const accepted=Boolean(editorial&&dual&&holiday)
  console.log(JSON.stringify({editorial,dual,holiday,accepted,labels}))
}
