import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {surfComposition,surfLayout,surfStudioPresets} from '../app/lib/surfResponsive.mjs'
import {supportsPhysicalCustomLayout} from '../app/lib/customLayouts.mjs'

const profile=(width,height)=>({width,height,colSpan:1,rowSpan:1,area:1,orientation:width>height?'landscape':'portrait'})
const state=(extra={})=>({...surfStudioPresets.normal,dayparts:surfStudioPresets.normal.forecast,daily:surfStudioPresets.normal.forecast,trend:'up',...extra})

test('exact geometry selects useful shallow, stacked, split, daypart, and daily families',()=>{
 assert.equal(surfComposition(profile(776,114),state()).family,'shallow-wide')
 assert.equal(surfComposition(profile(196,343),state()).family,'stacked')
 assert.equal(surfComposition(profile(589,229),state()).family,'split')
 assert.equal(surfComposition(profile(589,343),state()).family,'daypart-enhanced')
 assert.equal(surfComposition(profile(785,458),state()).family,'expanded-daily')
})

test('content widths protect primary facts and preserve rating visual semantics',()=>{
 const long=surfComposition(profile(360,120),state({spot:'A very long spot name that cannot fit',waveHeight:'8.0–12.0 metres',rating:{score:3,max:6,label:'Poor to Fair'}}))
 assert.equal(long.showSpot,false);assert.equal(long.showWaveRange,true);assert.equal(long.showRatingVisual,true)
 const normal=surfComposition(profile(589,229),state({ratingFromExperience:false}))
 const dice=surfComposition(profile(589,229),state({ratingFromExperience:true}))
 assert.equal(normal.showRatingVisual,true);assert.equal(dice.showRatingVisual,true)
})

test('details, directions, trend, and missing measurements disclose honestly',()=>{
 const split=surfComposition(profile(589,229),state())
 assert.equal(split.showDetails,true);assert.equal(split.showDirections,true);assert.equal(split.showTrend,true)
 const missing=surfComposition(profile(589,229),state({period:null,windSpeed:null,swellDirection:null,windDirection:null}))
 assert.equal(missing.showDetails,false);assert.equal(missing.showDirections,false)
})

test('daypart and daily capacities are pixel-derived and chronological counts are bounded',()=>{
 const none=surfComposition(profile(589,343),state({dayparts:[],forecast:[]}))
 const one=surfComposition(profile(589,343),state({dayparts:[{}],forecast:[]}))
 const two=surfComposition(profile(589,343),state({dayparts:[{},{}],forecast:[]}))
 const four=surfComposition(profile(785,458),state({dayparts:[{},{},{},{}],daily:[{},{},{},{}],forecast:[]}))
 assert.equal(none.daypartCount,0);assert.equal(one.daypartCount,1);assert.equal(two.daypartCount,2);assert.equal(four.daypartCount,2)
 assert.equal(four.dailyCount,4)
 const five=state({daily:[{},{},{},{},{}]})
 assert.ok(surfComposition(profile(520,410),five).dailyCount<surfComposition(profile(785,458),five).dailyCount)
})

test("Today's Best uses compact and spacious labels without displacing primary content",()=>{
 const compact=surfComposition(profile(392,160),state())
 const spacious=surfComposition(profile(589,343),state())
 assert.equal(compact.todaysBestLabelMode,'compact');assert.equal(spacious.todaysBestLabelMode,'spacious')
 assert.equal(compact.showWaveRange,true);assert.equal(compact.showRatingVisual,true)
})

test('geometry drives allocation-free network needs',()=>{
 assert.deepEqual(surfComposition(profile(196,114),state()).requestedDataNeeds,{dayparts:false,daily:false})
 assert.deepEqual(surfComposition(profile(589,229),state()).requestedDataNeeds,{dayparts:true,daily:false})
 assert.deepEqual(surfComposition(profile(785,458),state()).requestedDataNeeds,{dayparts:true,daily:true})
})

