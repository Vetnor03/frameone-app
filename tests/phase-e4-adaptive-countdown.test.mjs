import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtemp,writeFile} from 'node:fs/promises'
import {readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {countdownComposition,countdownLayout,countdownStudioPresets,fitCountdownStructuredText} from '../app/lib/countdownResponsive.mjs'
import {supportsPhysicalCustomLayout} from '../app/lib/customLayouts.mjs'

const p=(width,height)=>({width,height,colSpan:1,rowSpan:1,area:1,orientation:width/height>1.12?'landscape':width/height<.88?'portrait':'square'})
const state=(extra={})=>({...countdownStudioPresets.normal,...extra})

test('exact pixels select shallow, narrow, landscape, and vertical compositions',()=>{
 assert.equal(countdownComposition(p(776,100),state()).family,'horizontal')
 assert.equal(countdownComposition(p(150,430),state()).family,'stack')
 assert.equal(countdownComposition(p(776,343),state()).family,'split-horizontal')
 assert.equal(countdownComposition(p(380,440),state()).family,'expanded-vertical')
})
test('hero content controls disclosure without clipping protected facts',()=>{
 const extreme=countdownComposition(p(776,343),countdownStudioPresets.extreme)
 assert.equal(extreme.showTitle,true);assert.ok(extreme.upcomingRows>0)
 const long=state({title:'An extremely long event title '.repeat(30),count:'99999',unit:'exceptionally long working days remaining'})
 const composition=countdownComposition(p(196,114),long),layout=countdownLayout(p(196,114),composition)
 assert.equal(composition.showTitle,false);assert.ok(layout.countRect.width>0)
 assert.ok(fitCountdownStructuredText('99999',layout.countRect.width,layout.countRect.height,(v,size)=>v.length*size*.62,{maxFont:76,minFont:9}))
})
test('upcoming capacity derives from row pixels and content, including none and overflow',()=>{
 const events=Array.from({length:12},(_,i)=>({title:`Useful event ${i}`,count:String(i+2),unit:'days'}))
 const none=countdownComposition(p(380,180),state({upcoming:[]})),short=countdownComposition(p(380,300),state({upcoming:events})),tall=countdownComposition(p(380,460),state({upcoming:events}))
 assert.equal(none.upcomingRows,0);assert.ok(tall.upcomingRows>short.upcomingRows);assert.equal(tall.overflow,events.length-tall.upcomingRows)
})
test('empty state and optional calendar obey independent space floors',()=>{
 assert.equal(countdownComposition(p(500,500),countdownStudioPresets.empty).available,false)
 assert.equal(countdownComposition(p(420,380),state()).showCalendar,false)
 assert.equal(countdownComposition(p(500,500),state()).showCalendar,true)
})
test('executable firmware policy and Studio choose identical compositions',async()=>{
 const many=Array.from({length:12},(_,i)=>({title:`Useful event ${i}`,count:String(i+2),unit:'days'}))
 const cases=[
  [776,100,state()],[150,430,state()],[776,343,countdownStudioPresets.extreme],[380,440,state()],
  [300,300,state({count:'99999'})],[500,300,state({title:'An exceptionally long family event title '.repeat(8)})],
  [500,300,state({unit:'exceptionally long working days remaining'})],[380,440,state({upcoming:[]})],
  [380,460,state({upcoming:many})],[500,300,state({displayDate:'',targetDate:'30.06.2027'})],[500,500,state()],
 ]
 const q=value=>JSON.stringify(value??'')
 const eventDeclarations=[],caseDeclarations=[]
 cases.forEach(([width,height,value],index)=>{
  const events=value.upcoming??[]
  eventDeclarations.push(`static const Event e${index}[]={${events.map(item=>`{${q(item.title)},${q(`${item.count} ${item.unit}`)}}`).join(',')}};`)
  // The fallback case deliberately gives firmware an ISO target while Studio gets
  // its equivalent presentation string and an empty optional display date.
  const firmwareTarget=index===9?'2027-06-30':value.targetDate
  caseDeclarations.push(`{${width},${height},${q(value.title)},${q(value.count)},${q(value.unit)},${q(value.displayDate)},${q(firmwareTarget)},e${index},${events.length}}`)
 })
 const source=`#include <iostream>\n#include "CountdownAdaptivePolicy.h"\nusing namespace CountdownAdaptivePolicy;\n${eventDeclarations.join('\n')}\nint main(){const Input cases[]={${caseDeclarations.join(',')}};for(const auto& input:cases){const Result r=compose(input);std::cout<<int(r.family)<<','<<r.showTitle<<','<<r.showDate<<','<<r.upcomingRows<<','<<r.overflow<<','<<r.showCalendar<<','<<r.splitPercent<<'\\n';}}`
 const directory=await mkdtemp(join(tmpdir(),'countdown-policy-')),cpp=join(directory,'policy.cpp'),binary=join(directory,'policy')
 await writeFile(cpp,source)
 execFileSync('g++',['-std=c++17','-Wall','-Wextra','-Werror','-I',new URL('../frame/src/modules/',import.meta.url).pathname,cpp,'-o',binary])
 const firmware=execFileSync(binary,{encoding:'utf8'}).trim().split('\n').map(line=>line.split(',').map(Number))
 const family={horizontal:0,stack:1,'split-horizontal':2,'expanded-vertical':3}
 const studio=cases.map(([width,height,value])=>{const result=countdownComposition(p(width,height),value);return [family[result.family],+result.showTitle,+result.showTargetDate,result.upcomingRows,result.overflow,+result.showCalendar,result.splitPercent]})
 assert.deepEqual(firmware,studio)
 assert.equal(studio[9][2],1,'target date survives an empty display date')
 const renderer=await readFile(new URL('../frame/src/modules/ModuleCountdown.cpp',import.meta.url),'utf8')
 assert.match(renderer,/if \(c\.size == CELL_ADAPTIVE\)[\s\S]*renderAdaptiveCountdown/)
})
test('physical capability accepts exact Countdown instances but rejects lookalikes',()=>{
 const cells=module=>[{slot:0,col:0,row:0,colSpan:1,rowSpan:4,module},{slot:1,col:1,row:0,colSpan:3,rowSpan:4,module:'date'}]
 for(const module of ['countdown','countdown:calendar-id'])assert.equal(supportsPhysicalCustomLayout(cells(module)).valid,true)
 for(const module of ['countdowns','countdownfoo'])assert.equal(supportsPhysicalCustomLayout(cells(module)).valid,false)
})
