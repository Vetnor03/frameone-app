import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { legacyStudioVariant, responsiveCellProfile, STUDIO_MODULES, studioRenderStrategy } from '../app/lib/responsiveCellProfile.mjs'
import { moduleResponsivePolicies } from '../app/lib/moduleResponsivePolicies.mjs'
import { chooseReminderTextVariant, REMINDER_STUDIO_PRESET_VALUES, REMINDER_TEXT_ORDER, reminderComposition, reminderLayout, reminderStudioPresets } from '../app/lib/remindersResponsive.mjs'
import { weatherComposition, weatherLayout, weatherStudioPresets } from '../app/lib/weatherResponsive.mjs'
import { countdownComposition, countdownLayout, countdownStudioPresets, fitCountdownStructuredText } from '../app/lib/countdownResponsive.mjs'

test('all 16 rectangular geometries produce responsive profiles', () => {
  for (let colSpan=1;colSpan<=4;colSpan++) for (let rowSpan=1;rowSpan<=4;rowSpan++) {
    const profile=responsiveCellProfile(colSpan,rowSpan,colSpan*196,rowSpan*114)
    assert.equal(profile.colSpan,colSpan);assert.equal(profile.rowSpan,rowSpan)
    assert.equal(profile.area,colSpan*rowSpan);assert.ok(profile.width>0);assert.ok(profile.height>0)
  }
})

test('orientation uses the actual pixel rectangle rather than equal logical spans', () => {
  assert.equal(responsiveCellProfile(1,3,196,343).orientation,'portrait')
  assert.equal(responsiveCellProfile(3,1,589,114).orientation,'landscape')
  assert.equal(responsiveCellProfile(2,2,392,229).orientation,'landscape')
  assert.equal(responsiveCellProfile(4,4,785,458).orientation,'landscape')
  assert.equal(responsiveCellProfile(2,2,200,200).orientation,'square')
  assert.equal(responsiveCellProfile(1,1,106,100).orientation,'square')
})

test('four production geometries retain their legacy Studio variants', () => {
  assert.equal(legacyStudioVariant(4,1),'SMALL');assert.equal(legacyStudioVariant(2,2),'MEDIUM')
  assert.equal(legacyStudioVariant(4,2),'LARGE');assert.equal(legacyStudioVariant(4,4),'XL')
})

test('the other 12 geometries use the responsive renderer', () => {
  let responsive=0,legacy=0
  for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    const strategy=studioRenderStrategy('date',colSpan,rowSpan,colSpan*196,rowSpan*114)
    strategy.path==='responsive'?responsive++:legacy++
  }
  assert.equal(responsive,12);assert.equal(legacy,4)
})

test('all 128 module and geometry combinations have a render strategy', () => {
  assert.equal(STUDIO_MODULES.length,8);let covered=0
  for(const module of STUDIO_MODULES)for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    assert.ok(studioRenderStrategy(module,colSpan,rowSpan,colSpan*196,rowSpan*114).path);covered++
  }
  assert.equal(covered,128)
})

test('Reminders keeps four handmade anchors and owns the 12 adaptive paths', () => {
  const locked=new Map([['4x1','SMALL'],['2x2','MEDIUM'],['4x2','LARGE'],['4x4','XL']]);let adaptive=0
  for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    const strategy=studioRenderStrategy('reminders',colSpan,rowSpan,colSpan*196,rowSpan*114),expected=locked.get(`${colSpan}x${rowSpan}`)
    if(expected){assert.equal(strategy.path,'legacy');assert.equal(strategy.legacyVariant,expected)}
    else {assert.equal(strategy.path,'reminders-responsive');adaptive++}
  }
  assert.equal(adaptive,12)
})

test('Weather keeps four handmade anchors and owns the 12 weather-responsive paths', () => {
  const locked=new Map([['4x1','SMALL'],['2x2','MEDIUM'],['4x2','LARGE'],['4x4','XL']]);let adaptive=0
  for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    const strategy=studioRenderStrategy('weather',colSpan,rowSpan,colSpan*196,rowSpan*114),expected=locked.get(`${colSpan}x${rowSpan}`)
    if(expected){assert.equal(strategy.path,'legacy');assert.equal(strategy.legacyVariant,expected)}
    else {assert.equal(strategy.path,'weather-responsive');adaptive++}
  }
  assert.equal(adaptive,12)
})

