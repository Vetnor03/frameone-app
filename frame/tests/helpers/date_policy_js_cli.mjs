// Test-only JS reference CLI for parity; not imported into Studio runtime.
import {readFileSync} from 'node:fs'
import {planMeasuredDate} from '../../../app/lib/dateRolePlanner.mjs'
function printRect(r){return [r.x,r.y,r.w,r.h].join(',')}
function serialize(p){
  if(!p)return 'fallback'
  return [p.mode,...['visible','group','month','day','weekday'].map(k=>printRect(p[k]))].join('|')
}
const input=readFileSync(0,'utf8').trim()
if(input){
  for(const line of input.split(/\r?\n/)){
    const v=line.trim().split(/\s+/).map(Number)
    if(v.length!==10||v.some(n=>!Number.isSafeInteger(n)))throw Error('invalid test fixture')
    const [x,y,cw,ch,dw,dh,mw,mh,ww,wh]=v
    const p=planMeasuredDate({x,y,w:cw,h:ch},{
      day:{w:dw,h:dh},month:{w:mw,h:mh},weekday:{w:ww,h:wh}
    })
    console.log(serialize(p))
  }
}
