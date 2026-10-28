import {readFileSync} from 'node:fs'
import {planDateEditorial} from '../../../app/lib/dateEditorialComposition.mjs'
import {planDateDualCalendar} from '../../../app/lib/dateDualCalendar.mjs'
const input=readFileSync(0,'utf8').trim()
if(input)for(const row of input.split(/\r?\n/)){
  const {cell,facts}=JSON.parse(row)
  const editorial=planDateEditorial(cell,facts)
  const dual=planDateDualCalendar(editorial,facts)
  const a=editorial?[
    1,
    ...Object.values(editorial.visible),
    ...Object.values(editorial.safe),
    ...Object.values(editorial.regions.hero),
    ...Object.values(editorial.calendar.rect),
    facts.year,facts.month0
  ]:null
  console.log(JSON.stringify({dual,args:a}))
}
