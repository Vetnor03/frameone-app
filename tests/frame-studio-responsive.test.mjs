import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { legacyStudioVariant, responsiveCellProfile, STUDIO_MODULES, studioRenderStrategy } from '../app/lib/responsiveCellProfile.mjs'
import { moduleResponsivePolicies } from '../app/lib/moduleResponsivePolicies.mjs'
import { chooseReminderTextVariant, REMINDER_STUDIO_PRESET_VALUES, REMINDER_TEXT_ORDER, reminderComposition, reminderDensity, reminderLayout, reminderStudioPresets } from '../app/lib/remindersResponsive.mjs'
import { weatherComposition, weatherLayout, weatherStudioPresets } from '../app/lib/weatherResponsive.mjs'
import { countdownComposition, countdownLayout, countdownStudioPresets, fitCountdownStructuredText } from '../app/lib/countdownResponsive.mjs'
import { DATE_CALENDAR_MIN, dateCalendarFeatures, dateComposition, dateLayout, dateStudioPresets, fitDateFact } from '../app/lib/dateResponsive.mjs'
import { SURF_FORECAST_MIN_COLUMN_WIDTH, fitSurfFact, surfComposition, surfLayout, surfRatingWord, surfStudioPresets } from '../app/lib/surfResponsive.mjs'

test('Surf keeps four handmade anchors and owns exactly 12 surf-responsive paths', () => {
  const locked=new Map([['4x1','SMALL'],['2x2','MEDIUM'],['4x2','LARGE'],['4x4','XL']]);let adaptive=0
  for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    const strategy=studioRenderStrategy('surf',colSpan,rowSpan,colSpan*196,rowSpan*114),expected=locked.get(`${colSpan}x${rowSpan}`)
    if(expected){assert.equal(strategy.path,'legacy');assert.equal(strategy.legacyVariant,expected)}else{assert.equal(strategy.path,'surf-responsive');adaptive++}
  }
  assert.equal(adaptive,12)
})

test('all structured Surf presets compose and lay out across all geometries', () => {
  assert.deepEqual(Object.keys(surfStudioPresets),['normal','long','extreme','empty'])
  for(const [name,state] of Object.entries(surfStudioPresets))for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    const profile=responsiveCellProfile(colSpan,rowSpan,colSpan*196,rowSpan*114),composition=surfComposition(profile,state),layout=surfLayout(profile,composition)
    assert.equal(composition.available,name!=='empty');assert.ok(layout.emptyRect||layout.heroRect)
    if(name==='empty'){assert.equal(composition.showRating,false);assert.equal(composition.showWave,false);assert.equal(composition.forecastDays,0)}
  }
})

test('Surf composition follows physical geometry and progressive disclosure', () => {
  const at=(cols,rows,w=cols*196,h=rows*114)=>surfComposition(responsiveCellProfile(cols,rows,w,h),surfStudioPresets.normal)
  assert.equal(at(1,1).family,'stacked');assert.equal(at(2,1).family,'shallow-wide');assert.equal(at(1,4).family,'stacked')
  assert.equal(at(3,2).family,'split');assert.equal(at(2,4).family,'stacked');assert.equal(at(3,4).family,'expanded-daily');assert.equal(at(4,3).family,'daypart-enhanced')
  assert.equal(at(1,1).showDirections,false);assert.equal(at(1,1).forecastDays,0)
  assert.equal(at(2,4).daypartCount,0);assert.equal(at(3,4).forecastDays,4)
  assert.notEqual(at(3,2,600,140).family,at(3,2,240,500).family)
})