test('Studio and executable GNU C++11 policy agree field-for-field',async()=>{
 const cases=[[776,114,state()],[196,343,state()],[589,229,state()],[589,343,state()],[785,458,state()],
  [360,120,state({spot:'Extremely long surf spot name',rating:{score:3,max:6,label:'Poor to Fair'},waveHeight:'8.0–12.0 metres'})],
  [589,229,state({ratingFromExperience:true})],[589,229,state({period:null,windSpeed:null,swellDirection:null,windDirection:null})],
  [589,343,state({dayparts:[{}],forecast:[]})],[589,343,state({dayparts:[{},{}],forecast:[]})]]
 const q=value=>JSON.stringify(value??'')
 const inputs=cases.map(([w,h,s])=>`{${w},${h},${q(s.spot)},${q(s.rating.label)},${q(s.waveHeight)},${!!s.ratingFromExperience},${!!s.period},${!!s.windSpeed},${!!s.swellDirection},${!!s.windDirection},${!!s.trend},${!!s.bestWindow},${s.dayparts?.length??s.forecast?.length??0},${s.daily?.length??s.forecast?.length??0}}`)
 const source=`#include <iostream>\n#include "SurfAdaptivePolicy.h"\nusing namespace SurfAdaptivePolicy;\nint main(){const Input v[]={${inputs.join(',')}};for(const auto&i:v){Result r=compose(i);std::cout<<int(r.family)<<','<<r.showSpot<<','<<r.showRatingWord<<','<<r.showRatingVisual<<','<<r.showWaveRange<<','<<r.showDetails<<','<<r.showDirections<<','<<r.showTrend<<','<<r.showTodaysBestLabel<<','<<int(r.todaysBestLabelMode)<<','<<r.daypartCount<<','<<r.dailyCount<<','<<r.splitPercent<<','<<r.requestedDataNeeds.dayparts<<','<<r.requestedDataNeeds.daily<<'\\n';}}`
 const directory=await mkdtemp(join(tmpdir(),'surf-policy-')),cpp=join(directory,'policy.cpp'),binary=join(directory,'policy')
 await writeFile(cpp,source);execFileSync('g++',['-std=gnu++11','-Wall','-Wextra','-Werror','-I',new URL('../frame/src/modules/',import.meta.url).pathname,cpp,'-o',binary])
 const actual=execFileSync(binary,{encoding:'utf8'}).trim().split('\n').map(line=>line.split(',').map(Number))
 const families={'shallow-wide':0,stacked:1,split:2,'daypart-enhanced':3,'expanded-daily':4},labels={none:0,compact:1,spacious:2}
 const expected=cases.map(([w,h,s])=>{const r=surfComposition(profile(w,h),s);return [families[r.family],+r.showSpot,+r.showRatingWord,+r.showRatingVisual,+r.showWaveRange,+r.showDetails,+r.showDirections,+r.showTrend,+r.showTodaysBestLabel,labels[r.todaysBestLabelMode],r.daypartCount,r.dailyCount,r.splitPercent,+r.requestedDataNeeds.dayparts,+r.requestedDataNeeds.daily]})
 assert.deepEqual(actual,expected)
})

test('physical and app Surf instance contracts accept only numeric 1..255 suffixes',async()=>{
 const cells=module=>[{slot:0,col:0,row:0,colSpan:1,rowSpan:3,module},{slot:1,col:1,row:0,colSpan:3,rowSpan:3,module:'date'},{slot:2,col:0,row:3,colSpan:4,rowSpan:1,module:'date'}]
 for(const module of ['surf','surf:1','surf:255'])assert.equal(supportsPhysicalCustomLayout(cells(module)).valid,true)
 for(const module of ['surf:0','surf:spot-id','surffoo','surfs'])assert.equal(supportsPhysicalCustomLayout(cells(module)).valid,false)
 const dir=await mkdtemp(join(tmpdir(),'surf-capability-')),cpp=join(dir,'c.cpp'),bin=join(dir,'c')
 await writeFile(cpp,'#include <iostream>\n#include "AdaptiveModuleCapability.h"\nint main(){const char*v[]={"surf","surf:1","surf:255","surf:0","surf:spot-id","surffoo","surfs"};for(const char*s:v)std::cout<<AdaptiveModuleCapability::supports(s)<<"\\n";}')
 execFileSync('g++',['-std=gnu++11','-Wall','-Wextra','-Werror','-I',new URL('../frame/src/modules/',import.meta.url).pathname,cpp,'-o',bin])
 assert.deepEqual(execFileSync(bin,{encoding:'utf8'}).trim().split('\n').map(Number),[1,1,1,0,0,0,0])
})

