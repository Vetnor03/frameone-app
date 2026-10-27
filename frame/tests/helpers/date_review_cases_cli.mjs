// Bulk Date geometry for static original-bitmap review gallery. No UI imports.
import {readFileSync} from 'node:fs'
import {planDateWithRealGfx} from '../../../app/lib/dateGfxInk.mjs'
import {planDateDisclosure} from '../../../app/lib/dateContentPlanner.mjs'
const input=readFileSync(0,'utf8').trim()
if(input)for(const line of input.split(/\r?\n/)){
  const {cell,facts}=JSON.parse(line)
  const hero=planDateWithRealGfx(cell,facts)
  const context=planDateDisclosure(cell,facts)
  console.log(JSON.stringify({hero,context}))
}