test('Countdown keeps four handmade anchors and owns the 12 countdown-responsive paths', () => {
  const locked=new Map([['4x1','SMALL'],['2x2','MEDIUM'],['4x2','LARGE'],['4x4','XL']]);let adaptive=0
  for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    const strategy=studioRenderStrategy('countdown',colSpan,rowSpan,colSpan*196,rowSpan*114),expected=locked.get(`${colSpan}x${rowSpan}`)
    if(expected){assert.equal(strategy.path,'legacy');assert.equal(strategy.legacyVariant,expected)}
    else {assert.equal(strategy.path,'countdown-responsive');adaptive++}
  }
  assert.equal(adaptive,12)
})

test('Countdown structured states preserve the hero count and progressive disclosure', () => {
  assert.deepEqual(Object.keys(countdownStudioPresets),['normal','long','extreme','empty'])
  const tiny=countdownComposition(responsiveCellProfile(1,1,196,114),countdownStudioPresets.extreme)
  const large=countdownComposition(responsiveCellProfile(4,3,785,343),countdownStudioPresets.extreme)
  assert.equal(countdownStudioPresets.extreme.count,'99999');assert.equal(tiny.showCount,true);assert.equal(tiny.showUnit,true)
  assert.equal(tiny.showTitle,false);assert.equal(tiny.showTargetDate,false);assert.equal(tiny.upcomingRows,0)
  assert.equal(large.showTitle,true);assert.equal(large.showTargetDate,true);assert.ok(large.upcomingRows>0)
  for(const [name,state] of Object.entries(countdownStudioPresets))for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    if(new Set(['4x1','2x2','4x2','4x4']).has(`${colSpan}x${rowSpan}`))continue
    const composition=countdownComposition(responsiveCellProfile(colSpan,rowSpan,colSpan*196,rowSpan*114),state)
    assert.equal(composition.available,name!=='empty');if(name!=='empty')assert.equal(composition.showCount,true)
  }
  assert.equal(countdownComposition(responsiveCellProfile(3,3,588,343),countdownStudioPresets.empty).showCount,false)
})

test('Countdown regions are bounded and pairwise disjoint for long and extreme titles', () => {
  const overlap=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height
  for(const state of [countdownStudioPresets.long,countdownStudioPresets.extreme])for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    if(new Set(['4x1','2x2','4x2','4x4']).has(`${colSpan}x${rowSpan}`))continue
    const profile=responsiveCellProfile(colSpan,rowSpan,colSpan*196,rowSpan*114),layout=countdownLayout(profile,countdownComposition(profile,state))
    const primary=[layout.titleRect,layout.countRect,layout.unitRect,layout.targetDateRect].filter(Boolean)
    for(const rect of [...primary,layout.upcomingRect,...layout.upcomingRows].filter(Boolean)){assert.ok(rect.width>0&&rect.height>0);assert.ok(rect.x>=0&&rect.y>=0);assert.ok(rect.x+rect.width<=profile.width);assert.ok(rect.y+rect.height<=profile.height)}
    for(let i=0;i<primary.length;i++)for(let j=i+1;j<primary.length;j++)assert.equal(overlap(primary[i],primary[j]),false)
    if(layout.upcomingRect){for(const rect of primary)assert.equal(overlap(rect,layout.upcomingRect),false);for(const row of layout.upcomingRows)assert.ok(row.x>=layout.upcomingRect.x&&row.y>=layout.upcomingRect.y&&row.x+row.width<=layout.upcomingRect.x+layout.upcomingRect.width&&row.y+row.height<=layout.upcomingRect.y+layout.upcomingRect.height)}
  }
})

test('Countdown composition responds to actual physical orientation', () => {
  const landscape=countdownComposition(responsiveCellProfile(3,2,588,120),countdownStudioPresets.normal)
  const portrait=countdownComposition(responsiveCellProfile(3,2,240,500),countdownStudioPresets.normal)
  assert.equal(landscape.family,'horizontal');assert.equal(portrait.family,'stack')
})

