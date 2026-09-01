import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {stockReferenceLine,stocksComposition,stocksStudioPresets} from '../app/lib/stocksResponsive.mjs'
import {supportsPhysicalCustomLayout} from '../app/lib/customLayouts.mjs'

const profile=(width,height)=>({width,height,orientation:width>height?'landscape':'portrait'})

test('actual pixels select every adaptive Stocks family and do not force charts',()=>{
 const cases=[[196,114,'micro'],[776,114,'summary-strip'],[196,343,'summary-stack'],[392,229,'chart-summary'],[392,343,'chart-summary'],[654,343,'detail-chart'],[392,458,'expanded'],[785,458,'detail-chart']]
 for(const [w,h,family] of cases)assert.equal(stocksComposition(profile(w,h),stocksStudioPresets.normal).family,family)
 assert.equal(stocksComposition(profile(392,458),stocksStudioPresets.empty).family,'empty')
 assert.equal(stocksComposition(profile(196,343),stocksStudioPresets.normal).showChart,false)
})

test('series, signs, baselines and missing detail fields degrade semantically',()=>{
 for(const changePercent of [2.4,-2.4,0])assert.equal(stocksComposition(profile(392,229),{...stocksStudioPresets.normal,changePercent}).available,true)
 for(const series of [[],[1]])assert.equal(stocksComposition(profile(392,229),{...stocksStudioPresets.normal,series}).showChart,false)
 assert.equal(stockReferenceLine({...stocksStudioPresets.normal,baselinePrice:123.1}),123.1)
 assert.equal(stockReferenceLine({...stocksStudioPresets.normal,baselinePrice:999}),null)
 const missing=stocksComposition(profile(654,343),{...stocksStudioPresets.normal,open:null,low:null})
 assert.deepEqual(missing.detailKeys,['high','previousClose','change'])
 assert.equal(stocksComposition(profile(654,343),stocksStudioPresets.empty).available,false)
 assert.ok(stocksStudioPresets.long.name.length>24)
 assert.ok(stocksStudioPresets.extreme.price>999000)
})

test('Studio and host C++ Stocks policy agree field-for-field',async()=>{
 const states=[stocksStudioPresets.normal,stocksStudioPresets.long,stocksStudioPresets.extreme,
  {...stocksStudioPresets.normal,series:[1]}, {...stocksStudioPresets.normal,series:[]},
  {...stocksStudioPresets.normal,open:null,low:null,change:null},stocksStudioPresets.empty]
 const geometries=[[196,114],[776,114],[196,343],[392,229],[392,343],[654,343],[392,458],[785,458]]
 const cases=geometries.flatMap(([w,h])=>states.map(state=>[w,h,state]))
 const finite=v=>Number.isFinite(v),valid=s=>Array.isArray(s.series)&&s.series.length>=2&&s.series.every(Number.isFinite)
 const input=([w,h,s])=>`{${w},${h},${w>h},${finite(s.price)},${valid(s)},${finite(s.open)},${finite(s.high)},${finite(s.low)},${finite(s.previousClose)},${finite(s.change)}}`
 const source=`#include <iostream>\n#include "StocksAdaptivePolicy.h"\nusing namespace StocksAdaptivePolicy;\nint main(){const Input v[]={${cases.map(input).join(',')}};for(const auto&i:v){Result r=compose(i);std::cout<<int(r.family)<<','<<r.available<<','<<r.showChart<<','<<r.showSelector<<','<<r.showDetails<<','<<int(r.detailMask)<<','<<int(r.detailCount)<<'\\n';}}`
 const dir=await mkdtemp(join(tmpdir(),'stocks-policy-')),cpp=join(dir,'policy.cpp'),bin=join(dir,'policy')
 await writeFile(cpp,source)
 execFileSync('g++',['-std=gnu++11','-Wall','-Wextra','-Werror','-I',new URL('../frame/src/modules/',import.meta.url).pathname,cpp,'-o',bin])
 const actual=execFileSync(bin,{encoding:'utf8'}).trim().split('\n').map(line=>line.split(',').map(Number))
 const families={micro:0,'summary-strip':1,'summary-stack':2,'chart-summary':3,'detail-chart':4,expanded:5,empty:6}
 const expected=cases.map(([w,h,s])=>{const r=stocksComposition(profile(w,h),s),fields=['open','high','low','previousClose','change'];let mask=0;fields.forEach((key,i)=>{if(finite(s[key]))mask|=1<<i});return [families[r.family],+r.available,+r.showChart,+r.showSelector,+r.showDetails,mask,r.detailKeys.length]})
 assert.deepEqual(actual,expected)
})

