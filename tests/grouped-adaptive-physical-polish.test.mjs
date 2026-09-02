import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8')

test('adaptive-only physical header polish is present across the grouped modules',()=>{
  const checks={
    'frame/src/modules/ModuleWeather.cpp':/underlineW[\s\S]*fillRect/,
    'frame/src/modules/ModuleReminders.cpp':/headingText[\s\S]*lineW[\s\S]*fillRect/,
    'frame/src/modules/ModuleCountdown.cpp':/COMING UP[\s\S]*headingW[\s\S]*fillRect/,
    'frame/src/modules/ModuleSurf.cpp':/comp\.showSpot[\s\S]*lineW[\s\S]*fillRect/,
    'frame/src/modules/ModuleStocks.cpp':/titleH[\s\S]*lineW[\s\S]*fillRect/,
  }
  for(const [file,pattern] of Object.entries(checks)){const source=read(file);assert.match(source,pattern,file)}
})

test('adaptive Date padding, Soccer table width and Groceries rhythm are geometry-aware',()=>{
  assert.match(read('frame/src/modules/ModuleDate.cpp'),/adaptiveMicro \? 8 : 10/)
  assert.match(read('app/lib/dateResponsive.mjs'),/micro\?8:10/)
  assert.match(read('frame/src/modules/ModuleSoccer.cpp'),/teamW = max\(1, r\.w - factW \* \(columns - 1\)\)/)
  assert.match(read('frame/src/modules/ModuleGroceries.cpp'),/headerH \+ 8/)
  assert.match(read('app/lib/groceriesResponsive.mjs'),/rowGap=5,listY=headerRect\.y\+headerRect\.height\+8/)
})

test('Norwegian AI Follow chrome uses natural singular and plural topic forms',()=>{
  const assistant=read('frame/src/modules/ModuleAssistant.cpp')
  assert.match(assistant,/Følger 1 tema/)
  assert.match(assistant,/Følger %u temaer/)
  assert.doesNotMatch(assistant,/tema%s/)
  assert.match(assistant,/copyDisplay\(displayText,sizeof\(displayText\),text\)/)
})