test('Surf forecast columns honor minimum width and all regions are bounded', () => {
  const overlap=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height
  for(const state of Object.values(surfStudioPresets))for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    const profile=responsiveCellProfile(colSpan,rowSpan,colSpan*196,rowSpan*114),composition=surfComposition(profile,state),layout=surfLayout(profile,composition),regions=[layout.headerRect,layout.heroRect,layout.detailsRect,layout.bestWindowRect,layout.environmentRect,layout.daypartRect,layout.dailyRect].filter(Boolean)
    for(const r of regions){assert.ok(r.x>=0&&r.y>=0&&r.width>0&&r.height>0);assert.ok(r.x+r.width<=profile.width+.001&&r.y+r.height<=profile.height+.001)}
    for(let i=0;i<regions.length;i++)for(let j=i+1;j<regions.length;j++)assert.equal(overlap(regions[i],regions[j]),false)
    for(const column of layout.forecastColumns){assert.ok(column.columnRect.width>=SURF_FORECAST_MIN_COLUMN_WIDTH);assert.ok(column.columnRect.x>=layout.forecastRect.x);assert.ok(column.columnRect.x+column.columnRect.width<=layout.forecastRect.x+layout.forecastRect.width+.001)}
  }
})

test('Surf facts are atomic, score drives rating blocks, and declarations match runtime exports', async () => {
  const measure=(value,size)=>value.length*size
  assert.deepEqual(fitSurfFact('8.0–12.0 m',110,24,measure,{maxFont:18,minFont:9}),{text:'8.0–12.0 m',fontSize:11})
  assert.equal(fitSurfFact('8.0–12.0 m',70,24,measure,{maxFont:18,minFont:9}),null)
  assert.equal(surfStudioPresets.extreme.rating.score,6);assert.equal(surfStudioPresets.extreme.waveHeight,'8.0–12.0 m');assert.equal(surfStudioPresets.extreme.period,'22 s')
  const runtime=await readFile(new URL('../app/lib/surfResponsive.mjs',import.meta.url),'utf8'),declarations=await readFile(new URL('../app/lib/surfResponsive.d.mts',import.meta.url),'utf8')
  for(const name of [...runtime.matchAll(/export (?:const|function) (\w+)/g)].map(match=>match[1]))assert.match(declarations,new RegExp(`export (?:const|function) ${name}\\b`))
  const source=await readFile(new URL('../app/frame-simulator/FrameSimulator.tsx',import.meta.url),'utf8'),responsive=source.slice(source.indexOf('function drawResponsiveSurf'),source.indexOf('function drawSurf'))
  assert.match(responsive,/adaptiveSurfRatingVisual\([^\n]+state\.rating\.score/);assert.match(responsive,/measureText\(fitted\.text\)/);assert.doesNotMatch(responsive,/ellips/i);assert.doesNotMatch(responsive,/fetch\(|generate|rewrite/i)
})

test('Surf Studio uses the physical firmware rating words without visible numeric fractions', async () => {
  assert.deepEqual([1,2,3,4,5,6].map(surfRatingWord),['Flat','Poor','Poor to Fair','Fair','Good','Epic'])
  for(const state of Object.values(surfStudioPresets)){
    if(state.rating.score!=null)assert.equal(state.rating.label,surfRatingWord(state.rating.score))
    for(const entry of state.forecast)assert.equal(entry.ratingLabel,surfRatingWord(entry.ratingScore))
  }

  const source=await readFile(new URL('../app/frame-simulator/FrameSimulator.tsx',import.meta.url),'utf8')
  const responsive=source.slice(source.indexOf('function drawResponsiveSurf'),source.indexOf('function drawSurf'))
  const handmade=source.slice(source.indexOf('function drawSurf'),source.indexOf('function soccerFixture'))
  const surfSamples=source.slice(source.indexOf('const fake ='),source.indexOf('const calendarPreset'))
  for(const studioSurfSource of [responsive,handmade,surfSamples])assert.doesNotMatch(studioSurfSource,/\d\s*\/\s*6|ratingScore\}\//)
  assert.match(responsive,/fact\(surfRatingWord\(state\.rating\.score\),layout\.ratingRect/)
  assert.match(responsive,/fact\(surfRatingWord\(entry\.ratingScore\),column\.ratingRect/)
  assert.match(responsive,/adaptiveSurfRatingVisual\([^\n]+entry\.ratingScore/)
  assert.match(handmade,/ratingBlocks\([^\n]+score/)
})

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
    strategy.path==='date-responsive'?responsive++:legacy++
  }
  assert.equal(responsive,12);assert.equal(legacy,4)
})

test('Date keeps its four handmade anchors and owns exactly 12 date-responsive paths', () => {
  const locked=new Map([['4x1','SMALL'],['2x2','MEDIUM'],['4x2','LARGE'],['4x4','XL']]);let adaptive=0
  for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    const strategy=studioRenderStrategy('date',colSpan,rowSpan,colSpan*196,rowSpan*114),expected=locked.get(`${colSpan}x${rowSpan}`)
    if(expected){assert.equal(strategy.path,'legacy');assert.equal(strategy.legacyVariant,expected)}
    else {assert.equal(strategy.path,'date-responsive');adaptive++}
  }
  assert.equal(adaptive,12)
})

test('all deterministic Date presets safely compose across all 16 geometries', () => {
  assert.deepEqual(Object.keys(dateStudioPresets),['normal','long','extreme','empty'])
  for(const [name,state] of Object.entries(dateStudioPresets))for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    const profile=responsiveCellProfile(colSpan,rowSpan,colSpan*196,rowSpan*114),composition=dateComposition(profile,state),layout=dateLayout(profile,composition)
    assert.equal(composition.available,name!=='empty');assert.ok(layout.emptyRect||layout.dayRect)
    if(name==='empty'){assert.equal(composition.currentCalendar,null);assert.equal(composition.nextCalendar,null)}
  }
})

test('Date composition follows physical geometry and progressively discloses calendars', () => {
  const tiny=dateComposition(responsiveCellProfile(1,1,196,114),dateStudioPresets.normal)
  const shallow=dateComposition(responsiveCellProfile(3,1,588,114),dateStudioPresets.normal)
  const tall=dateComposition(responsiveCellProfile(1,4,196,456),dateStudioPresets.normal)
  const medium=dateComposition(responsiveCellProfile(3,2,588,228),dateStudioPresets.normal)
  const tallLarge=dateComposition(responsiveCellProfile(2,4,392,456),dateStudioPresets.normal)
  const balanced=dateComposition(responsiveCellProfile(3,3,588,342),dateStudioPresets.normal)
  const expanded=dateComposition(responsiveCellProfile(4,3,784,342),dateStudioPresets.normal)
  assert.equal(tiny.family,'micro');assert.equal(tiny.currentCalendar,null)
  assert.equal(shallow.family,'horizontal');assert.equal(shallow.currentCalendar,null)
  assert.equal(tall.family,'stack');assert.equal(tall.currentCalendar,null)
  assert.equal(medium.family,'calendar-split');assert.ok(medium.currentCalendar);assert.equal(medium.nextCalendar,null)
  assert.equal(tallLarge.family,'calendar-split');assert.ok(tallLarge.currentCalendar);assert.equal(tallLarge.nextCalendar,null)
  assert.equal(balanced.family,'calendar-split');assert.ok(balanced.currentCalendar);assert.equal(balanced.nextCalendar,null)
  assert.equal(expanded.family,'calendar-split');assert.ok(expanded.currentCalendar);assert.equal(expanded.nextCalendar,null);assert.ok(expanded.holidayRows<=1)
  const expandedLayout=dateLayout(responsiveCellProfile(4,3,784,342),expanded)
  assert.equal(expandedLayout.nextCalendarRect,null);assert.ok(expandedLayout.calendarRect.width>expandedLayout.heroRect.width)
  const sameSpanLandscape=dateComposition(responsiveCellProfile(3,2,600,160),dateStudioPresets.normal)
  const sameSpanPortrait=dateComposition(responsiveCellProfile(3,2,240,500),dateStudioPresets.normal)
  assert.equal(sameSpanLandscape.family,'horizontal');assert.equal(sameSpanPortrait.family,'stack')
})

test('Date calendar minimums disclose features in deterministic usability order', () => {
  assert.equal(dateCalendarFeatures(DATE_CALENDAR_MIN.gridWidth-1,500),null)
  assert.deepEqual(dateCalendarFeatures(DATE_CALENDAR_MIN.gridWidth,DATE_CALENDAR_MIN.gridHeight),{showMonthTitle:false,showWeekNums:false,showDowHeader:false})
  assert.deepEqual(dateCalendarFeatures(DATE_CALENDAR_MIN.dowWidth,DATE_CALENDAR_MIN.dowHeight),{showMonthTitle:false,showWeekNums:false,showDowHeader:true})
  assert.deepEqual(dateCalendarFeatures(DATE_CALENDAR_MIN.weekWidth,DATE_CALENDAR_MIN.weekHeight),{showMonthTitle:false,showWeekNums:true,showDowHeader:true})
  assert.deepEqual(dateCalendarFeatures(DATE_CALENDAR_MIN.weekWidth,DATE_CALENDAR_MIN.titleHeight,{title:true}),{showMonthTitle:true,showWeekNums:true,showDowHeader:true})
})

test('Date hero, calendars, and holiday regions are bounded and disjoint', () => {
  const overlap=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height
  for(const state of [dateStudioPresets.long,dateStudioPresets.extreme])for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    const profile=responsiveCellProfile(colSpan,rowSpan,colSpan*196,rowSpan*114),layout=dateLayout(profile,dateComposition(profile,state))
    const facts=[layout.yearRect,layout.monthRect,layout.dayRect,layout.weekdayRect].filter(Boolean)
    const regions=[layout.heroRect,layout.calendarRect,layout.nextCalendarRect,layout.holidayRect].filter(Boolean)
    for(const r of [...facts,...regions]){assert.ok(r.x>=0&&r.y>=0&&r.width>0&&r.height>0);assert.ok(r.x+r.width<=profile.width+.001);assert.ok(r.y+r.height<=profile.height+.001)}
    for(let i=0;i<facts.length;i++)for(let j=i+1;j<facts.length;j++)assert.equal(overlap(facts[i],facts[j]),false)
    for(const calendar of [layout.calendarRect,layout.nextCalendarRect].filter(Boolean)){assert.equal(overlap(layout.heroRect,calendar),false);if(layout.holidayRect)assert.equal(overlap(layout.holidayRect,calendar),false)}
    if(layout.calendarRect&&layout.nextCalendarRect)assert.equal(overlap(layout.calendarRect,layout.nextCalendarRect),false)
  }
})