test('firmware keeps legacy dispatch/fetch needs and allocates every disclosed adaptive region',async()=>{
 const source=await readFile(new URL('../frame/src/modules/ModuleSurf.cpp',import.meta.url),'utf8')
 assert.match(source,/needs\.dayparts = size == CELL_MEDIUM \|\| size == CELL_LARGE;/)
 assert.match(source,/needs\.daily = size == CELL_XL;/)
 for(const size of ['CELL_SMALL','CELL_MEDIUM','CELL_LARGE','CELL_XL'])assert.match(source,new RegExp(`if \\(c\\.size == ${size}\\)`))
 const geometry=source.slice(source.indexOf('// BEGIN ADAPTIVE SURF GEOMETRY'),source.indexOf('// END ADAPTIVE SURF GEOMETRY'))
 assert.match(geometry,/SHALLOW_WIDE && comp\.showDetails[\s\S]*details = AdaptiveSurfRect/)
 assert.match(geometry,/STACKED && comp\.showDetails[\s\S]*details = AdaptiveSurfRect/)
 assert.match(geometry,/comp\.daypartCount > 0[\s\S]*dayparts = AdaptiveSurfRect/)
 assert.match(geometry,/comp\.dailyCount > 0[\s\S]*AdaptiveSurfRect daily/)
 assert.match(source,/if \(comp\.showDirections[\s\S]*drawSurfDirectionArrow/)
 assert.match(source,/if \(comp\.showTodaysBestLabel\)[\s\S]*Best next 4hrs/)
})

test('Studio allocates every daypart, daily, and Today’s Best disclosure',()=>{
 const daypartComposition=surfComposition(profile(589,343),state())
 const daypartLayout=surfLayout(profile(589,343),daypartComposition)
 assert.ok(daypartComposition.daypartCount>0);assert.ok(daypartLayout.daypartRect)
 assert.equal(daypartLayout.daypartColumns.length,daypartComposition.daypartCount)
 const dailyComposition=surfComposition(profile(785,458),state())
 const dailyLayout=surfLayout(profile(785,458),dailyComposition)
 assert.ok(dailyComposition.dailyCount>0);assert.ok(dailyLayout.dailyRect)
 assert.equal(dailyLayout.dailyColumns.length,dailyComposition.dailyCount)
 const shallowComposition=surfComposition(profile(776,114),state())
 assert.equal(shallowComposition.showTodaysBestLabel,true)
 assert.ok(surfLayout(profile(776,114),shallowComposition).bestWindowRect)
 const stackedState=state({period:null,windSpeed:null,swellDirection:null,windDirection:null})
 const stackedComposition=surfComposition(profile(196,343),stackedState)
 assert.equal(stackedComposition.showDetails,false);assert.equal(stackedComposition.showTodaysBestLabel,true)
 assert.ok(surfLayout(profile(196,343),stackedComposition).bestWindowRect)
})

test('Studio Surf renders explicit data families and experience dice without stale family names',async()=>{
 const simulator=await readFile(new URL('../app/frame-simulator/FrameSimulator.tsx',import.meta.url),'utf8')
 const responsive=simulator.slice(simulator.indexOf('function drawResponsiveSurf'),simulator.indexOf('function drawSurf'))
 const visuals=simulator.slice(simulator.indexOf('function experienceDice'),simulator.indexOf('function arrowIcon'))
 const policy=await readFile(new URL('../app/lib/surfResponsive.mjs',import.meta.url),'utf8')
 const declaration=await readFile(new URL('../app/lib/surfResponsive.d.mts',import.meta.url),'utf8')
 assert.match(responsive,/state\.dayparts\?\?state\.forecast/)
 assert.match(responsive,/state\.daily\?\?state\.forecast/)
 assert.match(responsive,/layout\.daypartColumns/);assert.match(responsive,/layout\.dailyColumns/)
 assert.match(visuals,/if\(experience\)experienceDice/)
 assert.match(responsive,/ratingFromExperience\|\|state\.rating\.experienceBased/)
 assert.doesNotMatch(responsive,/family\s*===?\s*['"]micro/)
 assert.doesNotMatch(policy,/family\s*===?\s*['"]micro/)
 for(const field of ['dayparts','daily','trend','ratingFromExperience','experienceDiceValue'])assert.match(declaration,new RegExp(`\\b${field}\\b`))
})
