import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {supportsPhysicalCustomLayout,validateCustomGeometry} from '../app/lib/customLayouts.mjs'

const adaptive=[[1,1],[1,2],[1,3],[1,4],[2,1],[2,3],[2,4],[3,1],[3,2],[3,3],[3,4],[4,3]]
const boundsX=[9,205,401,597,794],boundsY=[22,136,251,365,480]
const size=(w,h)=>w===4&&h===1?'CELL_SMALL':w===2&&h===2?'CELL_MEDIUM':w===4&&h===2?'CELL_LARGE':w===4&&h===4?'CELL_XL':'CELL_ADAPTIVE'
function tiling(w,h,module='date') {
  const cells=[{slot:0,col:0,row:0,colSpan:w,rowSpan:h,module}];let slot=1
  for(let row=0;row<4;row++)for(let col=0;col<4;col++)if(!(col<w&&row<h))cells.push({slot:slot++,col,row,colSpan:1,rowSpan:1,module:'date'})
  return cells
}

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
  assert.doesNotMatch(date,/substring|\.substr\(/)
})
