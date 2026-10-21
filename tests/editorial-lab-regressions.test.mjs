import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const source=readFileSync(new URL('../app/editorial-lab/page.tsx',import.meta.url),'utf8')

test('the Surf preview retains physical frame six rounded rating rectangles',()=>{
  assert.doesNotMatch(source,/primary:'3 \/ 6'/)
  assert.match(source,/function SurfRatingBlocks\(/)
  assert.match(source,/Array\.from\(\{length:6\}/)
  assert.match(source,/fill=\{i<3\?ink:'none'\}/)
  assert.match(source,/Poor to Fair/)
})

test('Date does not use a calendar grid in short spread cells and compacts its day stack',()=>{
  assert.match(source,/const dateWithCalendar=roomy&&height>=350/)
  assert.match(source,/height<190\?<\>/)
  assert.match(source,/\{dateWithCalendar&&<g>/)
})

test('concept Lab reserves dense footer content to full-height cells, not medium and Surf layouts',()=>{
  assert.match(source,/const showExtras=module!=='surf'&&module!=='date'/)
  assert.match(source,/height>=460&&width>=300/)
  assert.match(source,/fitCopy\(v.primary,textWidth/)
})

test('concept Lab explicitly disclaims firmware pixel accuracy',()=>{
  assert.match(source,/not a pixel-perfect preview of the physical firmware/)
})