test('Date facts fit whole or are omitted, and runtime declarations stay in parity', async () => {
  const measure=(value,size)=>value.length*size
  assert.deepEqual(fitDateFact('September',90,14,measure,{maxFont:14,minFont:9}),{text:'September',fontSize:10})
  assert.equal(fitDateFact('September',30,14,measure,{maxFont:14,minFont:9}),null)
  assert.deepEqual(fitDateFact(30,30,20,measure,{maxFont:20,minFont:9}),{text:'30',fontSize:15})
  const runtime=await readFile(new URL('../app/lib/dateResponsive.mjs',import.meta.url),'utf8'),declarations=await readFile(new URL('../app/lib/dateResponsive.d.mts',import.meta.url),'utf8')
  for(const name of [...runtime.matchAll(/export (?:const|function) (\w+)/g)].map(match=>match[1]))assert.match(declarations,new RegExp(`export (?:const|function) ${name}\\b`))
  const source=await readFile(new URL('../app/frame-simulator/FrameSimulator.tsx',import.meta.url),'utf8')
  const responsive=source.slice(source.indexOf('function drawResponsiveDate'),source.indexOf('function drawResponsiveReminders'))
  assert.match(responsive,/fitDateFact/);assert.doesNotMatch(responsive,/state\.(?:weekday|monthName|year|day)\??\.slice|ellips/i);assert.doesNotMatch(responsive,/fetch\(|generate|rewrite/i)
  const handmade=source.slice(source.indexOf('function drawDate'),source.indexOf('function drawReminderMedium'))
  assert.match(handmade,/if\(c\.size==='SMALL'\)/);assert.match(handmade,/if\(c\.size==='MEDIUM'\)/);assert.match(handmade,/if\(c\.size==='LARGE'\)/);assert.match(handmade,/drawMediumStack/)
})

test('all 144 Studio module and geometry combinations have a render strategy', () => {
  assert.equal(STUDIO_MODULES.length,9);let covered=0
  for(const module of STUDIO_MODULES)for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    assert.ok(studioRenderStrategy(module,colSpan,rowSpan,colSpan*196,rowSpan*114).path);covered++
  }
  assert.equal(covered,144)
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
    for(const rect of [...primary,layout.upcomingRect,layout.upcomingGroupRect,...layout.upcomingRows.map(row=>row.rowRect)].filter(Boolean)){assert.ok(rect.width>0&&rect.height>0);assert.ok(rect.x>=0&&rect.y>=0);assert.ok(rect.x+rect.width<=profile.width);assert.ok(rect.y+rect.height<=profile.height)}
    for(let i=0;i<primary.length;i++)for(let j=i+1;j<primary.length;j++)assert.equal(overlap(primary[i],primary[j]),false)
    if(layout.upcomingRect){for(const rect of primary)assert.equal(overlap(rect,layout.upcomingRect),false);for(const {rowRect:row} of layout.upcomingRows)assert.ok(row.x>=layout.upcomingRect.x&&row.y>=layout.upcomingRect.y&&row.x+row.width<=layout.upcomingRect.x+layout.upcomingRect.width&&row.y+row.height<=layout.upcomingRect.y+layout.upcomingRect.height)}
  }
})

