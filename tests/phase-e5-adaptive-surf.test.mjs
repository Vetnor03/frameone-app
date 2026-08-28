import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {surfComposition,surfDataNeeds,surfStudioPresets} from '../app/lib/surfResponsive.mjs'
import {supportsPhysicalCustomLayout} from '../app/lib/customLayouts.mjs'

const p=(width,height)=>({width,height,colSpan:1,rowSpan:1,area:1,orientation:width/height>1.12?'landscape':width/height<.88?'portrait':'square'})
const dayparts=surfStudioPresets.normal.dayparts
const daily=surfStudioPresets.normal.daily
const state=(extra={})=>({...surfStudioPresets.normal,...extra})

test('exact adaptive geometries protect current rating, visual, and wave decision',()=>{
 for(const [width,height] of [[776,100],[180,343],[582,257],[582,343],[776,429]]){
  const result=surfComposition(p(width,height),state())
  assert.equal(result.showRatingWord,true);assert.equal(result.showRatingVisual,true);assert.equal(result.showWaveRange,true)
 }
 assert.equal(surfComposition(p(776,100),state()).family,'shallow')
 assert.equal(surfComposition(p(180,343),state()).family,'stack')
 assert.equal(surfComposition(p(380,260),state()).family,'split')
 assert.equal(surfComposition(p(776,429),state()).family,'expanded')
})

test('actual strings and missing values control optional disclosure',()=>{
 const long=surfComposition(p(360,115),state({spot:'An exceptionally long surf spot name that cannot usefully fit',waveHeight:'8.0–12.0 metres breaking wave range'}))
 assert.equal(long.showSpot,false);assert.equal(long.showRatingWord,true);assert.equal(long.showWaveRange,true)
 assert.equal(surfComposition(p(400,260),state({rating:{score:3,max:6,label:'Poor to Fair'}})).showRatingWord,true)
 assert.equal(surfComposition(p(400,260),state({period:null,windSpeed:null})).showDetails,false)
})

test('experience dice and normal blocks remain distinct policy inputs',()=>{
 const normal=surfComposition(p(300,120),state({rating:{score:4,max:6,label:'Fair'}}))
 const dice=surfComposition(p(300,120),state({rating:{score:4,max:6,label:'Fair',fromExperience:true}}))
 assert.equal(normal.showRatingVisual,true);assert.equal(dice.showRatingVisual,true)
 // Dice need less horizontal space, so content-aware selection may retain more context.
 assert.ok(Number(dice.showSpot)>=Number(normal.showSpot))
})

test('data needs and 1/2/4 daypart plus pixel-derived daily capacities are progressive',()=>{
 assert.deepEqual(surfDataNeeds(190,110),{dayparts:false,daily:false})
 assert.deepEqual(surfDataNeeds(582,257),{dayparts:true,daily:false})
 assert.deepEqual(surfDataNeeds(776,429),{dayparts:true,daily:true})
 const one=surfComposition(p(582,257),state({dayparts:dayparts.slice(0,1),daily:[]}))
 const two=surfComposition(p(776,343),state({dayparts:dayparts.slice(0,2),daily:[]}))
 const four=surfComposition(p(500,600),state({dayparts,daily:[]}))
 assert.equal(one.daypartCount,1);assert.equal(two.daypartCount,2);assert.equal(four.daypartCount,4)
 const narrower=surfComposition(p(560,430),state({daily:Array(5).fill(daily[0])}))
 const wider=surfComposition(p(776,429),state({daily:Array(5).fill(daily[0])}))
 assert.ok(wider.dailyCount>narrower.dailyCount);assert.ok(wider.dailyCount>=2)
 assert.equal(surfComposition(p(776,429),state({dayparts:[],daily:[]})).daypartCount,0)
})

test("Today's Best remains usable without displacing primary content",()=>{
 const compact=surfComposition(p(240,220),state({bestWindow:{label:"TODAY'S BEST",time:null}}))
 assert.equal(compact.showRatingWord,true);assert.equal(compact.showWaveRange,true)
})

