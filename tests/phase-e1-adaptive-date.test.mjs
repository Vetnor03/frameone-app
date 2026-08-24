import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {supportsPhysicalCustomLayout,validateCustomGeometry} from '../app/lib/customLayouts.mjs'
import {dateComposition,dateLayout,dateStudioPresets} from '../app/lib/dateResponsive.mjs'

const adaptive=[[1,1],[1,2],[1,3],[1,4],[2,1],[2,3],[2,4],[3,1],[3,2],[3,3],[3,4],[4,3]]
const boundsX=[9,205,401,597,794],boundsY=[22,136,251,365,480]
const size=(w,h)=>w===4&&h===1?'CELL_SMALL':w===2&&h===2?'CELL_MEDIUM':w===4&&h===2?'CELL_LARGE':w===4&&h===4?'CELL_XL':'CELL_ADAPTIVE'
function tiling(w,h,module='date') {
  const cells=[{slot:0,col:0,row:0,colSpan:w,rowSpan:h,module}];let slot=1
  for(let row=0;row<4;row++)for(let col=0;col<4;col++)if(!(col<w&&row<h))cells.push({slot:slot++,col,row,colSpan:1,rowSpan:1,module:'date'})
  return cells
}
const profile=(colSpan,rowSpan)=>({width:boundsX[colSpan]-9,height:boundsY[rowSpan]-22,
  orientation:colSpan>rowSpan?'landscape':colSpan<rowSpan?'portrait':'square'})

test('physical geometries select the finished Studio visual policy',()=>{
  const micro=dateComposition(profile(1,1),dateStudioPresets.extreme),microLayout=dateLayout(profile(1,1),micro)
  const visibleFacts=micro.family==='micro'?['day','weekday']:['year','month','day','weekday']
  assert.equal(micro.family,'micro');assert.equal(micro.showYear,false);assert.deepEqual(visibleFacts,['day','weekday'])
  assert.ok(microLayout.dayRect);assert.ok(microLayout.weekdayRect)
  assert.equal(dateComposition(profile(2,1),dateStudioPresets.extreme).family,'horizontal')
  for(const [w,h] of [[2,4],[3,3]]){const p=profile(w,h),composition=dateComposition(p,dateStudioPresets.extreme),layout=dateLayout(p,composition);assert.equal(composition.family,'calendar-split');assert.equal(composition.holidayRows,1);assert.ok(layout.holidayRect)}
  const expanded=dateComposition(profile(3,4),dateStudioPresets.extreme),expandedLayout=dateLayout(profile(3,4),expanded)
  assert.equal(expanded.family,'expanded');assert.ok(expanded.currentCalendar);assert.ok(expanded.nextCalendar);assert.equal(expanded.holidayRows,2);assert.ok(expandedLayout.holidayRect)
  assert.equal(dateComposition(profile(4,3),dateStudioPresets.extreme).family,'expanded')
})

test('all twelve Date adaptive geometries form complete eligible 4x4 plans with exact resolution',()=>{
  for(const [w,h] of adaptive){const cells=tiling(w,h),target=cells[0]
    assert.equal(validateCustomGeometry(cells).valid,true,`${w}x${h} structural`)
    assert.equal(size(w,h),'CELL_ADAPTIVE');assert.equal(target.colSpan,w);assert.equal(target.rowSpan,h)
    assert.equal(target.col,0);assert.equal(target.row,0);assert.equal(target.module,'date')
    assert.deepEqual([boundsX[target.col],boundsY[target.row],boundsX[w]-boundsX[0],boundsY[h]-boundsY[0]],
      [9,22,boundsX[w]-9,boundsY[h]-22])
    assert.equal(supportsPhysicalCustomLayout(cells).valid,true,`${w}x${h} preflight`)
  }
})

test('unsupported adaptive assignments reject the whole plan atomically',()=>{
  for(const [w,h,module] of [[1,1,'weather'],[3,3,'reminders'],[1,4,'countdown']])
    assert.equal(supportsPhysicalCustomLayout(tiling(w,h,module)).valid,false)
  const lab=tiling(3,3);lab.find(c=>c.slot===1).module='weather'
  assert.equal(supportsPhysicalCustomLayout(lab).valid,false)
  for(const module of ['', 'unknown'])assert.equal(supportsPhysicalCustomLayout(tiling(3,3,module)).valid,false)
  const anchorWeather=[{slot:0,col:0,row:0,colSpan:4,rowSpan:1,module:'weather'},
    {slot:1,col:0,row:1,colSpan:3,rowSpan:3,module:'date'},{slot:2,col:3,row:1,colSpan:1,rowSpan:3,module:'date'}]
  assert.equal(supportsPhysicalCustomLayout(anchorWeather).valid,true)
  assert.equal(supportsPhysicalCustomLayout([...tiling(1,1),{...tiling(1,1)[0]}]).valid,false)
})

test('firmware keeps anchor dispatch frozen and gates only adaptive Date centrally',async()=>{
  const [types,layout,renderer,date]=await Promise.all(['frame/src/core/Types.h','frame/src/core/Layout.cpp','frame/src/modules/ModuleRenderer.cpp','frame/src/modules/ModuleDate.cpp'].map(p=>readFile(new URL(`../${p}`,import.meta.url),'utf8')))
  assert.match(types,/uint8_t gridCol, gridRow, colSpan, rowSpan;/)
  assert.match(layout,/g\.col, g\.row, g\.colSpan, g\.rowSpan, g\.size/)
  assert.match(renderer,/cell\.size != CELL_ADAPTIVE[\s\S]*strcasecmp\(module, "date"\)/)
  assert.match(layout,/validateGridLayout\(custom\.grid\)[\s\S]*buildGridCells[\s\S]*canRenderCell[\s\S]*deriveGridDividers[\s\S]*resolveGridDivider[\s\S]*output = staged/)
  const dispatch=date.match(/static void renderDate[\s\S]*?\n\}/)[0]
  assert.ok(dispatch.indexOf('c.size == CELL_ADAPTIVE')<dispatch.indexOf('c.size == CELL_SMALL'))
  for(const anchor of ['CELL_SMALL','CELL_MEDIUM','CELL_LARGE','CELL_XL'])assert.match(dispatch,new RegExp(`c\\.size == ${anchor}`))
  assert.match(date,/app\/lib\/dateResponsive\.mjs/)
  assert.match(date,/if \(micro\)[\s\S]*uppercaseAscii\(wday[\s\S]*else if \(shallow/)
  assert.match(date,/drawAdaptiveWeekdayBadge[\s\S]*GxEPD_WHITE[\s\S]*GxEPD_BLACK/)
  assert.match(date,/drawAdaptiveHolidays[\s\S]*UPCOMING HOLIDAYS/)
  assert.doesNotMatch(date,/substring|\.substr\(/)
})