test('expanded Countdown groups its hero and uses compact aligned upcoming rows', () => {
  const overlap=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height
  for(const [colSpan,rowSpan] of [[2,4],[3,4],[4,3],[3,3]]){
    const profile=responsiveCellProfile(colSpan,rowSpan,colSpan*196,rowSpan*114)
    const layout=countdownLayout(profile,countdownComposition(profile,countdownStudioPresets.extreme))
    assert.ok(layout.heroGroupRect.height<layout.primaryRect.height)
    assert.ok(layout.heroGroupRect.y>layout.primaryRect.y)
    assert.ok(layout.heroGroupRect.y+layout.heroGroupRect.height<layout.primaryRect.y+layout.primaryRect.height)
    for(let index=0;index<layout.upcomingRows.length;index++){
      const row=layout.upcomingRows[index]
      assert.ok(row.rowRect.height<=34)
      assert.equal(row.titleRect.y,row.rowRect.y);assert.equal(row.titleRect.height,row.rowRect.height)
      assert.equal(row.metricRect.y,row.rowRect.y);assert.equal(row.metricRect.height,row.rowRect.height)
      assert.equal(overlap(row.titleRect,row.metricRect),false)
      if(index)assert.equal(overlap(layout.upcomingRows[index-1].rowRect,row.rowRect),false)
    }
    const last=layout.upcomingRows.at(-1)?.rowRect
    assert.ok(last.y+last.height<layout.upcomingRect.y+layout.upcomingRect.height)
  }
})

