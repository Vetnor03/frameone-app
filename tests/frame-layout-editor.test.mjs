import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {cellsFullyContainedInSelection,chooseNearestEdge,clampPointToViewport,createHistory,detectOrientation,dragSelectionFromPointers,finalizeDividerStroke,finalizeStroke,findDividerNearPointer,findSplitGuideNearPointer,gridCellAtPointer,hasOverlap,initialLayout,internalDividerSegments,mergeCells,mergeCellsInSelection,mergeDivider,nearestValidSplitGuide,overwriteWithSelection,previewDividerStroke,previewStroke,pushHistory,redoHistory,resolveDividerStrokeLock,resolveShortTap,selectionBetweenGridCells,selectionIsExactlyTiled,snapBoundary,snapDragSelection,splitCellAtBoundary,splitCellNearPointer,subtractRectangle,undoHistory,validateLayout} from '../app/lib/frameLayoutEditor.mjs'
const viewport={width:400,height:400}
const stroke=(x1,y1,x2,y2)=>({start:{x:x1,y:y1},end:{x:x2,y:y2}})
const split=(cells,s)=>previewStroke(cells,s,viewport)
const geometry=cells=>cells.map(({col,row,colSpan,rowSpan,moduleId})=>({col,row,colSpan,rowSpan,moduleId}))
const assertPartition=cells=>{assert.equal(validateLayout(cells),true);assert.equal(cells.reduce((n,c)=>n+c.colSpan*c.rowSpan,0),16);for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++)assert.equal(hasOverlap(cells[i],cells[j]),false);for(let row=0;row<4;row++)for(let col=0;col<4;col++)assert.equal(cells.filter(c=>col>=c.col&&col<c.col+c.colSpan&&row>=c.row&&row<c.row+c.rowSpan).length,1)}
test('detects vertical and horizontal intent',()=>{assert.equal(detectOrientation(stroke(30,10,35,300)),'vertical');assert.equal(detectOrientation(stroke(10,30,300,35)),'horizontal')})
test('snaps representative pixels to every 4x4 boundary',()=>{assert.deepEqual([0,49,51,99,101,149,151,199,201,249,251,299,301,349,351,399,400].map(v=>snapBoundary(v,400)),[0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4]);assert.deepEqual([0,100,200,300,400].map(v=>snapBoundary(v,400)),[0,1,2,3,4])})
test('nearest edge selection and ties are deterministic',()=>{const c=initialLayout()[0];assert.equal(chooseNearestEdge(c,'vertical',1),'left');assert.equal(chooseNearestEdge(c,'vertical',3),'right');assert.equal(chooseNearestEdge(c,'vertical',2),'left');assert.equal(chooseNearestEdge(c,'horizontal',1),'top');assert.equal(chooseNearestEdge(c,'horizontal',3),'bottom');assert.equal(chooseNearestEdge(c,'horizontal',2),'top')})
test('top-left single line creates the specified three rectangles',()=>{const p=split(initialLayout(),stroke(100,0,104,200));assert.equal(p.valid,true);assert.deepEqual(geometry(p.cells),[{col:0,row:0,colSpan:1,rowSpan:2,moduleId:'empty'},{col:1,row:0,colSpan:3,rowSpan:4,moduleId:'empty'},{col:0,row:2,colSpan:1,rowSpan:2,moduleId:'empty'}]);assertPartition(p.cells)})
test('mirrored corner gestures produce rectangular normalized partitions',()=>{for(const s of [stroke(300,0,296,200),stroke(100,200,104,400),stroke(300,200,296,400),stroke(0,100,200,104),stroke(200,300,400,296)]){const p=split(initialLayout(),s);assert.equal(p.valid,true);assert.equal(p.cells.length,3);assertPartition(p.cells)}})
test('repeated splits remain in bounds, gapless and non-overlapping',()=>{let cells=split(initialLayout(),stroke(100,0,102,200)).cells;const target=cells.find(c=>c.col===1);const p=split(cells,stroke(210,100,390,104));assert.equal(p.valid,true);cells=p.cells;assert.ok(target);assertPartition(cells);assert.ok(cells.every(c=>c.col+c.colSpan<=4&&c.row+c.rowSpan<=4))})

