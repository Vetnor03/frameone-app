import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8')

test('adaptive-only physical header polish is present across the grouped modules',()=>{
  const checks={
    'frame/src/modules/ModuleWeather.cpp':/underlineW[\s\S]*fillRect/,
    'frame/src/modules/ModuleReminders.cpp':/headingText[\s\S]*lineW[\s\S]*fillRect/,
    'frame/src/modules/ModuleCountdown.cpp':/COMING UP[\s\S]*headingW[\s\S]*fillRect/,
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

test('adaptive Surf keeps its spot underline in each visible responsive heading family',()=>{
  const source=read('frame/src/modules/ModuleSurf.cpp')
  const section=(begin,end)=>{
    const start=source.indexOf(begin)
    const stop=source.indexOf(end,start+begin.length)
    assert.ok(start>=0 && stop>start,`Surf renderer missing: ${begin}`)
    return source.slice(start,stop)
  }

  // Adaptive Surf was refactored to geometry families, so the former
  // comp.showSpot dispatch no longer appears in this implementation.
  const strip=section('static void renderAdaptiveRatingStrip(', 'static void renderAdaptiveSmallFamily(')
  assert.match(strip,/if\(showSpot && spot && spot\[0\] && ih>=100\)/)
  assert.match(strip,/drawTextCenteredInRect\(ix,cy,iw,titleH,spot,FONT_B12,ink\)/)
  assert.match(strip,/const int lw=min\(iw-8,\(int\)tw\)/)
  assert.match(strip,/fillRect\(ix\+\(iw-lw\)\/2,cy\+titleH-3,lw,2,ink\)/)

  const small=section('static void renderAdaptiveSmallFamily(', 'static void renderAdaptiveMediumFamily(')
  assert.match(small,/const bool canShowSpot=c\.w>=540/)
  assert.match(small,/if\(canShowSpot\)\{[\s\S]*?drawTextCenteredInRect\(x,y,w,topH,spot,FONT_B12,ink\)/)
  assert.match(small,/fillRect\(x\+\(w-lw\)\/2,y\+topH-3,lw,2,ink\)/)
  assert.match(small,/renderAdaptiveRatingStrip\(c\.x,c\.y,c\.w,c\.h,data,wave,ink,true,spot,c\.h>=300\)/)

  const medium=section('static void renderAdaptiveMediumFamily(', 'static void renderAdaptiveSurf(')
  assert.match(medium,/drawTextCenteredInRect\(x,y,w,titleH,spot,FONT_B12,ink\)/)
  assert.match(medium,/const int lineW=min\(w-8,\(int\)sw\)/)
  assert.match(medium,/fillRect\(x\+\(w-lineW\)\/2,y\+titleH-3,lineW,2,ink\)/)

  const dispatch=section('static void renderAdaptiveSurf(', 'static void renderCommon(')
  assert.match(dispatch,/renderAdaptiveSmallFamily\(c,data,spot,wave,ink\)/)
  assert.match(dispatch,/renderAdaptiveMediumFamily\(c,data,spot,wave,ink/)
})
