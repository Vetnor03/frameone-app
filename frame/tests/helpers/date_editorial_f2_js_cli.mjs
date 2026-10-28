// Test-only original F1 bearings for the native EditorialText::LinePlan.
import {readFileSync} from 'node:fs'
import {planDateEditorial} from '../../../app/lib/dateEditorialComposition.mjs'
import {measureDateGfxInk} from '../../../app/lib/dateGfxInk.mjs'
const src=readFileSync(0,'utf8').trim()
if(src)for(const line of src.split(/\r?\n/)){
  const {cell,facts}=JSON.parse(line)
  const editorial=planDateEditorial(cell,facts)
  const cursors={}
  if(editorial)for(const name of ['year','month','day','weekday']){
    const ink=measureDateGfxInk(editorial.text[name],editorial.fonts[name])
    const box=editorial.boxes[name]
    cursors[name]=[box.x-ink.minX,box.y-ink.minY]
  }
  console.log(JSON.stringify({editorial,cursors}))
}
