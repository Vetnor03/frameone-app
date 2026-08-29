import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {soccerComposition,soccerStudioPresets,soccerTableWindow} from '../app/lib/soccerResponsive.mjs'
import {supportsPhysicalCustomLayout} from '../app/lib/customLayouts.mjs'

const profile=(width,height)=>({width,height,orientation:width>height?'landscape':'portrait'})

test('arbitrary pixels select every adaptive Soccer composition family',()=>{
 const cases=[[196,114,'micro'],[776,114,'fixture-strip'],[196,343,'fixture-stack'],[392,229,'fixture-history'],[589,343,'fixture-standings'],[392,458,'expanded']]
 for(const [w,h,family] of cases)assert.equal(soccerComposition(profile(w,h),soccerStudioPresets.normal).family,family)
 assert.equal(soccerComposition(profile(392,458),soccerStudioPresets.empty).family,'empty')
})

test('progressive disclosure preserves previous-only, standing-only, populated and empty states',()=>{
 const previous={...soccerStudioPresets.empty,previousFixture:soccerStudioPresets.normal.previousFixture}
 const standing={...soccerStudioPresets.empty,position:12,points:34}
 assert.equal(soccerComposition(profile(392,229),previous).primaryState,'previous')
 assert.equal(soccerComposition(profile(196,343),standing).primaryState,'standing')
 assert.equal(soccerComposition(profile(196,343),standing).showStanding,true)
 const table=soccerComposition(profile(589,343),soccerStudioPresets.extreme)
 assert.equal(table.showTable,true);assert.equal(table.tableColumns.length,4);assert.ok(table.tableRows>=3)
 assert.equal(soccerComposition(profile(196,114),soccerStudioPresets.empty).available,false)
})

test('long names abbreviate deterministically and selected table windows center or clamp',()=>{
 const top=soccerStudioPresets.normal.table.map((row,i)=>({...row,selected:i===0}))
 const middle=soccerStudioPresets.long.table.map((row,i)=>({...row,selected:i===5}))
 const bottom=soccerStudioPresets.long.table.map((row,i)=>({...row,selected:i===9}))
 assert.equal(soccerTableWindow(top,5)[0].position,1)
 assert.equal(soccerTableWindow(middle,5)[2].position,6)
 assert.equal(soccerTableWindow(bottom,5).at(-1).position,10)
 assert.equal(soccerStudioPresets.extreme.nextFixture.homeTeam,'Borussia Mönchengladbach')
})

test('Studio and host C++ Soccer policy agree field-for-field',async()=>{
 const states=[soccerStudioPresets.normal,soccerStudioPresets.extreme,
  {...soccerStudioPresets.empty,previousFixture:soccerStudioPresets.normal.previousFixture},
  {...soccerStudioPresets.empty,position:8,points:42},soccerStudioPresets.empty]
 const geometries=[[196,114],[776,114],[196,343],[392,229],[589,343],[392,458],[785,458]]
 const cases=geometries.flatMap(([w,h])=>states.map(state=>[w,h,state]))
 const detailCount=s=>[s.competitionName,s.record,s.form,s.topScorer].filter(Boolean).length
 const input=([w,h,s])=>`{${w},${h},${w>h},${!!s.nextFixture},${!!s.previousFixture},${s.position!=null||s.points!=null},${s.table?.length??0},${detailCount(s)}}`
 const source=`#include <iostream>\n#include "SoccerAdaptivePolicy.h"\nusing namespace SoccerAdaptivePolicy;\nint main(){const Input v[]={${cases.map(input).join(',')}};for(const auto&i:v){Result r=compose(i);std::cout<<int(r.family)<<','<<r.available<<','<<int(r.primaryState)<<','<<r.showPrevious<<','<<r.showStanding<<','<<r.showTable<<','<<int(r.tableColumns)<<','<<r.tableRows<<','<<r.showDetails<<','<<r.detailRows<<'\\n';}}`
 const dir=await mkdtemp(join(tmpdir(),'soccer-policy-')),cpp=join(dir,'policy.cpp'),bin=join(dir,'policy')
 await writeFile(cpp,source)
 execFileSync('g++',['-std=gnu++11','-Wall','-Wextra','-Werror','-I',new URL('../frame/src/modules/',import.meta.url).pathname,cpp,'-o',bin])
 const actual=execFileSync(bin,{encoding:'utf8'}).trim().split('\n').map(line=>line.split(',').map(Number))
 const families={micro:0,'fixture-strip':1,'fixture-stack':2,'fixture-history':3,'fixture-standings':4,expanded:5,empty:6}
 const primary={next:0,previous:1,standing:2,empty:3}
 const expected=cases.map(([w,h,s])=>{const r=soccerComposition(profile(w,h),s);return [families[r.family],+r.available,primary[r.primaryState],+r.showPrevious,+r.showStanding,+r.showTable,r.tableColumns.length,r.tableRows,+r.showDetails,r.detailRows]})
 assert.deepEqual(actual,expected)
})

test('physical Soccer instances are exact and custom preflight stays atomic',async()=>{
 const cells=module=>[{slot:0,col:0,row:0,colSpan:1,rowSpan:3,module},{slot:1,col:1,row:0,colSpan:3,rowSpan:3,module:'date'},{slot:2,col:0,row:3,colSpan:4,rowSpan:1,module:'date'}]
 for(const module of ['soccer','soccer:1','soccer:255'])assert.equal(supportsPhysicalCustomLayout(cells(module)).valid,true)
 for(const module of ['soccer:0','soccer:club','soccerfoo','soccers'])assert.equal(supportsPhysicalCustomLayout(cells(module)).valid,false)
 const capability=await readFile(new URL('../frame/src/modules/AdaptiveModuleCapability.h',import.meta.url),'utf8')
 assert.match(capability,/numericInstance\(module, "soccer"\)/)
 const layout=await readFile(new URL('../frame/src/core/Layout.cpp',import.meta.url),'utf8')
 assert.match(layout,/!ModuleRenderer::canRenderCell\(module, cell\)\) return false/)
})

test('legacy Soccer renderers remain distinct and adaptive dispatch is additive',async()=>{
 const source=await readFile(new URL('../frame/src/modules/ModuleSoccer.cpp',import.meta.url),'utf8')
 for(const [size,renderer] of [['CELL_SMALL','renderSmall'],['CELL_MEDIUM','renderMedium'],['CELL_LARGE','renderLarge'],['CELL_XL','renderXL']])
  assert.match(source,new RegExp(`c\\.size == ${size}\\)\\s+${renderer}\\(c, cfg, data\\)`))
 assert.match(source,/c\.size == CELL_ADAPTIVE\) renderAdaptive\(c, cfg, data\)/)
 const adaptive=source.slice(source.indexOf('// BEGIN ADAPTIVE SOCCER RENDERER'),source.indexOf('// END ADAPTIVE SOCCER RENDERER'))
 assert.doesNotMatch(adaptive,/static\s+[^\n;]+\[[1-9]\d+/)
 assert.match(adaptive,/getTableWindow\(data, rowsWanted/)
})
