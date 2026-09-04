import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8')

test('adaptive headings use typography and spacing rather than detached underlines',()=>{
  assert.doesNotMatch(read('frame/src/modules/ModuleReminders.cpp'),/const int lineW = min\(rect\.w/)
  assert.doesNotMatch(read('frame/src/modules/ModuleWeather.cpp'),/const int underlineW = min\(inner\.w/)
  assert.doesNotMatch(read('frame/src/modules/ModuleStocks.cpp'),/const int lineW = min\(summary\.w/)
  assert.doesNotMatch(read('frame/src/modules/ModuleSurf.cpp'),/const int lineW = min\(title\.w/)
  assert.doesNotMatch(read('frame/src/modules/ModuleAssistant.cpp'),/headingWidth[\s\S]{0,120}fillRect/)
  const reminders=read('frame/src/modules/ModuleReminders.cpp')
  assert.match(reminders,/headingText, FONT_B12/);assert.match(reminders,/timeRect, item\.time, FONT_B9/);assert.match(reminders,/titleRect, fitted, density\.font/)
})

test('physically rejected geometry families inherit their accepted references',async()=>{
  const weather=read('app/lib/weatherResponsive.mjs')
  assert.match(weather,/compactForecast=profile\.area>=6/)
  assert.match(weather,/compactForecast\?Math\.min\(state\.forecast.*2\)/)
  assert.equal((await import('../app/lib/surfResponsive.mjs')).surfComposition({width:400,height:480},{rating:{score:4},spot:'Jæren',waveHeight:'1–2 m',period:'9 s',windSpeed:'4 m\/s',dayparts:[1,2,3,4],daily:[]}).family,'stacked')
  assert.equal((await import('../app/lib/soccerResponsive.mjs')).soccerComposition({width:600,height:480,orientation:'landscape'},{nextFixture:{},previousFixture:{},position:3,points:40,table:Array(8).fill({}),competitionName:'League'}).family,'expanded')
})

test('tall narrow Stocks reveals facts without a useless chart',async()=>{
  const {stocksComposition,stocksLayout,stocksStudioPresets}=await import('../app/lib/stocksResponsive.mjs')
  const profile={width:200,height:480,orientation:'portrait'}
  const composition=stocksComposition(profile,stocksStudioPresets.normal)
  assert.equal(composition.family,'summary-stack');assert.equal(composition.showChart,false);assert.equal(composition.showDetails,true)
  const layout=stocksLayout(profile,composition);assert.ok(layout.detailsRect);assert.ok(layout.detailRowRects.length>=4)
})

test('3x4 Stocks keeps the fullscreen-derived hierarchy and integrated chart controls',async()=>{
  const {stocksComposition,stocksLayout,stocksStudioPresets}=await import('../app/lib/stocksResponsive.mjs')
  const profile={width:588,height:458,colSpan:3,rowSpan:4,orientation:'landscape'},composition=stocksComposition(profile,stocksStudioPresets.normal),layout=stocksLayout(profile,composition)
  assert.equal(composition.family,'expanded');assert.equal(composition.showDetails,true);assert.equal(composition.showChart,true);assert.equal(composition.showSelector,true)
  assert.ok(layout.titleRect.y<layout.detailsRect.y);assert.ok(layout.detailsRect.y<layout.rangeSelectorRect.y);assert.ok(layout.rangeSelectorRect.y<layout.chartRect.y)
  assert.ok(layout.chartRect.height>180)
})

test('3x4 Groceries aligns its one secondary region beside the primary list',async()=>{
  const {groceriesComposition,groceriesLayout,groceriesStudioPresets}=await import('../app/lib/groceriesResponsive.mjs')
  const profile={width:588,height:458,colSpan:3,rowSpan:4,orientation:'landscape'},composition=groceriesComposition(profile,groceriesStudioPresets.normal),layout=groceriesLayout(profile,composition,groceriesStudioPresets.normal)
  assert.equal(composition.showMealIdeas,false);assert.equal(composition.showMenu,false);assert.equal(composition.showRunningLow,true)
  assert.equal(layout.runningLowRect.y,layout.groceryRect.y);assert.equal(layout.runningLowRect.height,layout.groceryRect.height);assert.ok(layout.groceryRect.x+layout.groceryRect.width<layout.runningLowRect.x)
})

test('Surf 3x4 and 4x3 explicitly keep the accepted large grammar',async()=>{
  const source=read('frame/src/modules/ModuleSurf.cpp')
  assert.match(source,/largeDerivedThreeByFour[\s\S]*largeDerivedFourByThree/)
  assert.match(source,/largeDerivedThreeByFour \? 28 : 32/)
  assert.match(source,/largeDerivedFourByThree \? 52 : comp\.splitPercent/)
})

test('source-language policy is explicit and UI language remains a fallback',()=>{
  for(const file of ['app/lib/frameContentOptimizer.ts','app/lib/reminders/parser.ts','app/lib/surf/commentAnalysis.ts','supabase/functions/_shared/monitoring/provider.ts']){
    const source=read(file);assert.match(source,/same natural language|natural language of the specific source|natural dominant language/,file);assert.match(source,/do not translate/,file)
  }
  assert.match(read('supabase/functions/_shared/monitoring/provider.ts'),/Watch preferred language as fallback/)
})

test('Shelf Mode omits the persistent-without-power sentence',()=>{
  const source=read('frame/src/display/DisplayCore.cpp')
  assert.doesNotMatch(source,/This display stays visible without power/)
  assert.match(source,/Plug in the frame to begin setup/)
})

test('Norwegian AI Follow chrome keeps natural singular and plural forms',()=>{
  const assistant=read('frame/src/modules/ModuleAssistant.cpp')
  assert.match(assistant,/Følger 1 tema/);assert.match(assistant,/Følger %u temaer/);assert.doesNotMatch(assistant,/tema%s/)
})