test('physical Stocks instances are exact and preflight remains atomic',async()=>{
 const cells=module=>[{slot:0,col:0,row:0,colSpan:1,rowSpan:3,module},{slot:1,col:1,row:0,colSpan:3,rowSpan:3,module:'date'},{slot:2,col:0,row:3,colSpan:4,rowSpan:1,module:'date'}]
 for(const module of ['stocks','stocks:1','stocks:2','stocks:3','stocks:4','stocks:12','stocks:255'])assert.equal(supportsPhysicalCustomLayout(cells(module)).valid,true)
 for(const module of ['stocks:0','stocks:256','stocks:x','stocksfoo'])assert.equal(supportsPhysicalCustomLayout(cells(module)).valid,false)
 const capability=await readFile(new URL('../frame/src/modules/AdaptiveModuleCapability.h',import.meta.url),'utf8')
 assert.match(capability,/numericInstance\(module, "stocks"\)/)
})

test('GNU C++11 geometry syntax and legacy renderer protection stay additive',async()=>{
 const firmware=await readFile(new URL('../frame/src/modules/ModuleStocks.cpp',import.meta.url),'utf8')
 const adaptive=firmware.slice(firmware.indexOf('// BEGIN ADAPTIVE STOCKS RENDERER'),firmware.indexOf('// END ADAPTIVE STOCKS RENDERER'))
 for(const rect of ['summary','chart','selector','details'])assert.match(adaptive,new RegExp(`${rect} = StocksRect\\{`))
 assert.doesNotMatch(adaptive,/(?:^|\n)\s*(?:summary|chart|selector|details)\s*=\s*\{/)
 assert.match(firmware,/if \(c\.size == CELL_ADAPTIVE\)[\s\S]{0,100}renderAdaptiveStocks\(c, data\)/)
 for(const size of ['CELL_SMALL','CELL_MEDIUM','CELL_LARGE'])assert.match(firmware,new RegExp(`if \\(c\\.size == ${size}\\)`))
 assert.match(firmware,/\/\/ XL/)
 assert.match(adaptive,/drawChartBox/);assert.match(adaptive,/drawRangeSelectorRow/)
 const dir=await mkdtemp(join(tmpdir(),'stocks-compat-')),cpp=join(dir,'compat.cpp'),bin=join(dir,'compat')
 await writeFile(cpp,'#include "StocksAdaptivePolicy.h"\n#include "AdaptiveModuleCapability.h"\nstruct StocksRect{int x,y,w,h;};int main(){StocksRect chart={0,0,0,0};chart=StocksRect{1,2,3,4};const char*valid[]={"stocks","stocks:1","stocks:12","stocks:255"};const char*invalid[]={"stocks:0","stocks:256","stocks:x","stocksfoo"};for(const char*s:valid)if(!AdaptiveModuleCapability::supports(s))return 2;for(const char*s:invalid)if(AdaptiveModuleCapability::supports(s))return 3;return StocksAdaptivePolicy::compose({392,229,true,true,true,true,true,true,true,true}).showChart&&chart.w==3?0:1;}')
 execFileSync('g++',['-std=gnu++11','-Wall','-Wextra','-Werror','-I',new URL('../frame/src/modules/',import.meta.url).pathname,cpp,'-o',bin]);execFileSync(bin)
})