test('split-horizontal Countdown centers a content-sized upcoming group beside the hero', () => {
  for(const [colSpan,rowSpan] of [[3,3],[3,4],[4,3]]){
    const profile=responsiveCellProfile(colSpan,rowSpan,colSpan*196,rowSpan*114)
    const layout=countdownLayout(profile,countdownComposition(profile,countdownStudioPresets.extreme))
    assert.ok(layout.upcomingGroupRect);assert.ok(layout.upcomingGroupRect.height<layout.upcomingRect.height)
    const upcomingCenter=layout.upcomingGroupRect.y+layout.upcomingGroupRect.height/2
    const panelCenter=layout.upcomingRect.y+layout.upcomingRect.height/2
    const heroCenter=layout.heroGroupRect.y+layout.heroGroupRect.height/2
    assert.ok(Math.abs(upcomingCenter-panelCenter)<=.001)
    assert.ok(Math.abs(upcomingCenter-heroCenter)<=1)
    for(const row of layout.upcomingRows){
      assert.ok(row.rowRect.y>=layout.upcomingGroupRect.y)
      assert.ok(row.rowRect.y+row.rowRect.height<=layout.upcomingGroupRect.y+layout.upcomingGroupRect.height)
    }
  }
})

test('Countdown upcoming row heights stay compact while the group moves as a unit', () => {
  for(const [colSpan,rowSpan] of [[3,3],[3,4],[4,3]]){
    const profile=responsiveCellProfile(colSpan,rowSpan,colSpan*196,rowSpan*114)
    const layout=countdownLayout(profile,countdownComposition(profile,countdownStudioPresets.extreme))
    const rowCount=layout.upcomingRows.length,availableHeight=Math.floor((layout.upcomingRect.height-27-5-4*(rowCount-1))/rowCount)
    const expectedHeight=Math.min(34,Math.max(1,availableHeight),Math.max(28,layout.upcomingRect.width*.085))
    assert.deepEqual(layout.upcomingRows.map(row=>row.rowRect.height),Array(layout.upcomingRows.length).fill(expectedHeight))
  }
})

