import test from 'node:test'
import assert from 'node:assert/strict'
import {countdownComposition,countdownLayout,countdownStudioPresets} from '../app/lib/countdownResponsive.mjs'

// All 16 canonical 4x4 cell sizes, including thin strips and tall columns.
// The grid is deliberately kept as the source of truth for cell boundaries.
const within=(r,w,h)=>!r||(r.x>=0&&r.y>=0&&r.width>=0&&r.height>=0&&r.x+r.width<=w+.001&&r.y+r.height<=h+.001)
test('Countdown: all 16 geometries stay inside their assigned grid rectangles',()=>{
 for(let cols=1;cols<=4;cols++)for(let rows=1;rows<=4;rows++){
  const width=cols*200,height=rows*120
  const profile={width,height,orientation:width>height?'landscape':width<height?'portrait':'square'}
  for(const preset of ['normal','long','extreme','empty']){
   const comp=countdownComposition(profile,countdownStudioPresets[preset])
   const g=countdownLayout(profile,comp)
   const rects=[g.emptyRect,g.primaryRect,g.heroGroupRect,g.titleRect,g.countRect,g.unitRect,g.targetDateRect,g.upcomingRect,g.upcomingGroupRect,g.calendarRect,g.overflowRect,...g.upcomingRows.flatMap(r=>[r.rowRect,r.titleRect,r.metricRect])]
   for(const r of rects)assert.ok(within(r,width,height),`overflow ${cols}x${rows} ${preset}: ${JSON.stringify(r)}`)
   if(g.heroGroupRect&&g.primaryRect){
    assert.ok(g.heroGroupRect.x>=g.primaryRect.x&&g.heroGroupRect.x+g.heroGroupRect.width<=g.primaryRect.x+g.primaryRect.width,`hero outside primary ${cols}x${rows}`)
    assert.ok(g.heroGroupRect.y>=g.primaryRect.y&&g.heroGroupRect.y+g.heroGroupRect.height<=g.primaryRect.y+g.primaryRect.height,`hero outside vertically ${cols}x${rows}`)
   }
   for(const row of g.upcomingRows){
    assert.ok(row.titleRect.x+row.titleRect.width+8===row.metricRect.x,'related labels and day counts have fixed close gap')
    assert.ok(row.metricRect.x+row.metricRect.width<=row.rowRect.x+row.rowRect.width,'metric fits row')
   }
  }
 }
})
