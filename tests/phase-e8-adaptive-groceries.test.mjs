import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {groceriesComposition,groceriesStudioPresets,fitGroceryText,fitMealIdeaText,fitRunningLowText,selectGroceryItems} from '../app/lib/groceriesResponsive.mjs'
import {supportsPhysicalCustomLayout} from '../app/lib/customLayouts.mjs'

const profile=(width,height)=>({width,height,orientation:width>height?'landscape':'portrait'})

test('actual pixels reach every family and preserve family boundaries',()=>{
 const cases=[[100,100,'micro'],[229,149,'micro'],[230,149,'item-strip'],[300,164,'item-strip'],[229,165,'list-stack'],[269,300,'list-stack'],[270,300,'list-columns'],[359,389,'list-columns'],[360,390,'expanded'],[479,200,'list-columns'],[480,190,'list-menu'],[619,300,'list-menu'],[620,300,'expanded']]
 for(const [w,h,family] of cases)assert.equal(groceriesComposition(profile(w,h),groceriesStudioPresets.normal).family,family,`${w}x${h}`)
 assert.equal(groceriesComposition(profile(400,300),groceriesStudioPresets.empty).family,'empty')
 assert.equal(groceriesComposition(profile(400,300),{...groceriesStudioPresets.empty,status:'failed'}).failed,true)
})

test('Studio and allocation-free GNU C++11 policy agree',async()=>{
 const base=groceriesStudioPresets.normal
 const states=[base,groceriesStudioPresets.long,groceriesStudioPresets.extreme,groceriesStudioPresets.empty,{...base,status:'failed'},
  {...base,items:base.items.slice(0,1),dinners:[]},{...base,items:[],dinners:base.dinners.slice(0,1),runningLow:[],mealIdeas:[]},
  {...base,dinners:base.dinners.slice(0,2)},{...base,runningLow:[]},{...base,mealIdeas:[]}]
 const geometries=[[100,100],[229,149],[230,149],[300,164],[229,165],[269,300],[270,300],[359,389],[360,390],[479,200],[480,189],[480,190],[499,300],[500,300],[619,300],[620,300],[800,458]]
 const cases=geometries.flatMap(([w,h])=>states.map(s=>[w,h,s]))
 const data=([w,h,s])=>{const today=s.dinners.find(d=>d.date===s.todayDate),future=s.dinners.filter(d=>d.date>s.todayDate);return `{${w},${h},${s.status==='failed'},${s.items.length},${s.dinners.length},${future.length},${!!today},${s.runningLow.length},${s.mealIdeas.length}}`}
 const source=`#include <iostream>\n#include "GroceriesAdaptivePolicy.h"\nusing namespace GroceriesAdaptivePolicy;\nint main(){const Input v[]={${cases.map(data).join(',')}};for(const auto&i:v){Result r=compose(i);std::cout<<int(r.family)<<','<<r.failed<<','<<r.horizontal<<','<<int(r.columns)<<','<<r.showMenu<<','<<r.showRunningLow<<','<<r.showMealIdeas<<','<<r.todayIsHeading<<'\\n';}}`
 const dir=await mkdtemp(join(tmpdir(),'groceries-policy-')),cpp=join(dir,'policy.cpp'),bin=join(dir,'policy');await writeFile(cpp,source)
 execFileSync('g++',['-std=gnu++11','-Wall','-Wextra','-Werror','-I',new URL('../frame/src/modules/',import.meta.url).pathname,cpp,'-o',bin])
 const actual=execFileSync(bin,{encoding:'utf8'}).trim().split('\n').map(line=>line.split(',').map(Number))
 const families={empty:0,micro:1,'item-strip':2,'list-stack':3,'list-columns':4,'list-menu':5,expanded:6}
 const expected=cases.map(([w,h,s])=>{const r=groceriesComposition(profile(w,h),s);return [families[r.family],+r.failed,+r.horizontal,r.columns,+r.showMenu,+r.showRunningLow,+r.showMealIdeas,+(!!r.todayDinner&&!r.showMenu)]})
 assert.deepEqual(actual,expected)
})

test('disclosure, rotation, quantities and extreme strings degrade safely',()=>{
 const base=groceriesStudioPresets.normal
 assert.equal(groceriesComposition(profile(800,458),{...base,dinners:base.dinners.slice(0,2)}).showMenu,false)
 assert.equal(groceriesComposition(profile(800,458),base).showMenu,true)
 assert.equal(groceriesComposition(profile(400,458),base).columns,1)
 assert.equal(groceriesComposition(profile(400,300),base).columns,2)
 assert.equal(selectGroceryItems({...base,rotationOffset:2},2)[0].name,'Apples')
 assert.equal(fitGroceryText({name:'Milk',quantity:2},200,(s)=>s.length*8).text,'2x Milk')
 assert.equal(fitGroceryText({name:'A'.repeat(200),quantity:12},60,(s)=>s.length*8).truncated,true)
 assert.equal(fitRunningLowText({name:'A'.repeat(100),label:'B'.repeat(100)},80,s=>s.length*8).labelShown,false)
 assert.equal(fitMealIdeaText({name:'A'.repeat(100),missing:[]},80,s=>s.length*8).missingShown,0)
})