test('executable firmware policy has field-for-field Studio parity',async()=>{
 const cases=[
  [776,100,state()],[180,343,state()],[582,257,state()],[582,343,state()],[776,429,state()],
  [360,115,state({spot:'An exceptionally long surf spot name that cannot usefully fit'})],
  [400,260,state({rating:{score:3,max:6,label:'Poor to Fair'}})],
  [300,120,state({rating:{score:4,max:6,label:'Fair',fromExperience:true}})],
  [400,260,state({period:null,windSpeed:null})],[582,257,state({dayparts:dayparts.slice(0,1),daily:[]})],
  [776,343,state({dayparts:dayparts.slice(0,2),daily:[]})],[500,600,state({dayparts,daily:[]})],
  [560,430,state({daily:Array(5).fill(daily[0])})],[776,429,state({daily:Array(5).fill(daily[0])})],
  [776,429,state({dayparts:[],daily:[]})],[240,220,state({bestWindow:{label:"TODAY'S BEST"}})],
 ]
 const q=v=>JSON.stringify(v??'')
 const declarations=cases.map(([w,h,s])=>`{${w},${h},${q(s.spot)},${q(s.rating.label)},${q(s.waveHeight)},${q(s.period)},${q(s.windSpeed)},${s.rating.score!=null},${Boolean(s.rating.fromExperience)},${Boolean(s.trend)},${Boolean(s.bestWindow)},${s.dayparts?.length??0},${(s.daily??s.forecast)?.length??0}}`)
 const source=`#include <iostream>\n#include "SurfAdaptivePolicy.h"\nusing namespace SurfAdaptivePolicy;\nint main(){const Input cases[]={${declarations.join(',')}};for(const auto& in:cases){const Result r=compose(in);std::cout<<int(r.family)<<','<<r.showSpot<<','<<r.showRatingWord<<','<<r.showRatingVisual<<','<<r.showWaveRange<<','<<r.showDetails<<','<<r.daypartCount<<','<<r.dailyCount<<','<<r.showTrend<<','<<r.splitPercent<<','<<r.requestedDataNeeds.dayparts<<','<<r.requestedDataNeeds.daily<<'\\n';}}`
 const directory=await mkdtemp(join(tmpdir(),'surf-policy-')),cpp=join(directory,'policy.cpp'),binary=join(directory,'policy')
 await writeFile(cpp,source)
 execFileSync('g++',['-std=gnu++11','-Wall','-Wextra','-Werror','-I',new URL('../frame/src/modules/',import.meta.url).pathname,cpp,'-o',binary])
 const firmware=execFileSync(binary,{encoding:'utf8'}).trim().split('\n').map(line=>line.split(',').map(Number))
 const families={shallow:0,stack:1,split:2,dayparts:3,expanded:4}
 const studio=cases.map(([w,h,s])=>{const r=surfComposition(p(w,h),s);return [families[r.family],+r.showSpot,+r.showRatingWord,+r.showRatingVisual,+r.showWaveRange,+r.showDetails,r.daypartCount,r.dailyCount,+r.showTrend,r.splitPercent,+r.requestedDataNeeds.dayparts,+r.requestedDataNeeds.daily]})
 assert.deepEqual(firmware,studio)
})

test('adaptive fetching is explicit while all legacy needs remain frozen',async()=>{
 const renderer=await readFile(new URL('../frame/src/modules/ModuleSurf.cpp',import.meta.url),'utf8')
 assert.match(renderer,/legacyDataNeeds[\s\S]*CELL_MEDIUM \|\| wantSize == CELL_LARGE[\s\S]*wantSize == CELL_XL/)
 assert.match(renderer,/c\.size == CELL_ADAPTIVE[\s\S]*SurfAdaptivePolicy::dataNeeds\(c\.w, c\.h\)/)
 assert.match(renderer,/if \(c\.size == CELL_ADAPTIVE\)[\s\S]*renderAdaptiveSurf/)
 assert.doesNotMatch(renderer,/tick\(idx, c\.size\)/)
})

test('physical capability accepts exact Surf instances and rejects lookalikes',async()=>{
 const cells=module=>[{slot:0,col:0,row:0,colSpan:1,rowSpan:4,module},{slot:1,col:1,row:0,colSpan:3,rowSpan:4,module:'date'}]
 for(const module of ['surf','surf:1','surf:spot-id'])assert.equal(supportsPhysicalCustomLayout(cells(module)).valid,true)
 for(const module of ['surffoo','surfs'])assert.equal(supportsPhysicalCustomLayout(cells(module)).valid,false)
 const directory=await mkdtemp(join(tmpdir(),'surf-capability-')),cpp=join(directory,'cap.cpp'),binary=join(directory,'cap')
 await writeFile(cpp,'#include <iostream>\n#include "AdaptiveModuleCapability.h"\nint main(){const char* v[]={"surf","surf:1","surf:spot-id","surffoo","surfs"};for(const char* s:v)std::cout<<AdaptiveModuleCapability::supports(s)<<"\\n";}')
 execFileSync('g++',['-std=gnu++11','-Wall','-Wextra','-Werror','-I',new URL('../frame/src/modules/',import.meta.url).pathname,cpp,'-o',binary])
 assert.deepEqual(execFileSync(binary,{encoding:'utf8'}).trim().split('\n').map(Number),[1,1,1,0,0])
})