test('internal dividers exclude the viewport edge, merge adjacency, and preserve a T junction',()=>{const cells=[{id:'a',col:0,row:0,colSpan:1,rowSpan:2,moduleId:'empty'},{id:'b',col:0,row:2,colSpan:1,rowSpan:2,moduleId:'empty'},{id:'c',col:1,row:0,colSpan:3,rowSpan:4,moduleId:'empty'}];const segments=internalDividerSegments(cells);assert.deepEqual(segments,[{axis:'vertical',boundary:1,from:0,to:4},{axis:'horizontal',boundary:2,from:0,to:1}]);assert.equal(new Set(segments.map(x=>JSON.stringify(x))).size,segments.length);assert.ok(segments.every(x=>x.boundary>0&&x.boundary<4))})
test('contiguous unit dividers merge into one unique segment',()=>{const cells=[{id:'left',col:0,row:0,colSpan:2,rowSpan:4,moduleId:'empty'},{id:'r1',col:2,row:0,colSpan:2,rowSpan:1,moduleId:'empty'},{id:'r2',col:2,row:1,colSpan:2,rowSpan:3,moduleId:'empty'}];assert.deepEqual(internalDividerSegments(cells),[{axis:'vertical',boundary:2,from:0,to:4},{axis:'horizontal',boundary:1,from:2,to:4}])})
test('pointer-up finalization uses the release endpoint rather than stale move preview',()=>{const cells=initialLayout(),move=previewStroke(cells,stroke(100,0,100,100),viewport),release=finalizeStroke(cells,{x:100,y:0},{x:100,y:200},viewport);assert.notDeepEqual(geometry(move.cells),geometry(release.cells));assert.deepEqual(geometry(release.cells),geometry(split(cells,stroke(100,0,100,200)).cells))})
test('invalid and no-op gestures retain the same layout reference',()=>{const cells=initialLayout();for(const s of [stroke(10,10,12,12),stroke(-1,20,200,20),stroke(0,0,0,300),stroke(100,10,100,20)]){const p=split(cells,s);assert.equal(p.valid,false);assert.equal(p.cells,cells)}})
test('undo and redo restore exact immutable states',()=>{const before=initialLayout(),after=split(before,stroke(100,0,100,200)).cells;const pushed=pushHistory(createHistory(before),after),undone=undoHistory(pushed),redone=redoHistory(undone);assert.deepEqual(undone.present,before);assert.deepEqual(redone.present,after);assert.deepEqual(before,initialLayout())})
test('assignment follows largest result and top-left wins an area tie',()=>{const assigned=[{...initialLayout()[0],moduleId:'weather'}];let p=split(assigned,stroke(100,0,100,200));assert.equal(p.cells.find(c=>c.moduleId==='weather').col,1);const half=[{id:'half',col:0,row:0,colSpan:2,rowSpan:4,moduleId:'date'},{id:'right',col:2,row:0,colSpan:2,rowSpan:4,moduleId:'empty'}];p=split(half,stroke(0,200,200,200));const keeper=p.cells.find(c=>c.moduleId==='date');assert.deepEqual({col:keeper.col,row:keeper.row},{col:0,row:0})})
test('merges horizontal and vertical neighbors into valid complete partitions',()=>{for(const cells of [[{id:'left',col:0,row:0,colSpan:2,rowSpan:4,moduleId:'empty'},{id:'right',col:2,row:0,colSpan:2,rowSpan:4,moduleId:'empty'}],[{id:'top',col:0,row:0,colSpan:4,rowSpan:1,moduleId:'empty'},{id:'bottom',col:0,row:1,colSpan:4,rowSpan:3,moduleId:'empty'}]]){const result=mergeCells(cells,cells[0].id,cells[1].id);assert.equal(result.valid,true);assert.deepEqual(geometry(result.cells),[{col:0,row:0,colSpan:4,rowSpan:4,moduleId:'empty'}]);assertPartition(result.cells)}})
test('rejects neighbors that would form an L shape without changing the input',()=>{const cells=[{id:'a',col:0,row:0,colSpan:2,rowSpan:1,moduleId:'empty'},{id:'b',col:2,row:0,colSpan:2,rowSpan:2,moduleId:'empty'},{id:'c',col:0,row:1,colSpan:2,rowSpan:3,moduleId:'empty'},{id:'d',col:2,row:2,colSpan:2,rowSpan:2,moduleId:'empty'}];assertPartition(cells);const result=mergeCells(cells,'a','b');assert.equal(result.valid,false);assert.equal(result.cells,cells);assertPartition(result.cells)})
test('merge assignment rules preserve one or matching values and reject conflicts',()=>{const pair=(a,b)=>[{id:'left',col:0,row:0,colSpan:2,rowSpan:4,moduleId:a},{id:'right',col:2,row:0,colSpan:2,rowSpan:4,moduleId:b}];for(const [a,b,expected] of [['weather','empty','weather'],['empty','date','date'],['surf','surf','surf'],['empty','empty','empty']]){const result=mergeCells(pair(a,b),'left','right');assert.equal(result.valid,true);assert.equal(result.cells[0].moduleId,expected)}const conflict=pair('weather','date'),result=mergeCells(conflict,'left','right');assert.equal(result.valid,false);assert.equal(result.cells,conflict);assert.equal(findDividerNearPointer(conflict,{x:200,y:200},viewport),undefined)})
test('merge is one history operation and undo restores exact IDs and assignments',()=>{const before=[{id:'exact-left',col:0,row:0,colSpan:2,rowSpan:4,moduleId:'weather'},{id:'exact-right',col:2,row:0,colSpan:2,rowSpan:4,moduleId:'empty'}],merged=mergeCells(before,'exact-left','exact-right');assert.equal(merged.valid,true);assert.equal(merged.cells[0].id,'merged:exact-left+exact-right');const history=pushHistory(createHistory(before),merged.cells);assert.deepEqual(undoHistory(history).present,before);assert.deepEqual(redoHistory(undoHistory(history)).present,merged.cells)})
test('AI Follow assignment survives editor split and history operations',()=>{const before=[{...initialLayout()[0],moduleId:'ai-follow'}],splitResult=splitCellAtBoundary(before,'cell',{axis:'vertical',boundary:1});assert.equal(splitResult.valid,true);assert.equal(splitResult.cells.filter(c=>c.moduleId==='ai-follow').length,1);const history=pushHistory(createHistory(before),splitResult.cells);assert.deepEqual(undoHistory(history).present,before);assert.deepEqual(redoHistory(undoHistory(history)).present,splitResult.cells)})
test('split then targeted divider merge returns the original geometry',()=>{const before=initialLayout(),after=split(before,stroke(200,0,200,400)).cells,hit=findDividerNearPointer(after,{x:200,y:200},viewport),merged=mergeDivider(after,hit);assert.equal(merged.valid,true);assert.deepEqual(geometry(merged.cells),geometry(before));assertPartition(merged.cells)})
test('divider hit testing targets the compatible pair at the pointed segment',()=>{const cells=[{id:'l1',col:0,row:0,colSpan:2,rowSpan:1,moduleId:'empty'},{id:'r1',col:2,row:0,colSpan:2,rowSpan:1,moduleId:'empty'},{id:'l2',col:0,row:1,colSpan:2,rowSpan:3,moduleId:'empty'},{id:'r2',col:2,row:1,colSpan:2,rowSpan:3,moduleId:'empty'}];const upper=findDividerNearPointer(cells,{x:202,y:40},viewport),lower=findDividerNearPointer(cells,{x:198,y:250},viewport);assert.deepEqual(upper.cellIds,['l1','r1']);assert.deepEqual({from:upper.from,to:upper.to},{from:0,to:1});assert.deepEqual(lower.cellIds,['l2','r2']);assert.deepEqual({from:lower.from,to:lower.to},{from:1,to:4});assert.equal(findDividerNearPointer(cells,{x:230,y:40},viewport),undefined)})
test('registry mirrors every firmware dispatch and drives the picker',async()=>{const registry=JSON.parse(await readFile(new URL('../shared/frame-modules.json',import.meta.url),'utf8')),renderer=await readFile(new URL('../frame/src/modules/ModuleRenderer.cpp',import.meta.url),'utf8'),simulator=await readFile(new URL('../app/frame-simulator/FrameSimulator.tsx',import.meta.url),'utf8');const expected=['date','weather','surf','reminders','countdown','soccer','stocks','groceries'];assert.deepEqual(registry.map(x=>x.id),expected);for(const id of expected)assert.match(renderer,new RegExp(`(?:equalsIgnoreCase|startsWith)\\(\"${id}`));assert.match(simulator,/studioModuleRegistry\.map/);assert.doesNotMatch(simulator,/const modules\s*=/);assert.doesNotMatch(simulator,/committed\.forEach\(c=>ctx\.strokeRect/);assert.doesNotMatch(simulator,/ox\.strokeRect/);assert.match(simulator,/previewDividerStroke/);assert.match(simulator,/finalizeDividerStroke/);assert.doesNotMatch(simulator,/EditMode|setMode|>Draw<|>Erase</);for(const id of expected)assert.match(simulator,new RegExp(`${id}`))})


test('tap split chooses vertical, horizontal, and vertical on an exact tie',()=>{
  const full=initialLayout()
  let result=splitCellNearPointer(full,{x:205,y:130},viewport)
  assert.equal(result.valid,true);assert.deepEqual(result.guide,{axis:'vertical',boundary:2,distance:5});assert.equal(result.cells.length,2);assertPartition(result.cells)
  result=splitCellNearPointer(full,{x:40,y:295},viewport)
  assert.equal(result.valid,true);assert.equal(result.guide.axis,'horizontal');assert.equal(result.guide.boundary,3)
  assert.deepEqual(nearestValidSplitGuide(full[0],{x:200,y:200},viewport),{axis:'vertical',boundary:2,distance:0})
})
test('tap split requires a nearby guide and leaves distant cell geometry unchanged',()=>{
  const full=initialLayout(),before=geometry(full)
  assert.equal(findSplitGuideNearPointer(full[0],{x:50,y:50},viewport),undefined)
  assert.deepEqual(findSplitGuideNearPointer(full[0],{x:114,y:40},viewport),{axis:'vertical',boundary:1,distance:14})
  assert.equal(findSplitGuideNearPointer(full[0],{x:115,y:40},viewport),undefined)
  const result=splitCellNearPointer(full,{x:50,y:50},viewport)
  assert.equal(result.valid,false);assert.equal(result.cells,full);assert.deepEqual(geometry(result.cells),before);assertPartition(result.cells)
  const tap=resolveShortTap(full,{x:50,y:50},viewport)
  assert.equal(tap.kind,'select');assert.equal(tap.cell.id,'cell');assert.deepEqual(geometry(full),before)
})
test('nearby vertical and horizontal dotted guides split into valid partitions',()=>{
  const full=initialLayout()
  const vertical=splitCellNearPointer(full,{x:112,y:40},viewport),horizontal=splitCellNearPointer(full,{x:40,y:288},viewport)
  assert.equal(vertical.guide.axis,'vertical');assert.equal(vertical.guide.boundary,1);assertPartition(vertical.cells)
  assert.equal(horizontal.guide.axis,'horizontal');assert.equal(horizontal.guide.boundary,3);assertPartition(horizontal.cells)
})
test('short tap gives a removable solid divider priority over split and selection',()=>{
  const cells=[{id:'left',col:0,row:0,colSpan:2,rowSpan:4,moduleId:'empty'},{id:'right',col:2,row:0,colSpan:2,rowSpan:4,moduleId:'empty'}]
  const tap=resolveShortTap(cells,{x:200,y:200},viewport)
  assert.equal(tap.kind,'merge');const result=mergeDivider(cells,tap.divider);assert.equal(result.valid,true);assertPartition(result.cells)
})
test('complete-cell split preserves assignment on largest and deterministic top-left tie',()=>{
  const assigned=[{...initialLayout()[0],moduleId:'weather'}]
  let result=splitCellAtBoundary(assigned,'cell',{axis:'vertical',boundary:1});assert.equal(result.cells.find(c=>c.moduleId==='weather').col,1)
  result=splitCellAtBoundary(assigned,'cell',{axis:'horizontal',boundary:2});assert.deepEqual({row:result.cells.find(c=>c.moduleId==='weather').row,moduleId:result.cells.find(c=>c.moduleId==='weather').moduleId},{row:0,moduleId:'weather'})
})
test('drag snapping and merging two and three-plus cells',()=>{
  assert.deepEqual(snapDragSelection({x:5,y:5},{x:395,y:205},viewport),{col:0,row:0,colSpan:4,rowSpan:3})
  const two=[{id:'a',col:0,row:0,colSpan:2,rowSpan:4,moduleId:'empty'},{id:'b',col:2,row:0,colSpan:2,rowSpan:4,moduleId:'date'}]
  let result=mergeCellsInSelection(two,{col:0,row:0,colSpan:4,rowSpan:4});assert.equal(result.valid,true);assert.equal(result.cells[0].moduleId,'date');assertPartition(result.cells)
  const four=[{id:'a',col:0,row:0,colSpan:1,rowSpan:4,moduleId:'surf'},{id:'b',col:1,row:0,colSpan:1,rowSpan:4,moduleId:'surf'},{id:'c',col:2,row:0,colSpan:1,rowSpan:4,moduleId:'empty'},{id:'d',col:3,row:0,colSpan:1,rowSpan:4,moduleId:'empty'}]
  result=mergeCellsInSelection(four,{col:0,row:0,colSpan:3,rowSpan:4});assert.equal(result.valid,true);assert.equal(result.cells.find(c=>c.col===0).moduleId,'surf');assertPartition(result.cells)
})
test('drag selection uses the complete inclusive cells under both pointers',()=>{
  const center=(col,row)=>({x:col*100+50,y:row*100+50})
  assert.deepEqual(gridCellAtPointer(center(2,3),viewport),{col:2,row:3})
  assert.deepEqual(dragSelectionFromPointers(center(0,0),center(1,0),viewport),{col:0,row:0,colSpan:2,rowSpan:1})
  assert.deepEqual(dragSelectionFromPointers(center(0,0),center(2,1),viewport),{col:0,row:0,colSpan:3,rowSpan:2})
  assert.deepEqual(dragSelectionFromPointers(center(2,1),center(0,0),viewport),dragSelectionFromPointers(center(0,0),center(2,1),viewport))
  assert.deepEqual(dragSelectionFromPointers(center(3,3),center(0,0),viewport),{col:0,row:0,colSpan:4,rowSpan:4})
  assert.deepEqual(dragSelectionFromPointers({x:2,y:2},{x:99,y:99},viewport),{col:0,row:0,colSpan:1,rowSpan:1})
  assert.deepEqual(dragSelectionFromPointers({x:99,y:50},{x:100,y:50},viewport),{col:0,row:0,colSpan:2,rowSpan:1})
  assert.deepEqual(selectionBetweenGridCells({col:1,row:1},{col:2,row:2}),{col:1,row:1,colSpan:2,rowSpan:2})
  assert.deepEqual(gridCellAtPointer({x:400,y:400},viewport),{col:3,row:3})
})
test('cell-based drag merge is one undoable operation and overwrites partial regions',()=>{
  const units=Array.from({length:4},(_,row)=>Array.from({length:4},(_,col)=>({id:`${col}-${row}`,col,row,colSpan:1,rowSpan:1,moduleId:'empty'}))).flat()
  const selection=dragSelectionFromPointers({x:50,y:50},{x:250,y:150},viewport),merged=mergeCellsInSelection(units,selection)
  assert.equal(merged.valid,true);assert.deepEqual(geometry(merged.cells).find(c=>c.col===0&&c.row===0),{col:0,row:0,colSpan:3,rowSpan:2,moduleId:'empty'});assertPartition(merged.cells)
  assert.deepEqual(undoHistory(pushHistory(createHistory(units),merged.cells)).present,units)
  const crossing=[{id:'wide',col:0,row:0,colSpan:2,rowSpan:1,moduleId:'empty'},...units.filter(c=>c.row!==0||c.col>1)]
  const partial=dragSelectionFromPointers({x:150,y:50},{x:150,y:150},viewport)
  assert.equal(overwriteWithSelection(crossing,partial).valid,true)
})
test('drag rejects gaps, partial cells, L unions, and conflicting assignments',()=>{
  const quadrants=[{id:'a',col:0,row:0,colSpan:2,rowSpan:2,moduleId:'weather'},{id:'b',col:2,row:0,colSpan:2,rowSpan:2,moduleId:'date'},{id:'c',col:0,row:2,colSpan:2,rowSpan:2,moduleId:'empty'},{id:'d',col:2,row:2,colSpan:2,rowSpan:2,moduleId:'empty'}]
  assert.equal(mergeCellsInSelection(quadrants,{col:0,row:0,colSpan:4,rowSpan:2}).valid,false)
  assert.equal(mergeCellsInSelection(quadrants,{col:0,row:0,colSpan:3,rowSpan:2}).valid,false)
  const lSelection={col:0,row:0,colSpan:4,rowSpan:4},lCells=quadrants.filter(c=>c.id!=='d');assert.equal(selectionIsExactlyTiled(lCells,lSelection),false);assert.equal(mergeCellsInSelection(lCells,lSelection).valid,false)
  const safe=quadrants.map(c=>({...c,moduleId:'empty'}));assert.deepEqual(cellsFullyContainedInSelection(safe,{col:0,row:0,colSpan:4,rowSpan:2}).map(c=>c.id),['a','b'])
})

test('authoritative rectangle subtraction creates deterministic rectangular partitions',()=>{
  const full={id:'full',col:0,row:0,colSpan:4,rowSpan:4,moduleId:'weather'},center={col:1,row:1,colSpan:2,rowSpan:2}
  const fragments=subtractRectangle(full,center)
  assert.deepEqual(fragments.map(({col,row,colSpan,rowSpan})=>({col,row,colSpan,rowSpan})),[{col:0,row:0,colSpan:4,rowSpan:1},{col:0,row:1,colSpan:1,rowSpan:2},{col:3,row:1,colSpan:1,rowSpan:2},{col:0,row:3,colSpan:4,rowSpan:1}])
  let result=overwriteWithSelection([full],center);assert.equal(result.valid,true);assert.equal(result.cells.length,5);assert.equal(result.cells.find(c=>c.id.startsWith('override:')).moduleId,'empty');assert.equal(result.cells.find(c=>c.moduleId==='weather').row,0);assertPartition(result.cells)
  assert.deepEqual(overwriteWithSelection([full],center).cells,result.cells)
  result=overwriteWithSelection([full],{col:0,row:1,colSpan:2,rowSpan:2});assert.equal(result.valid,true);assert.equal(result.cells.length,4);assertPartition(result.cells)
})
test('mobile drag rectangles use simulator overwrite semantics from a full canvas',()=>{
  const full=initialLayout(),center=(col,row)=>({x:col*100+50,y:row*100+50})
  const cases=[
    [center(0,0),center(3,0),[{col:0,row:0,colSpan:4,rowSpan:1,moduleId:'empty'},{col:0,row:1,colSpan:4,rowSpan:3,moduleId:'empty'}]],
    [center(0,0),center(3,1),[{col:0,row:0,colSpan:4,rowSpan:2,moduleId:'empty'},{col:0,row:2,colSpan:4,rowSpan:2,moduleId:'empty'}]],
  ]
  for(const [start,end,expected] of cases){const result=overwriteWithSelection(full,dragSelectionFromPointers(start,end,viewport));assert.equal(result.valid,true);assert.deepEqual(geometry(result.cells),expected);assertPartition(result.cells)}

  const quadrantSelection=dragSelectionFromPointers(center(0,0),center(1,1),viewport)
  const quadrant=overwriteWithSelection(full,quadrantSelection)
  assert.equal(quadrant.valid,true);assert.ok(quadrant.cells.some(cell=>cell.col===0&&cell.row===0&&cell.colSpan===2&&cell.rowSpan===2));assertPartition(quadrant.cells)
  const reversed=overwriteWithSelection(full,dragSelectionFromPointers(center(1,1),center(0,0),viewport))
  assert.deepEqual(reversed.cells,quadrant.cells);assertPartition(reversed.cells)
})
test('mobile drag overwrite crosses existing partitions and every tap result remains valid',()=>{
  const before=[{id:'top',col:0,row:0,colSpan:4,rowSpan:1,moduleId:'empty'},{id:'lower-left',col:0,row:1,colSpan:2,rowSpan:3,moduleId:'empty'},{id:'lower-right',col:2,row:1,colSpan:2,rowSpan:3,moduleId:'empty'}]
  const selection=dragSelectionFromPointers({x:150,y:50},{x:250,y:250},viewport),overwritten=overwriteWithSelection(before,selection)
  assert.equal(overwritten.valid,true);assert.ok(overwritten.cells.some(cell=>cell.col===1&&cell.row===0&&cell.colSpan===2&&cell.rowSpan===3));assertPartition(overwritten.cells)

  const full=initialLayout(),splitTap=resolveShortTap(full,{x:200,y:100},viewport)
  assert.equal(splitTap.kind,'split');const splitResult=splitCellAtBoundary(full,splitTap.cell.id,splitTap.guide);assert.equal(splitResult.valid,true);assertPartition(splitResult.cells)
  const mergeTap=resolveShortTap(splitResult.cells,{x:200,y:100},viewport)
  assert.equal(mergeTap.kind,'merge');const mergeResult=mergeDivider(splitResult.cells,mergeTap.divider);assert.equal(mergeResult.valid,true);assertPartition(mergeResult.cells)
})
test('authoritative overwrite crosses assigned cells and is exactly undoable',()=>{
  const before=[{id:'left',col:0,row:0,colSpan:2,rowSpan:4,moduleId:'weather'},{id:'rt',col:2,row:0,colSpan:2,rowSpan:2,moduleId:'date'},{id:'rb',col:2,row:2,colSpan:2,rowSpan:2,moduleId:'surf'}]
  const result=overwriteWithSelection(before,{col:1,row:1,colSpan:2,rowSpan:2});assert.equal(result.valid,true);assertPartition(result.cells)
  const override=result.cells.find(c=>c.id.startsWith('override:'));assert.deepEqual({col:override.col,row:override.row,colSpan:override.colSpan,rowSpan:override.rowSpan,moduleId:override.moduleId},{col:1,row:1,colSpan:2,rowSpan:2,moduleId:'empty'})
  for(const moduleId of ['weather','date','surf'])assert.equal(result.cells.filter(c=>c.moduleId===moduleId).length,1)
  const history=pushHistory(createHistory(before),result.cells);assert.deepEqual(undoHistory(history).present,before);assert.deepEqual(redoHistory(undoHistory(history)).present,result.cells)
})
test('whole-cell authoritative overwrite preserves compatible assignments',()=>{
  const pair=(left,right)=>[{id:'a',col:0,row:0,colSpan:2,rowSpan:4,moduleId:left},{id:'b',col:2,row:0,colSpan:2,rowSpan:4,moduleId:right}]
  for(const [left,right,expected] of [['weather','empty','weather'],['surf','surf','surf']]){const merged=overwriteWithSelection(pair(left,right),{col:0,row:0,colSpan:4,rowSpan:4});assert.equal(merged.valid,true);assert.equal(merged.cells[0].moduleId,expected);assertPartition(merged.cells)}
})
test('whole-cell authoritative overwrite clears conflicts and preserves outside cells through history',()=>{
  const before=[{id:'a',col:0,row:0,colSpan:2,rowSpan:2,moduleId:'weather'},{id:'b',col:2,row:0,colSpan:2,rowSpan:2,moduleId:'date'},{id:'outside',col:0,row:2,colSpan:4,rowSpan:2,moduleId:'surf'}]
  const result=overwriteWithSelection(before,{col:0,row:0,colSpan:4,rowSpan:2});assert.equal(result.valid,true);assertPartition(result.cells)
  const merged=result.cells.find(c=>c.row===0);assert.deepEqual(merged,{id:'merged:a+b',col:0,row:0,colSpan:4,rowSpan:2,moduleId:'empty'});assert.equal(result.cells.find(c=>c.id==='outside'),before[2])
  const history=pushHistory(createHistory(before),result.cells),undone=undoHistory(history);assert.deepEqual(undone.present,before);assert.deepEqual(redoHistory(undone).present,result.cells)
})
test('mode-less simulator uses authoritative full overlay grid',async()=>{
  const simulator=await readFile(new URL('../app/frame-simulator/FrameSimulator.tsx',import.meta.url),'utf8'),declarations=await readFile(new URL('../app/lib/frameLayoutEditor.d.mts',import.meta.url),'utf8')
  assert.doesNotMatch(simulator,/EditMode|setMode|>Draw<|>Erase</)
  assert.match(simulator,/for\(let boundary=1;boundary<4;boundary\+\+\)\{line\(ctx,gridX\(boundary\),gridY\(0\),gridX\(boundary\),gridY\(4\)\);line\(ctx,gridX\(0\),gridY\(boundary\),gridX\(4\),gridY\(boundary\)\)\}/)
  assert.match(simulator,/x:\(e\.clientX-r\.left\)\*VIEWPORT\.width\/r\.width,y:\(e\.clientY-r\.top\)\*VIEWPORT\.height\/r\.height/)
  assert.doesNotMatch(simulator,/\*PANEL\.(?:width|height)\/r\.(?:width|height)-VIEWPORT\.(?:x|y)/)
  for(const helper of ['gridCellAtPointer','selectionBetweenGridCells','dragSelectionFromPointers','snapDragSelection','subtractRectangle','overwriteWithSelection'])assert.match(declarations,new RegExp(`export function ${helper}\\(`))
})

test('mode-less divider strokes draw, reverse, form T junctions, and partially erase',()=>{
  const draw=(cells,start,end)=>finalizeDividerStroke(cells,start,end,viewport)
  const horizontal=draw(initialLayout(),{x:0,y:198},{x:400,y:202});assert.equal(horizontal.valid,true);assert.deepEqual(geometry(horizontal.cells),[{col:0,row:0,colSpan:4,rowSpan:2,moduleId:'empty'},{col:0,row:2,colSpan:4,rowSpan:2,moduleId:'empty'}]);assertPartition(horizontal.cells)
  const vertical=draw(initialLayout(),{x:202,y:400},{x:198,y:0});assert.equal(vertical.valid,true);assert.deepEqual(geometry(vertical.cells),[{col:0,row:0,colSpan:2,rowSpan:4,moduleId:'empty'},{col:2,row:0,colSpan:2,rowSpan:4,moduleId:'empty'}]);assertPartition(vertical.cells)
  const t=draw(horizontal.cells,{x:201,y:400},{x:199,y:200});assert.equal(t.valid,true);assert.deepEqual(geometry(t.cells),[{col:0,row:0,colSpan:4,rowSpan:2,moduleId:'empty'},{col:0,row:2,colSpan:2,rowSpan:2,moduleId:'empty'},{col:2,row:2,colSpan:2,rowSpan:2,moduleId:'empty'}]);assertPartition(t.cells)
  const crooked=draw(initialLayout(),{x:0,y:190},{x:400,y:215});assert.equal(crooked.valid,true);assert.deepEqual(geometry(crooked.cells),geometry(horizontal.cells))
  const erased=draw(horizontal.cells,{x:400,y:202},{x:0,y:198});assert.equal(erased.valid,true);assert.deepEqual(geometry(erased.cells),geometry(initialLayout()));assertPartition(erased.cells)
  const four=draw(draw(horizontal.cells,{x:200,y:0},{x:200,y:200}).cells,{x:200,y:200},{x:200,y:400}).cells
  const upper=draw(four,{x:198,y:0},{x:202,y:200});assert.equal(upper.valid,true);assert.deepEqual(geometry(upper.cells),[{col:0,row:0,colSpan:4,rowSpan:2,moduleId:'empty'},{col:0,row:2,colSpan:2,rowSpan:2,moduleId:'empty'},{col:2,row:2,colSpan:2,rowSpan:2,moduleId:'empty'}]);assertPartition(upper.cells)
  const lower=draw(four,{x:202,y:400},{x:198,y:200});assert.equal(lower.valid,true);assert.deepEqual(geometry(lower.cells),[{col:0,row:0,colSpan:2,rowSpan:2,moduleId:'empty'},{col:2,row:0,colSpan:2,rowSpan:2,moduleId:'empty'},{col:0,row:2,colSpan:4,rowSpan:2,moduleId:'empty'}]);assertPartition(lower.cells)
  const invalid=draw(t.cells,{x:0,y:200},{x:200,y:200});assert.equal(invalid.valid,false);assert.equal(invalid.cells,t.cells);assertPartition(invalid.cells)
})

test('divider strokes normalize endpoints to every touched atomic segment',()=>{
  const rows=Array.from({length:4},(_,row)=>({id:`row-${row}`,col:0,row,colSpan:4,rowSpan:1,moduleId:'empty'}))
  const normalized=(start,end,cells=rows)=>previewDividerStroke(cells,{start,end},viewport)
  const forward=normalized({x:200,y:50},{x:200,y:150})
  const reverse=normalized({x:200,y:150},{x:200,y:50})
  assert.deepEqual(forward.normalized,{orientation:'vertical',boundary:2,rangeStart:0,rangeEnd:2})
  assert.deepEqual(reverse.normalized,forward.normalized)
  assert.equal(forward.valid,true);assertPartition(forward.cells)

  const one=normalized({x:200,y:30},{x:200,y:70})
  assert.deepEqual(one.normalized,{orientation:'vertical',boundary:2,rangeStart:0,rangeEnd:1})
  assert.equal(one.valid,true);assertPartition(one.cells)
  assert.deepEqual(normalized({x:200,y:101},{x:200,y:150}).normalized,{orientation:'vertical',boundary:2,rangeStart:1,rangeEnd:2})
  assert.deepEqual(normalized({x:200,y:150},{x:200,y:201}).normalized,{orientation:'vertical',boundary:2,rangeStart:1,rangeEnd:3})

  const columns=Array.from({length:4},(_,col)=>({id:`col-${col}`,col,row:0,colSpan:1,rowSpan:4,moduleId:'empty'}))
  assert.deepEqual(normalized({x:50,y:200},{x:150,y:200},columns).normalized,{orientation:'horizontal',boundary:2,rangeStart:0,rangeEnd:2})
  assert.deepEqual(normalized({x:70,y:200},{x:30,y:200},columns).normalized,{orientation:'horizontal',boundary:2,rangeStart:0,rangeEnd:1})
})

test('divider preview and commit share touched coverage for draw and erase',()=>{
  const rows=Array.from({length:4},(_,row)=>({id:`row-${row}`,col:0,row,colSpan:4,rowSpan:1,moduleId:'empty'}))
  const start={x:200,y:50},end={x:200,y:150}
  const preview=previewDividerStroke(rows,{start,end},viewport),committed=finalizeDividerStroke(rows,start,end,viewport)
  assert.deepEqual(committed.normalized,preview.normalized);assert.deepEqual(committed.cells,preview.cells)
  assert.equal(preview.intent,'draw');assert.equal(validateLayout(preview.cells),true)
  const erased=finalizeDividerStroke(preview.cells,start,end,viewport)
  assert.equal(erased.intent,'erase');assert.deepEqual(erased.normalized,preview.normalized)
  assert.equal(erased.valid,true);assert.equal(validateLayout(erased.cells),true)
})

test('divider overshoot clamps at every viewport edge in either direction',()=>{
  const cases=[
    [{x:200,y:100},{x:200,y:900},{orientation:'vertical',boundary:2,rangeStart:1,rangeEnd:4}],
    [{x:200,y:300},{x:200,y:-900},{orientation:'vertical',boundary:2,rangeStart:0,rangeEnd:3}],
    [{x:100,y:200},{x:900,y:200},{orientation:'horizontal',boundary:2,rangeStart:1,rangeEnd:4}],
    [{x:300,y:200},{x:-900,y:200},{orientation:'horizontal',boundary:2,rangeStart:0,rangeEnd:3}],
  ]
  for(const [start,end,normalized] of cases){
    const clamped=clampPointToViewport(end,viewport),preview=previewDividerStroke(initialLayout(),{start,end:clamped},viewport),commit=finalizeDividerStroke(initialLayout(),start,end,viewport)
    assert.deepEqual(commit.normalized,normalized);assert.deepEqual(preview.normalized,commit.normalized);assert.deepEqual(preview.cells,commit.cells);assert.equal(commit.valid,true)
    const reverse=finalizeDividerStroke(initialLayout(),clamped,start,viewport,resolveDividerStrokeLock({start,end:clamped},viewport));assert.deepEqual(reverse.normalized,normalized);assert.deepEqual(geometry(reverse.cells),geometry(commit.cells))
  }
})

test('a locked V2 stays on V2 when its raw endpoint is far outside',()=>{
  const lock={orientation:'vertical',boundary:2},result=finalizeDividerStroke(initialLayout(),{x:200,y:100},{x:5000,y:5000},viewport,lock)
  assert.equal(result.valid,true);assert.deepEqual(result.normalized,{orientation:'vertical',boundary:2,rangeStart:1,rangeEnd:4})
})

test('smart completion matches all seven real-user blank-canvas gestures',()=>{
  const p=(col,row)=>({x:col*100,y:row*100}),draw=(start,end)=>finalizeDividerStroke(initialLayout(),start,end,viewport)
  const cases=[
    [p(2,2),p(2,4),[[0,0,4,2],[0,2,2,2],[2,2,2,2]]],
    [p(1,0),p(1,1),[[0,0,1,1],[1,0,3,1],[0,1,4,3]]],
    [p(0,1),p(2,1),[[0,0,2,1],[2,0,2,1],[0,1,4,3]]],
    [p(3,0),p(3,3),[[0,0,3,3],[3,0,1,3],[0,3,4,1]]],
    [p(2,0),p(2,3),[[0,0,2,3],[2,0,2,3],[0,3,4,1]]],
    [p(1,1),p(1,4),[[0,0,4,1],[0,1,1,3],[1,1,3,3]]],
    [p(2,0),p(2,1),[[0,0,2,1],[2,0,2,1],[0,1,4,3]]],
  ]
  for(const [start,end,expected] of cases){const result=draw(start,end);assert.equal(result.valid,true);assert.deepEqual(result.cells.map(({col,row,colSpan,rowSpan})=>[col,row,colSpan,rowSpan]),expected);assertPartition(result.cells);assert.deepEqual(geometry(draw(end,start).cells),geometry(result.cells))}
})

test('direct crossings preserve every perpendicular divider and create intersections',()=>{
  const p=(col,row)=>({x:col*100,y:row*100}),draw=(cells,start,end)=>finalizeDividerStroke(cells,start,end,viewport)
  const horizontal=draw(initialLayout(),p(0,2),p(4,2)).cells
  const verticalCross=draw(horizontal,p(2,0),p(2,4));assert.deepEqual(verticalCross.cells.map(({col,row,colSpan,rowSpan})=>[col,row,colSpan,rowSpan]),[[0,0,2,2],[2,0,2,2],[0,2,2,2],[2,2,2,2]]);assertPartition(verticalCross.cells)
  const vertical=draw(initialLayout(),p(2,0),p(2,4)).cells
  const horizontalCross=draw(vertical,p(0,2),p(4,2));assert.deepEqual(geometry(horizontalCross.cells),geometry(verticalCross.cells));assertPartition(horizontalCross.cells)
  const t=draw(horizontal,p(2,0),p(2,2));assert.deepEqual(t.cells.map(({col,row,colSpan,rowSpan})=>[col,row,colSpan,rowSpan]),[[0,0,2,2],[2,0,2,2],[0,2,4,2]]);assertPartition(t.cells)
  const bands=draw(draw(horizontal,p(0,1),p(4,1)).cells,p(0,3),p(4,3)).cells
  const multiple=draw(bands,p(2,0),p(2,4));assert.equal(internalDividerSegments(multiple.cells).filter(s=>s.axis==='horizontal').length,3);assert.equal(multiple.cells.length,8);assertPartition(multiple.cells)
  assert.deepEqual(geometry(draw(bands,p(2,4),p(2,0)).cells),geometry(multiple.cells))
})

test('drawing V1 through horizontal bands preserves the bands',()=>{
  const p=(col,row)=>({x:col*100,y:row*100}),draw=(cells,start,end)=>finalizeDividerStroke(cells,start,end,viewport)
  const bands=draw(draw(initialLayout(),p(0,1),p(4,1)).cells,p(0,2),p(4,2)).cells
  const result=draw(bands,p(1,0),p(1,4))
  assert.equal(result.intent,'draw');assert.deepEqual(result.cells.map(({col,row,colSpan,rowSpan})=>[col,row,colSpan,rowSpan]),[[0,0,1,1],[1,0,3,1],[0,1,1,1],[1,1,3,1],[0,2,1,2],[1,2,3,2]]);assertPartition(result.cells)
})

test('tracing a spine erases only collinear units and preserves crossed dividers',()=>{
  const p=(col,row)=>({x:col*100,y:row*100}),draw=(cells,start,end)=>finalizeDividerStroke(cells,start,end,viewport)
  const bands=draw(draw(initialLayout(),p(0,1),p(4,1)).cells,p(0,2),p(4,2)).cells
  const gridded=draw(bands,p(1,0),p(1,4)).cells
  const erased=draw(gridded,p(1,0),p(1,4))
  assert.equal(erased.intent,'erase');assert.deepEqual(geometry(erased.cells),geometry(bands));assertPartition(erased.cells)

  const h2=draw(initialLayout(),p(0,2),p(4,2)).cells
  const v2=draw(h2,p(2,0),p(2,4)).cells
  const partial=draw(v2,p(2,2),p(2,4))
  assert.equal(partial.intent,'erase');assert.deepEqual(partial.cells.map(({col,row,colSpan,rowSpan})=>[col,row,colSpan,rowSpan]),[[0,0,2,2],[2,0,2,2],[0,2,4,2]]);assertPartition(partial.cells)
})

test('completion is recursive and additive across existing dividers',()=>{
  const p=(col,row)=>({x:col*100,y:row*100}),draw=(cells,start,end)=>finalizeDividerStroke(cells,start,end,viewport)
  const columns=draw(initialLayout(),p(1,0),p(1,4)).cells
  const rightBand=draw(columns,p(1,1),p(3,1));assert.equal(rightBand.valid,true);assert.ok(rightBand.cells.some(c=>c.col===0&&c.row===0&&c.colSpan===1&&c.rowSpan===4));assertPartition(rightBand.cells)
  const existingVertical=draw(initialLayout(),p(3,0),p(3,4)).cells
  const inferredCrossing=draw(existingVertical,p(0,1),p(2,1));assert.equal(inferredCrossing.valid,true);assert.ok(internalDividerSegments(inferredCrossing.cells).some(s=>s.axis==='vertical'&&s.boundary===3&&s.from===0&&s.to===4));assertPartition(inferredCrossing.cells)
})

test('divider gesture locks preserve initial orientation and boundary through wobble',()=>{
  const lock={orientation:'vertical',boundary:2},rows=Array.from({length:4},(_,row)=>({id:`row-${row}`,col:0,row,colSpan:4,rowSpan:1,moduleId:'empty'}))
  const preview=previewDividerStroke(rows,{start:{x:200,y:20},end:{x:310,y:70},lock},viewport)
  assert.deepEqual(preview.normalized,{orientation:'vertical',boundary:2,rangeStart:0,rangeEnd:1})
  assert.equal(preview.valid,true);assert.equal(validateLayout(preview.cells),true)
})

test('divider locks reject outer edges while all six internal guides resolve normally',()=>{
  const vertical=y=>({start:{x:y,y:20},end:{x:y,y:180}}),horizontal=y=>({start:{x:20,y},end:{x:180,y}})
  for(const stroke of [vertical(10),vertical(390),horizontal(10),horizontal(390)]){
    assert.equal(resolveDividerStrokeLock(stroke,viewport),undefined)
    const before=initialLayout(),result=previewDividerStroke(before,stroke,viewport)
    assert.equal(result.valid,false);assert.equal(result.cells,before)
  }
  for(const boundary of [1,2,3]){
    assert.deepEqual(resolveDividerStrokeLock(vertical(boundary*100),viewport),{orientation:'vertical',boundary})
    assert.deepEqual(resolveDividerStrokeLock(horizontal(boundary*100),viewport),{orientation:'horizontal',boundary})
  }
})

test('forgiving erase still rejects a non-rectangular component unchanged',()=>{
  const horizontal=finalizeDividerStroke(initialLayout(),{x:0,y:200},{x:400,y:200},viewport).cells
  const t=finalizeDividerStroke(horizontal,{x:200,y:200},{x:200,y:400},viewport).cells
  const result=finalizeDividerStroke(t,{x:50,y:200},{x:150,y:200},viewport)
  assert.equal(result.intent,'erase');assert.equal(result.valid,false);assert.equal(result.cells,t);assert.equal(validateLayout(result.cells),true)
})