test('expanded-vertical Countdown keeps compact groups in one vertical composition', () => {
  const profile=responsiveCellProfile(2,4,2*196,4*114)
  const layout=countdownLayout(profile,countdownComposition(profile,countdownStudioPresets.extreme))
  assert.ok(layout.heroGroupRect.height<layout.primaryRect.height)
  assert.ok(layout.upcomingGroupRect.height<layout.upcomingRect.height)
  assert.equal(layout.upcomingGroupRect.x,layout.upcomingRect.x)
  assert.equal(layout.upcomingGroupRect.width,layout.upcomingRect.width)
  const visualGap=layout.upcomingGroupRect.y-(layout.heroGroupRect.y+layout.heroGroupRect.height)
  assert.ok(visualGap>=16&&visualGap<80)
})

test('3x2 Countdown keeps its established non-expanded composition', () => {
  const profile=responsiveCellProfile(3,2,3*196,2*114),composition=countdownComposition(profile,countdownStudioPresets.normal)
  const layout=countdownLayout(profile,composition)
  assert.equal(composition.family,'stack');assert.equal(layout.heroGroupRect,layout.primaryRect);assert.equal(layout.upcomingRows.length,0)
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
  assert.match(responsive,/ellipsize\(item\.title/);assert.match(responsive,/effectiveDate=state\.displayDate\|\|state\.targetDate/);assert.match(responsive,/measureText\(effectiveDate\)/)
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
  assert.ok(['split','vertical'].includes(large.direction));assert.equal(large.showTomorrow,true);assert.ok(large.maxItems>small.maxItems)
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

test('large-landscape Reminders select a bounded split or stacked candidate from content', () => {
  for(const [colSpan,rowSpan,width,height] of [[4,3,785,343],[3,2,588,229],[3,3,588,343]]){
    const profile=responsiveCellProfile(colSpan,rowSpan,width,height)
    const composition=reminderComposition(profile,reminderStudioPresets.extreme),layout=reminderLayout(profile,composition)
    assert.equal(profile.orientation,'landscape');assert.ok(['split-sections','vertical-list'].includes(composition.family))
    assert.ok(layout.todayRect&&layout.tomorrowRect)
    if(composition.direction==='split'){assert.ok(layout.todayRect.x+layout.todayRect.width<layout.tomorrowRect.x);assert.equal(layout.todayRect.y,layout.tomorrowRect.y)}
    else assert.ok(layout.todayRect.y+layout.todayRect.height<=layout.tomorrowRect.y)
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

test('split sections choose content-aware widths instead of a fixed 70/30 allocation', () => {
  const profile=responsiveCellProfile(4,3,785,343)
  const normal=reminderLayout(profile,reminderComposition(profile,reminderStudioPresets.normal))
  assert.ok(normal.todayRect.width/normal.tomorrowRect.width<=1.9)
  assert.notEqual(reminderComposition(profile,reminderStudioPresets.normal).splitRatio,.7)
  const todayOnly={today:reminderStudioPresets.extreme.today,tomorrow:[]}
  const expanded=reminderLayout(profile,reminderComposition(profile,todayOnly))
  assert.equal(expanded.tomorrowRect,null);assert.equal(expanded.todayRect.width,profile.width-expanded.pad*2)
})

test('candidate overflow remains inside its owning footer', () => {
  const profile=responsiveCellProfile(4,3,785,343),items=reminderStudioPresets.extreme.today
  const state={today:[...items,...items],tomorrow:[...items,...items]}
  const composition=reminderComposition(profile,state),layout=reminderLayout(profile,composition)
  assert.ok(composition.todayOverflow>0&&composition.tomorrowOverflow>0)
  if(composition.direction==='split')for(const [section,footer] of [[layout.todayRect,layout.todayFooterRect],[layout.tomorrowRect,layout.tomorrowFooterRect]]){
    assert.ok(footer.x>=section.x&&footer.x+footer.width<=section.x+section.width)
    assert.ok(footer.y>=section.y&&footer.y+footer.height<=section.y+section.height)
  }
  else {assert.ok(layout.footerRect);for(const item of layout.items)assert.ok(item.itemRect.y+item.itemRect.height<=layout.footerRect.y)}
})

test('Reminders horizontal items, time, title, and overflow own disjoint regions', () => {
  for(const colSpan of [1,2,3]){
    const profile=responsiveCellProfile(colSpan,1,colSpan*196,114)
    const composition=reminderComposition(profile,reminderStudioPresets.extreme),layout=reminderLayout(profile,composition)
    assert.equal(composition.showTomorrow,false)
    const footerFits=profile.width-layout.pad*2>=196
    assert.equal(Boolean(layout.footerRect),footerFits)
    for(let index=1;index<layout.items.length;index++)assert.ok(layout.items[index-1].itemRect.x+layout.items[index-1].itemRect.width<=layout.items[index].itemRect.x)
    for(const item of layout.items){
      assert.ok(item.timeRect.y+item.timeRect.height<=item.titleRect.y||item.timeRect.x+item.timeRect.width<=item.titleRect.x)
      if(layout.footerRect)assert.ok(item.itemRect.x+item.itemRect.width<=layout.footerRect.x)
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

test('Reminders item typography is capped at B12 with B9 as its dense fallback', async () => {
  assert.equal(reminderDensity(300,3).name,'normal')
  assert.equal(reminderDensity(150,3).name,'normal')
  assert.equal(reminderDensity(150,6).name,'dense')
  assert.equal(reminderDensity(150,30).fontSize,13)

  const sparseState={today:reminderStudioPresets.normal.today.slice(0,3),tomorrow:[]}
  const profile=responsiveCellProfile(2,4,392,500)
  const layout=reminderLayout(profile,reminderComposition(profile,sparseState))
  assert.ok(layout.items.every((item)=>item.density.name==='normal'))
  assert.ok(layout.items.every((item)=>item.itemRect.height===42))
  assert.ok(layout.todayRect.y+layout.todayRect.height<profile.height-layout.pad)

  const mixedLargeProfile=responsiveCellProfile(2,4,392,500)
  const mixedLarge=reminderLayout(mixedLargeProfile,reminderComposition(mixedLargeProfile,reminderStudioPresets.normal))
  assert.deepEqual(new Set(mixedLarge.items.map((item)=>item.density.name)),new Set(['normal']))
  const todayItems=mixedLarge.items.slice(0,3),tomorrowItems=mixedLarge.items.slice(3)
  assert.ok(todayItems.length&&tomorrowItems.length)
  assert.ok(todayItems.every((item)=>item.density.font==='B12'))
  assert.ok(tomorrowItems.every((item)=>item.density.font==='B12'))

  const mixedMediumProfile=responsiveCellProfile(2,3,392,330)
  const mixedMedium=reminderLayout(mixedMediumProfile,reminderComposition(mixedMediumProfile,reminderStudioPresets.normal))
  assert.deepEqual(new Set(mixedMedium.items.map((item)=>item.density.name)),new Set(['normal']))

  const timedState={today:[reminderStudioPresets.normal.today.find((item)=>item.time==='18:00')],tomorrow:[]}
  const timedLayout=reminderLayout(profile,reminderComposition(profile,timedState))
  const timedItem=timedLayout.items[0]
  assert.equal(timedItem.stacked,false)
  assert.equal(timedItem.density.name,'normal')
  assert.equal(timedItem.timeRect.width,62)
  assert.ok(timedItem.timeRect.x+timedItem.timeRect.width<timedItem.titleRect.x)
  assert.ok(timedItem.titleRect.width>timedItem.timeRect.width)

  const firmware=await readFile(new URL('../frame/src/modules/ModuleReminders.cpp',import.meta.url),'utf8')
  assert.doesNotMatch(firmware,/pixelsPerRow >= 62[\s\S]*FONT_B18, 56, 6, 88/)
  assert.match(firmware,/pixelsPerRow >= 44[\s\S]*FONT_B12, 42, 5, 62[\s\S]*FONT_B9, 34, 4, 48/)
  assert.match(firmware,/const int timeW = density\.timeW, gap = 7/)
  assert.match(firmware,/drawAdaptiveItem\([^)]*const AdaptiveReminderDensity& density\)/)
  assert.doesNotMatch(firmware,/adaptiveReminderDensity\(row\.h, 1\)/)
  assert.match(firmware,/rowsAvailable[\s\S]*adaptiveReminderDensity\(rowsAvailable, totalRows\)[\s\S]*drawAdaptiveSection\(today[\s\S]*&density\)[\s\S]*drawAdaptiveSection\(tomorrow[\s\S]*&density\)/)
})

test('Studio sample-data options keep lowercase state values separate from labels', async () => {
  assert.deepEqual(REMINDER_STUDIO_PRESET_VALUES,['normal','long','extreme','empty'])
  for(const value of REMINDER_STUDIO_PRESET_VALUES)assert.ok(reminderStudioPresets[value])
  const source=await readFile(new URL('../app/frame-simulator/FrameSimulator.tsx',import.meta.url),'utf8')
  assert.match(source,/<label>Sample data <select/);assert.match(source,/<option key=\{x\} value=\{x\}>/)
  assert.match(source,/GeometryShowcase module=\{showcaseModule\}[^>]*preset=\{preset\}/)
})

test('AI Follow is a Studio-only picker option and participates in the responsive showcase', async () => {
  const source=await readFile(new URL('../app/frame-simulator/FrameSimulator.tsx',import.meta.url),'utf8')
  const simulatorLibrary=await readFile(new URL('../app/lib/frameSimulator.ts',import.meta.url),'utf8')
  const productionRegistry=JSON.parse(await readFile(new URL('../shared/frame-modules.json',import.meta.url),'utf8'))
  assert.equal((simulatorLibrary.match(/id:'ai-follow'/g)||[]).length,1);assert.doesNotMatch(JSON.stringify(productionRegistry),/ai-follow/)
  assert.match(source,/studioModuleRegistry\.map\(module/);assert.match(source,/responsiveShowcaseRegistry\.map\(m/)
  assert.match(simulatorLibrary,/responsiveShowcaseRegistry[^\n]+studioModuleRegistry/);assert.match(source,/if\(m==='ai-follow'\).*drawResponsiveAiFollow/);assert.doesNotMatch(source,/m as ModuleName|Topic update/)
})
