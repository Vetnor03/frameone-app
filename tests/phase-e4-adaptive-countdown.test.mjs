import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
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
test('Studio policy tokens and adaptive firmware route remain in parity',async()=>{
 const firmware=await readFile(new URL('../frame/src/modules/ModuleCountdown.cpp',import.meta.url),'utf8')
 for(const token of ['adaptiveCountdownComposition','splitPercent','{40,45,50,55,60}','adaptiveCountdownEstimatedWidth','adaptiveNumberFont','showCalendar','CELL_ADAPTIVE'])assert.ok(firmware.includes(token),token)
 assert.match(firmware,/if \(c\.size == CELL_ADAPTIVE\)[\s\S]*renderAdaptiveCountdown/)
})
test('physical capability accepts exact Countdown instances but rejects lookalikes',()=>{
 const cells=module=>[{slot:0,col:0,row:0,colSpan:1,rowSpan:4,module},{slot:1,col:1,row:0,colSpan:3,rowSpan:4,module:'date'}]
 for(const module of ['countdown','countdown:calendar-id'])assert.equal(supportsPhysicalCustomLayout(cells(module)).valid,true)
 for(const module of ['countdowns','countdownfoo'])assert.equal(supportsPhysicalCustomLayout(cells(module)).valid,false)
})
