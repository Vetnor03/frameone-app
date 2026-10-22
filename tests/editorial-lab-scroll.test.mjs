import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const lab=readFileSync(new URL('../app/editorial-lab/page.tsx',import.meta.url),'utf8')
const browser=readFileSync(new URL('../scripts/editorial-browser-audit.mjs',import.meta.url),'utf8')

test('editorial Lab has its own touch-friendly scroll viewport under global overflow lock',()=>{
  assert.match(lab,/data-editorial-scroll="true"/)
  assert.match(lab,/h-dvh min-h-0 w-full overflow-x-hidden overflow-y-auto/)
  assert.match(lab,/WebkitOverflowScrolling:'touch'/)
  assert.match(browser,/width:390,height:700/)
  assert.match(browser,/el\.scrollTop=140/)
})