test('exact groceries capability and atomic custom-layout preflight',async()=>{
 const cells=module=>[{slot:0,col:0,row:0,colSpan:1,rowSpan:3,module},{slot:1,col:1,row:0,colSpan:3,rowSpan:3,module:'date'},{slot:2,col:0,row:3,colSpan:4,rowSpan:1,module:'date'}]
 assert.equal(supportsPhysicalCustomLayout(cells('groceries')).valid,true)
 for(const name of ['groceries:1','groceriesfoo','groceries:','groceries::1'])assert.equal(supportsPhysicalCustomLayout(cells(name)).valid,false)
 const bad=cells('groceries:1'),result=supportsPhysicalCustomLayout(bad);assert.deepEqual(result.unsupportedSlots,[0]);assert.equal(result.valid,false)
 const capability=await readFile(new URL('../frame/src/modules/AdaptiveModuleCapability.h',import.meta.url),'utf8');assert.match(capability,/exactOnly\(module, "groceries"\)/)
})

test('adaptive dispatch is additive and fixed renderers remain protected',async()=>{
 const firmware=await readFile(new URL('../frame/src/modules/ModuleGroceries.cpp',import.meta.url),'utf8')
 assert.match(firmware,/if \(c\.size == CELL_ADAPTIVE\)[\s\S]{0,100}renderAdaptiveGroceries\(c\)/)
 for(const name of ['renderSmall','renderMedium','renderLarge','renderXL'])assert.match(firmware,new RegExp(`static void ${name}\\(`))
 assert.match(firmware,/BEGIN ADAPTIVE GROCERIES RENDERER[\s\S]*END ADAPTIVE GROCERIES RENDERER/)
 assert.equal((firmware.match(/static GroceryCache g_cache;/g)||[]).length,1)
 const adaptive=firmware.slice(firmware.indexOf('// BEGIN ADAPTIVE GROCERIES RENDERER'),firmware.indexOf('// END ADAPTIVE GROCERIES RENDERER'))
 assert.match(adaptive,/static void adaptiveHeading[\s\S]*FONT_B12/)
 assert.doesNotMatch(adaptive,/adaptiveHeading[\s\S]{0,500}fillRect/)
 assert.match(adaptive,/adaptiveCenteredLine\(x, y, width, raw, FONT_B12\)/)
 assert.match(adaptive,/adaptiveCenteredLine\(innerX,[\s\S]*more, FONT_B9\)/)
 assert.match(adaptive,/char quantity\[16\][\s\S]*textWidth\(quantity[\s\S]*item\.name/)
 assert.match(adaptive,/runningLowMode\([\s\S]*RUNNING_FULL \? full : g_cache\.runningLow\[i\]\.name/)
 assert.match(adaptive,/mealMissingCount\([\s\S]*missing == 2 \? two : \(missing == 1 \? one : g_cache\.recipes\[i\]\.name\)/)
 assert.match(adaptive,/family == GroceriesAdaptivePolicy::EMPTY[\s\S]*adaptiveHeading[\s\S]*adaptiveCenteredLine/)
})

test('host policy helpers enforce optional-fact disclosure order',async()=>{
 const source='#include "GroceriesAdaptivePolicy.h"\nusing namespace GroceriesAdaptivePolicy;\nint main(){if(runningLowMode(true,true)!=RUNNING_FULL)return 1;if(runningLowMode(false,true)!=RUNNING_NAME)return 2;if(runningLowMode(false,false)!=RUNNING_TRUNCATED_NAME)return 3;if(mealMissingCount(true,true)!=2)return 4;if(mealMissingCount(false,true)!=1)return 5;if(mealMissingCount(false,false)!=0)return 6;return 0;}'
 const dir=await mkdtemp(join(tmpdir(),'groceries-semantics-')),cpp=join(dir,'semantics.cpp'),bin=join(dir,'semantics');await writeFile(cpp,source)
 execFileSync('g++',['-std=gnu++11','-Wall','-Wextra','-Werror','-I',new URL('../frame/src/modules/',import.meta.url).pathname,cpp,'-o',bin]);execFileSync(bin)
})
