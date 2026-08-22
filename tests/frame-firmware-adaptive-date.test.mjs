import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { customPhysicalPayload, supportsPhysicalCustomCell, validateCustomGeometry } from '../app/lib/customLayouts.mjs'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
const [types, layoutSource, renderer, dateSource, adaptiveDate, docs] = await Promise.all([
  read('frame/src/core/Types.h'),
  read('frame/src/core/Layout.cpp'),
  read('frame/src/modules/ModuleRenderer.cpp'),
  read('frame/src/modules/ModuleDate.cpp'),
  read('frame/src/modules/ModuleDateAdaptive.cpp'),
  read('docs/physical-layout-migration-safety.md'),
])

const ADAPTIVE = [
  [1,1],[1,2],[1,3],[1,4],
  [2,1],[2,3],[2,4],
  [3,1],[3,2],[3,3],[3,4],
  [4,3],
]
const ANCHORS = new Set(['4x1','2x2','4x2','4x4'])

function completeTiling(targetWidth, targetHeight, targetModule = 'date') {
  const occupied = Array(16).fill(false)
  const cells = []
  let slot = 0
  const add = (col,row,colSpan,rowSpan,module) => {
    cells.push({slot:slot++,col,row,colSpan,rowSpan,module})
    for(let y=row;y<row+rowSpan;y++) for(let x=col;x<col+colSpan;x++) occupied[y*4+x]=true
  }
  add(0,0,targetWidth,targetHeight,targetModule)
  for(let row=0;row<4;row++) for(let col=0;col<4;col++) {
    if(!occupied[row*4+col]) add(col,row,1,1,'date')
  }
  return cells
}

function payloadFor(cells) {
  const geometry = cells.map(({module:ignored,...cell})=>cell)
  const assignments = Object.fromEntries(cells.map(cell=>[cell.slot,cell.module]))
  const layout = {id:'phase-e1-test',deviceId:'frame',ownerUserId:'user',name:'TEST',cells:geometry,sortOrder:0,createdAt:'',updatedAt:''}
  return customPhysicalPayload(layout,assignments)
}

test('resolved Cell preserves logical 4x4 geometry without changing the four anchor sizes',()=>{
  assert.match(types,/struct Cell[\s\S]*uint8_t gridCol;[\s\S]*uint8_t gridRow;[\s\S]*uint8_t colSpan;[\s\S]*uint8_t rowSpan;/)
  const resolver=layoutSource.match(/bool resolveGridCell[\s\S]*?\n\}/)?.[0]
  assert.ok(resolver)
  assert.match(resolver,/g\.slot, g\.size,[\s\S]*g\.col, g\.row, g\.colSpan, g\.rowSpan/)
  assert.match(layoutSource,/colSpan == 4 && rowSpan == 1[\s\S]*CELL_SMALL[\s\S]*colSpan == 2 && rowSpan == 2[\s\S]*CELL_MEDIUM[\s\S]*colSpan == 4 && rowSpan == 2[\s\S]*CELL_LARGE[\s\S]*colSpan == 4 && rowSpan == 4[\s\S]*CELL_XL/)
})

test('all twelve adaptive geometries are physically valid when every adaptive cell is Date',()=>{
  for(const [w,h] of ADAPTIVE){
    assert.equal(ANCHORS.has(`${w}x${h}`),false)
    const cells=completeTiling(w,h)
    const validation=validateCustomGeometry(cells,{requirePhysical:true,requireModules:true})
    assert.deepEqual(validation,{valid:true,errors:[],unsupportedSlots:[]},`${w}x${h}`)
    assert.ok(payloadFor(cells),`${w}x${h} payload`)
    assert.equal(supportsPhysicalCustomCell(cells[0]),true,`${w}x${h} Date capability`)
  }
})

test('adaptive non-Date modules fail the strict physical gate',()=>{
  for(const [w,h,module] of [[1,1,'weather:1'],[3,3,'reminders'],[1,4,'countdown:1']]){
    const cells=completeTiling(w,h,module)
    const validation=validateCustomGeometry(cells,{requirePhysical:true,requireModules:true})
    assert.equal(validation.valid,false,`${w}x${h} ${module}`)
    assert.deepEqual(validation.unsupportedSlots,[0])
    assert.ok(validation.errors.includes('unsupported_geometry'))
    assert.equal(payloadFor(cells),null)
  }
})