test('Countdown renderer preserves digits, measures titles, and leaves handmade renderer untouched', async () => {
  const source=await readFile(new URL('../app/frame-simulator/FrameSimulator.tsx',import.meta.url),'utf8')
  const responsive=source.slice(source.indexOf('function drawResponsiveCountdown'),source.indexOf('function drawCountdown'))
  assert.match(responsive,/measureText\(countValue\)/);assert.match(responsive,/fillText\(countValue/);assert.doesNotMatch(responsive,/99k|slice\([^)]*count|ellipsize\(countValue/)
  assert.match(responsive,/measureText/);assert.doesNotMatch(responsive,/France trip/)
  const handmade=source.slice(source.indexOf('function drawCountdown'),source.indexOf('function drawSparkline'))
  assert.match(handmade,/if\(c\.size==='SMALL'\)/);assert.match(handmade,/if\(c\.size==='MEDIUM'\).*drawMediumStack/);assert.match(handmade,/if\(c\.size==='LARGE'\)/);assert.match(handmade,/drawCalendar/)
})

test('Countdown runtime exports have matching declarations', async () => {
  const runtime=await readFile(new URL('../app/lib/countdownResponsive.mjs',import.meta.url),'utf8')
  const declarations=await readFile(new URL('../app/lib/countdownResponsive.d.mts',import.meta.url),'utf8')
  const exports=[...runtime.matchAll(/export (?:const|function) (\w+)/g)].map(match=>match[1])
  for(const name of exports)assert.match(declarations,new RegExp(`export (?:const|function) ${name}\\b`))
})

test('Countdown structured facts fit whole or are omitted whole', async () => {
  const measure=(value,fontSize)=>value.length*fontSize
  const upcoming=fitCountdownStructuredText('365 days',80,12,measure,{maxFont:12,minFont:9})
  assert.deepEqual(upcoming,{text:'365 days',fontSize:10})
  assert.equal(fitCountdownStructuredText('99999 working days',20,12,measure,{maxFont:12,minFont:9}),null)
  assert.equal(fitCountdownStructuredText('19 August 2027',30,12,measure,{maxFont:12,minFont:9}),null)
  assert.equal(countdownStudioPresets.extreme.count,'99999')
  const source=await readFile(new URL('../app/frame-simulator/FrameSimulator.tsx',import.meta.url),'utf8')
  const responsive=source.slice(source.indexOf('function drawResponsiveCountdown'),source.indexOf('function drawCountdown'))
  assert.match(responsive,/structured\(metric,metricRect/);assert.match(responsive,/structured\(state\.unit!/)
  assert.doesNotMatch(responsive,/fitted\(metric|fitted\(state\.unit/)
  assert.match(responsive,/ellipsize\(item\.title/);assert.match(responsive,/measureText\(state\.targetDate\)/)
})

test('all Weather states compose safely for all 16 geometries', () => {
  assert.deepEqual(Object.keys(weatherStudioPresets),['normal','long','extreme','empty'])
  for(const state of Object.values(weatherStudioPresets))for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    const composition=weatherComposition(responsiveCellProfile(colSpan,rowSpan,colSpan*196,rowSpan*114),state)
    assert.equal(typeof composition.available,'boolean');assert.ok(composition.forecastRows>=0);assert.ok(composition.forecastRows<=(state.forecast?.length??0))
  }
  assert.equal(weatherComposition(responsiveCellProfile(3,3,588,343),weatherStudioPresets.empty).available,false)
})

test('missing optional Weather values create no empty disclosure regions', () => {
  const state={location:'Oslo',condition:'Clear',temperature:'9°'}
  const composition=weatherComposition(responsiveCellProfile(4,3,785,343),state)
  assert.equal(composition.showRange,false);assert.equal(composition.showWind,false);assert.equal(composition.showPrecipitation,false);assert.equal(composition.showInsight,false);assert.equal(composition.forecastRows,0)
})

test('Weather progressively discloses content without enabling shallow forecasts', () => {
  const small=weatherComposition(responsiveCellProfile(1,1,196,114),weatherStudioPresets.extreme)
  const medium=weatherComposition(responsiveCellProfile(3,2,588,229),weatherStudioPresets.extreme)
  const large=weatherComposition(responsiveCellProfile(4,3,785,343),weatherStudioPresets.extreme)
  const disclosed=value=>['showLocation','showCondition','showTemperature','showRange','showWind','showPrecipitation','showInsight'].filter(key=>value[key]).length+value.forecastRows
  assert.ok(disclosed(small)<disclosed(medium));assert.ok(disclosed(medium)<disclosed(large))
  assert.equal(small.showCondition,false);assert.equal(medium.forecastRows,0);assert.equal(large.forecastRows,4)
})

test('forecast-enabled Weather layouts reserve valid, disjoint regions', () => {
  for(const [colSpan,rowSpan] of [[2,4],[3,3],[3,4],[4,3]]){
    const profile=responsiveCellProfile(colSpan,rowSpan,colSpan*196,rowSpan*114)
    const composition=weatherComposition(profile,weatherStudioPresets.extreme)
    const layout=weatherLayout(profile,composition)
    assert.ok(layout.forecastRect);assert.ok(layout.dividerY>0)
    assert.ok(layout.primaryRect.y+layout.primaryRect.height<=layout.dividerY)
    if(layout.detailsRect)assert.ok(layout.detailsRect.y+layout.detailsRect.height<=layout.dividerY)
    assert.ok(layout.dividerY<layout.forecastRect.y)
    for(const rect of [layout.headerRect,layout.primaryRect,layout.detailsRect,layout.forecastRect].filter(Boolean)){
      assert.ok(rect.width>0&&rect.height>0);assert.ok(rect.x>=0&&rect.y>=0)
      assert.ok(rect.x+rect.width<=profile.width);assert.ok(rect.y+rect.height<=profile.height)
    }
  }
})

test('Weather fitting uses Canvas measurement rather than title character counts', async () => {
  const source=await readFile(new URL('../app/frame-simulator/FrameSimulator.tsx',import.meta.url),'utf8')
  const responsive=source.slice(source.indexOf('function fitWeatherText'),source.indexOf('function weatherColumn'))
  assert.match(responsive,/measureText/);assert.doesNotMatch(responsive,/location\.length|condition\.length/)
})

test('all modules expose distinct responsive behavior contracts', () => {
  assert.deepEqual(Object.keys(moduleResponsivePolicies).sort(),[...STUDIO_MODULES].sort())
  assert.equal(moduleResponsivePolicies.reminders.variability,'high');assert.equal(moduleResponsivePolicies.reminders.textCompression,'ai-eligible-later')
  assert.equal(moduleResponsivePolicies.weather.variability,'bounded');assert.equal(moduleResponsivePolicies.weather.textCompression,'never')
  assert.ok(moduleResponsivePolicies.stocks.contentNature.includes('metrics'));assert.ok(moduleResponsivePolicies.stocks.contentNature.includes('visual'));assert.equal(moduleResponsivePolicies.stocks.textCompression,'never')
  assert.equal(moduleResponsivePolicies.date.variability,'low');assert.equal(moduleResponsivePolicies.date.textCompression,'never')
  assert.equal(moduleResponsivePolicies.countdown.textCompression,'ai-eligible-later')
})

test('reminder wording uses the longest measured variant that fits, then fallback', () => {
  const item={time:'14:30',text:{full:'a very long full version',compact:'compact wording',short:'short copy',tiny:'tiny'},protectedFacts:[]}
  const measure=value=>value.length*10
  assert.equal(chooseReminderTextVariant(item,250,measure).variant,'full')
  assert.equal(chooseReminderTextVariant(item,160,measure).variant,'compact')
  assert.equal(chooseReminderTextVariant(item,105,measure).variant,'short')
  assert.equal(chooseReminderTextVariant(item,45,measure).variant,'tiny')
  assert.equal(chooseReminderTextVariant(item,25,measure).variant,'fallback')
  assert.deepEqual(REMINDER_TEXT_ORDER,['full','compact','short','tiny'])
})

test('protected IDs are atomic during deterministic fallback', () => {
  const item={time:'09:00',text:{full:'Project status for IMR 26-050',compact:'Status for IMR 26-050',short:'IMR 26-050',tiny:'IMR 26-050'},protectedFacts:[{value:'IMR 26-050',kind:'id',optionalInTitle:true}]}
  const measure=value=>value.length
  assert.equal(chooseReminderTextVariant(item,11,measure).text,'IMR 26-050')
  assert.equal(chooseReminderTextVariant(item,8,measure).text,'')
  for(const width of [1,5,8,9])assert.doesNotMatch(chooseReminderTextVariant(item,width,measure).text,/IMR 26(?:-|$)/)
})

test('time is structured and optional location can be omitted at low density', () => {
  const dentist=reminderStudioPresets.normal.today[0]
  assert.equal(dentist.time,'14:30');assert.ok(dentist.protectedFacts.some(fact=>fact.value==='Madla'&&fact.optionalInTitle))
  assert.equal(dentist.text.tiny,'Dentist');assert.doesNotMatch(dentist.text.tiny,/Madla/)
  assert.equal(chooseReminderTextVariant(dentist,8,value=>value.length).text,'Dentist')
})

test('non-optional title facts are never dropped by authored variants or fallback', () => {
  const mum=reminderStudioPresets.normal.today[2],measure=value=>value.length
  for(let width=0;width<8;width++){
    const displayed=chooseReminderTextVariant(mum,width,measure).text
    assert.ok(displayed===''||displayed.includes('Mum'));assert.notEqual(displayed,'Call…')
  }
  assert.equal(chooseReminderTextVariant(mum,3,measure).text,'Mum')
  assert.equal(chooseReminderTextVariant(mum,2,measure).text,'')
})

test('authored variants missing a required fact are ineligible', () => {
  const item={time:null,text:{full:'Call Mum tomorrow',compact:'Call Mum',short:'Call Mum',tiny:'Call'},protectedFacts:[{value:'Mum',kind:'name',optionalInTitle:false}]}
  assert.equal(chooseReminderTextVariant(item,4,value=>value.length).text,'Mum')
  assert.equal(chooseReminderTextVariant(item,2,value=>value.length).text,'')
})

test('deterministic reminder states cover empty, normal, long and extreme content', () => {
  assert.deepEqual(Object.keys(reminderStudioPresets),['empty','normal','long','extreme'])
  assert.equal(reminderStudioPresets.empty.today.length,0);assert.ok(reminderStudioPresets.normal.today.length>=3)
  assert.ok(reminderStudioPresets.long.tomorrow.length);assert.ok(reminderStudioPresets.extreme.today.length>reminderStudioPresets.normal.today.length)
})

test('Reminders progressively discloses sections and calm item counts', () => {
  const smallProfile=responsiveCellProfile(1,1,196,114),largeProfile=responsiveCellProfile(4,3,785,343)
  const small=reminderComposition(smallProfile,reminderStudioPresets.extreme)
  const large=reminderComposition(largeProfile,reminderStudioPresets.extreme)
  assert.equal(small.direction,'horizontal');assert.equal(small.showTomorrow,false);assert.equal(small.todayItems,1)
  assert.equal(large.direction,'split');assert.equal(large.family,'split-sections');assert.equal(large.showTomorrow,true);assert.ok(large.maxItems>small.maxItems)
  assert.ok(large.todayItems>0);assert.ok(large.tomorrowItems>0);assert.ok(large.maxItems<=9)
})

test('Reminders vertical layout reserves disjoint sections and footer before rows', () => {
  for(const [colSpan,rowSpan] of [[2,4]]){
    const profile=responsiveCellProfile(colSpan,rowSpan,colSpan*196,rowSpan*114)
    const composition=reminderComposition(profile,reminderStudioPresets.extreme),layout=reminderLayout(profile,composition)
    assert.ok(layout.todayRect);assert.ok(layout.tomorrowRect);assert.ok(layout.footerRect)
    assert.ok(layout.todayRect.y+layout.todayRect.height<=layout.tomorrowRect.y)
    assert.ok(layout.tomorrowRect.y+layout.tomorrowRect.height<=layout.footerRect.y)
    for(const item of layout.items){
      assert.ok(item.itemRect.y+item.itemRect.height<=layout.footerRect.y)
      assert.ok(item.timeRect.x+item.timeRect.width<=item.titleRect.x||item.timeRect.y+item.timeRect.height<=item.titleRect.y)
    }
  }
})

test('large-landscape Reminders use physical orientation and split bounded sections', () => {
  for(const [colSpan,rowSpan,width,height] of [[4,3,785,343],[3,2,588,229],[3,3,588,343]]){
    const profile=responsiveCellProfile(colSpan,rowSpan,width,height)
    const composition=reminderComposition(profile,reminderStudioPresets.extreme),layout=reminderLayout(profile,composition)
    assert.equal(profile.orientation,'landscape');assert.equal(composition.family,'split-sections');assert.equal(composition.direction,'split')
    assert.ok(layout.todayRect&&layout.tomorrowRect)
    assert.ok(layout.todayRect.x+layout.todayRect.width<layout.tomorrowRect.x)
    assert.equal(layout.todayRect.y,layout.tomorrowRect.y)
  }
  const sameSpansPortrait=reminderComposition(responsiveCellProfile(3,2,300,500),reminderStudioPresets.extreme)
  const square=reminderComposition(responsiveCellProfile(3,3,400,400),reminderStudioPresets.extreme)
  assert.equal(sameSpansPortrait.family,'vertical-list');assert.equal(square.family,'vertical-list')
})

test('shallow physical cells keep the horizontal item strip while tall cells stay vertical', () => {
  for(const [colSpan,width] of [[2,392],[3,588]])assert.equal(reminderComposition(responsiveCellProfile(colSpan,1,width,114),reminderStudioPresets.extreme).family,'shallow-horizontal')
  assert.equal(reminderComposition(responsiveCellProfile(3,1,180,300),reminderStudioPresets.extreme).family,'vertical-list')
  assert.equal(reminderComposition(responsiveCellProfile(1,3,196,343),reminderStudioPresets.extreme).direction,'vertical')
})

test('split sections expand Today and avoid wasting width on a small Tomorrow section', () => {
  const profile=responsiveCellProfile(4,3,785,343)
  const normal=reminderLayout(profile,reminderComposition(profile,reminderStudioPresets.normal))
  assert.ok(normal.todayRect.width>normal.tomorrowRect.width*2)
  const todayOnly={today:reminderStudioPresets.extreme.today,tomorrow:[]}
  const expanded=reminderLayout(profile,reminderComposition(profile,todayOnly))
  assert.equal(expanded.tomorrowRect,null);assert.ok(expanded.todayRect.width>normal.todayRect.width)
})

test('split overflow remains inside its owning section footer', () => {
  const profile=responsiveCellProfile(4,3,785,343),items=reminderStudioPresets.extreme.today
  const state={today:[...items,...items],tomorrow:[...items,...items]}
  const composition=reminderComposition(profile,state),layout=reminderLayout(profile,composition)
  assert.ok(composition.todayOverflow>0&&composition.tomorrowOverflow>0)
  for(const [section,footer] of [[layout.todayRect,layout.todayFooterRect],[layout.tomorrowRect,layout.tomorrowFooterRect]]){
    assert.ok(footer.x>=section.x&&footer.x+footer.width<=section.x+section.width)
    assert.ok(footer.y>=section.y&&footer.y+footer.height<=section.y+section.height)
  }
  for(const item of layout.items){
    const section=item.itemRect.x<layout.tomorrowRect.x?layout.todayRect:layout.tomorrowRect
    const footer=item.itemRect.x<layout.tomorrowRect.x?layout.todayFooterRect:layout.tomorrowFooterRect
    assert.ok(item.itemRect.x>=section.x&&item.itemRect.x+item.itemRect.width<=section.x+section.width)
    assert.ok(item.itemRect.y+item.itemRect.height<=footer.y)
  }
})

test('Reminders horizontal items, time, title, and overflow own disjoint regions', () => {
  for(const colSpan of [1,2,3]){
    const profile=responsiveCellProfile(colSpan,1,colSpan*196,114)
    const composition=reminderComposition(profile,reminderStudioPresets.extreme),layout=reminderLayout(profile,composition)
    assert.equal(composition.showTomorrow,false);assert.ok(layout.footerRect)
    for(let index=1;index<layout.items.length;index++)assert.ok(layout.items[index-1].itemRect.x+layout.items[index-1].itemRect.width<=layout.items[index].itemRect.x)
    for(const item of layout.items){
      assert.ok(item.timeRect.y+item.timeRect.height<=item.titleRect.y||item.timeRect.x+item.timeRect.width<=item.titleRect.x)
      assert.ok(item.itemRect.x+item.itemRect.width<=layout.footerRect.x)
    }
  }
})

test('Reminders empty and Tomorrow-only states produce valid bounded layouts', () => {
  const profile=responsiveCellProfile(1,2,196,229)
  const emptyComposition=reminderComposition(profile,reminderStudioPresets.empty),emptyLayout=reminderLayout(profile,emptyComposition)
  assert.equal(emptyComposition.available,false);assert.ok(emptyLayout.emptyRect);assert.equal(emptyLayout.items.length,0)
  const tomorrowOnly={today:[],tomorrow:reminderStudioPresets.extreme.tomorrow}
  const composition=reminderComposition(profile,tomorrowOnly),layout=reminderLayout(profile,composition)
  assert.equal(composition.showTomorrow,true);assert.equal(composition.todayItems,0);assert.ok(composition.tomorrowItems>0)
  assert.equal(layout.todayRect,null);assert.ok(layout.tomorrowRect)
  for(const rect of [layout.emptyRect,layout.todayRect,layout.tomorrowRect,layout.footerRect,...layout.items.flatMap(item=>[item.itemRect,item.timeRect,item.titleRect])].filter(Boolean)){
    assert.ok(rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0);assert.ok(rect.x+rect.width<=profile.width);assert.ok(rect.y+rect.height<=profile.height)
  }
})

test('Reminders runtime exports have matching declarations', async () => {
  const runtime=await readFile(new URL('../app/lib/remindersResponsive.mjs',import.meta.url),'utf8')
  const declarations=await readFile(new URL('../app/lib/remindersResponsive.d.mts',import.meta.url),'utf8')
  const exports=[...runtime.matchAll(/export (?:const|function) (\w+)/g)].map(match=>match[1])
  for(const name of exports)assert.match(declarations,new RegExp(`export (?:const|function) ${name}\\b`))
})

test('Studio sample-data options keep lowercase state values separate from labels', async () => {
  assert.deepEqual(REMINDER_STUDIO_PRESET_VALUES,['normal','long','extreme','empty'])
  for(const value of REMINDER_STUDIO_PRESET_VALUES)assert.ok(reminderStudioPresets[value])
  const source=await readFile(new URL('../app/frame-simulator/FrameSimulator.tsx',import.meta.url),'utf8')
  assert.match(source,/<label>Sample data <select/);assert.match(source,/<option key=\{x\} value=\{x\}>/)
  assert.match(source,/GeometryShowcase module=\{showcaseModule\}[^>]*preset=\{preset\}/)
})

test('AI Follow is a Studio-only picker option and stays out of the responsive showcase', async () => {
  const source=await readFile(new URL('../app/frame-simulator/FrameSimulator.tsx',import.meta.url),'utf8')
  const simulatorLibrary=await readFile(new URL('../app/lib/frameSimulator.ts',import.meta.url),'utf8')
  const productionRegistry=JSON.parse(await readFile(new URL('../shared/frame-modules.json',import.meta.url),'utf8'))
  assert.equal((simulatorLibrary.match(/id:'ai-follow'/g)||[]).length,1);assert.doesNotMatch(JSON.stringify(productionRegistry),/ai-follow/)
  assert.match(source,/studioModuleRegistry\.map\(module/);assert.match(source,/responsiveShowcaseRegistry\.map\(m/)
  assert.match(source,/if\(m==='ai-follow'\).*AI FOLLOW.*Topic update/);assert.match(source,/if\(m==='ai-follow'\)[\s\S]*return}const d=fake\[m\]\[p\],strategy=studioRenderStrategy/)
})