test('mixed anchors plus adaptive Date pass, one adaptive Weather rejects the whole payload',()=>{
  const good=[
    {slot:0,col:0,row:0,colSpan:4,rowSpan:1,module:'weather:1'},
    {slot:1,col:0,row:1,colSpan:1,rowSpan:3,module:'date'},
    {slot:2,col:1,row:1,colSpan:3,rowSpan:3,module:'date'},
  ]
  assert.equal(validateCustomGeometry(good,{requirePhysical:true,requireModules:true}).valid,true)
  assert.ok(payloadFor(good))
  const bad=good.map(cell=>cell.slot===2?{...cell,module:'weather:1'}:cell)
  const validation=validateCustomGeometry(bad,{requirePhysical:true,requireModules:true})
  assert.equal(validation.valid,false)
  assert.deepEqual(validation.unsupportedSlots,[2])
  assert.equal(payloadFor(bad),null)
})

test('firmware preflight is module-aware and remains atomic before divider publication',()=>{
  const preflight=layoutSource.match(/static bool prepareCustomRender[\s\S]*?\n\}/)?.[0]
  assert.ok(preflight)
  assert.match(preflight,/buildGridCells[\s\S]*moduleNameForSlot[\s\S]*CELL_ADAPTIVE[\s\S]*canRenderCell[\s\S]*deriveGridDividers[\s\S]*output = staged/)
  assert.match(layoutSource,/isLegacyRenderableGridLayout[\s\S]*return validateGridLayout\(layout\)/)
  assert.match(renderer,/bool ModuleRenderer::canRenderCell[\s\S]*isAnchorGeometry\(cell\)[\s\S]*sameAsciiIgnoreCase\(module, "date"\)/)
  assert.doesNotMatch(renderer,/CELL_ADAPTIVE/)
})

test('handmade Date anchors stay on ModuleDate while only non-anchors route adaptive',()=>{
  assert.match(renderer,/if \(mod\.equalsIgnoreCase\("date"\)\)[\s\S]*if \(isAnchorGeometry\(c\)\) ModuleDate::render\(c\);[\s\S]*else ModuleDateAdaptive::render\(c\)/)
  assert.match(dateSource,/c\.size == CELL_SMALL[\s\S]*c\.size == CELL_MEDIUM[\s\S]*c\.size == CELL_LARGE[\s\S]*c\.size == CELL_XL/)
  assert.doesNotMatch(dateSource,/ModuleDateAdaptive/)
})

test('adaptive Date follows Studio disclosure thresholds and uses logical spans plus physical bounds',()=>{
  assert.match(adaptiveDate,/c\.colSpan < 1[\s\S]*c\.rowSpan < 1/)
  assert.match(adaptiveDate,/logicalLandscape = c\.colSpan > c\.rowSpan/)
  assert.match(adaptiveDate,/c\.w < 150 \|\| c\.h < 88 \|\| \(c\.w < 230 && c\.h < 140\)/)
  assert.match(adaptiveDate,/c\.w >= 430 && c\.h >= 210/)
  assert.match(adaptiveDate,/c\.w >= 330 && c\.h >= 400/)
  assert.match(adaptiveDate,/\(c\.w >= 700 && c\.h >= 330\) \|\| \(c\.w >= 520 && c\.h >= 400\)/)
  assert.match(adaptiveDate,/rect\.w < 154 \|\| rect\.h < 92/)
  assert.match(adaptiveDate,/rect\.w >= 168 && rect\.h >= 112/)
  assert.match(adaptiveDate,/rect\.w >= 190 && rect\.h >= 126/)
  assert.match(adaptiveDate,/requestTitle && showDow && rect\.h >= 146/)
  assert.doesNotMatch(adaptiveDate,/substring|truncate|\.slice\(/i)
})

test('Date Adaptive Lab is documented as 2x1 + 2x1 + 3x3 + 1x3',()=>{
  assert.match(docs,/Date Adaptive Lab/)
  assert.match(docs,/"colSpan": 2, "rowSpan": 1/)
  assert.match(docs,/"colSpan": 3, "rowSpan": 3/)
  assert.match(docs,/"colSpan": 1, "rowSpan": 3/)
})
