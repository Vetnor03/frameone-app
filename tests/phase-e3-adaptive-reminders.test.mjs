import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {supportsPhysicalCustomLayout,validateCustomGeometry} from '../app/lib/customLayouts.mjs'
import {reminderComposition,reminderLayout,reminderStudioPresets} from '../app/lib/remindersResponsive.mjs'

const adaptive=[[1,1],[1,2],[1,3],[1,4],[2,1],[2,3],[2,4],[3,1],[3,2],[3,3],[3,4],[4,3]]
const boundsX=[9,205,401,597,794],boundsY=[22,136,251,365,480]
function profile(w,h){const width=boundsX[w]-boundsX[0],height=boundsY[h]-boundsY[0],ratio=width/height
  return {width,height,colSpan:w,rowSpan:h,area:w*h,orientation:ratio>1.12?'landscape':ratio<.88?'portrait':'square'}}
function tiling(w,h,module='reminders'){const cells=[{slot:0,col:0,row:0,colSpan:w,rowSpan:h,module}];let slot=1
  for(let row=0;row<4;row++)for(let col=0;col<4;col++)if(!(col<w&&row<h))cells.push({slot:slot++,col,row,colSpan:1,rowSpan:1,module:'date'})
  return cells}

test('all twelve non-anchor Reminders geometries pass atomic physical capability',()=>{
  for(const [w,h] of adaptive){const cells=tiling(w,h)
    assert.equal(validateCustomGeometry(cells).valid,true,`${w}x${h} structural`)
    assert.equal(supportsPhysicalCustomLayout(cells).valid,true,`${w}x${h} physical`)
  }
})

test('exact Reminders instances are accepted and lookalikes rejected atomically',()=>{
  for(const module of ['reminders','reminders:1','reminders:calendar-id'])
    assert.equal(supportsPhysicalCustomLayout(tiling(3,3,module)).valid,true,module)
  for(const module of ['reminder','remindersfoo','reminders-foo','notreminders'])
    assert.equal(supportsPhysicalCustomLayout(tiling(3,3,module)).valid,false,module)
  const mixed=tiling(3,3);mixed[1].module='weather:1';assert.equal(supportsPhysicalCustomLayout(mixed).valid,true)
  mixed[1].module='countdown';assert.deepEqual(supportsPhysicalCustomLayout(mixed),{valid:false,errors:['unsupported_physical_cell'],unsupportedSlots:[1]})
})

test('pixel dimensions select shallow, vertical, and split Studio families',()=>{
  assert.equal(reminderComposition(profile(2,1),reminderStudioPresets.normal).family,'shallow-horizontal')
  assert.equal(reminderComposition(profile(1,3),reminderStudioPresets.normal).family,'vertical-list')
  assert.equal(reminderComposition(profile(3,2),reminderStudioPresets.normal).family,'split-sections')
})

test('Today-only, Tomorrow-only, empty, and mixed disclosure follow Studio policy',()=>{
  const today={today:reminderStudioPresets.normal.today,tomorrow:[]}
  const tomorrow={today:[],tomorrow:reminderStudioPresets.normal.tomorrow}
  assert.equal(reminderComposition(profile(1,2),today).todayItems,2)
  const tomorrowComposition=reminderComposition(profile(1,2),tomorrow)
  assert.equal(tomorrowComposition.showTomorrow,true);assert.equal(tomorrowComposition.todayItems,0);assert.equal(tomorrowComposition.tomorrowItems,1)
  assert.equal(reminderComposition(profile(3,3),reminderStudioPresets.empty).available,false)
  const mixed=reminderComposition(profile(3,3),reminderStudioPresets.normal)
  assert.ok(mixed.todayItems>0);assert.ok(mixed.tomorrowItems>0)
})

test('future-only adaptive data falls back to the primary upcoming bucket',async()=>{
  const reminders=await readFile(new URL('../frame/src/modules/ModuleReminders.cpp',import.meta.url),'utf8')
  assert.match(reminders,/todayCount \+ tomorrowCount == 0[\s\S]*findPrimaryBucketIndex\(buckets, bucketCount\)[\s\S]*renderAdaptiveFallbackBucket/)
  assert.match(reminders,/bucket\.daysUntil <= 7[\s\S]*"On %s"[\s\S]*bucket\.daysUntil <= 14[\s\S]*next week/)
  assert.match(reminders,/buildRelativeDateText\(bucket\.daysUntil, false, out, outSize\)/)
})

test('overdue-only adaptive data renders a relative overdue heading',async()=>{
  const reminders=await readFile(new URL('../frame/src/modules/ModuleReminders.cpp',import.meta.url),'utf8')
  assert.match(reminders,/bucket\.isOverdue \|\| bucket\.daysUntil < 0[\s\S]*buildRelativeDateText\(bucket\.daysUntil, true, out, outSize\)/)
})

test('adaptive empty state is reserved for an unavailable or genuinely empty feed',async()=>{
  const reminders=await readFile(new URL('../frame/src/modules/ModuleReminders.cpp',import.meta.url),'utf8')
  assert.match(reminders,/if \(!g_cache\.ok\)[\s\S]*"Fetch failed"/)
  assert.match(reminders,/if \(bucketCount == 0\)[\s\S]*"Nothing upcoming"/)
  assert.doesNotMatch(reminders,/todayCount \+ tomorrowCount == 0\) \{ drawEmptyState/)
})

test('Today and Tomorrow buckets still enter the responsive composition unchanged',async()=>{
  const reminders=await readFile(new URL('../frame/src/modules/ModuleReminders.cpp',import.meta.url),'utf8')
  assert.match(reminders,/findBucketByDaysUntil\(buckets, bucketCount, 0\)[\s\S]*findBucketByDaysUntil\(buckets, bucketCount, 1\)/)
  assert.match(reminders,/AdaptiveReminderComposition comp = adaptiveComposition\(c, todayCount, tomorrowCount\)/)
})

test('overflow owns a separate footer and never consumes a visible reminder row',()=>{
  for(const [w,h] of [[1,1],[1,3],[3,2]]){const p=profile(w,h),composition=reminderComposition(p,reminderStudioPresets.extreme),layout=reminderLayout(p,composition)
    assert.ok(composition.overflow>0)
    assert.equal(layout.items.length,composition.maxItems)
    assert.ok(layout.footerRect||layout.todayFooterRect||layout.tomorrowFooterRect)
  }
})

test('allocated time and long-title regions are bounded and disjoint',()=>{
  for(const [w,h] of adaptive){const p=profile(w,h),composition=reminderComposition(p,reminderStudioPresets.extreme),layout=reminderLayout(p,composition)
    for(const item of layout.items){
      for(const rect of [item.timeRect,item.titleRect]){assert.ok(rect.x>=0&&rect.y>=0);assert.ok(rect.x+rect.width<=p.width);assert.ok(rect.y+rect.height<=p.height)}
      if(item.stacked)assert.ok(item.timeRect.y+item.timeRect.height<=item.titleRect.y)
      else assert.ok(item.timeRect.x+item.timeRect.width<=item.titleRect.x)
    }
  }
})

test('firmware adds adaptive routing while leaving all handmade anchors intact',async()=>{
  const [reminders,renderer]=await Promise.all(['frame/src/modules/ModuleReminders.cpp','frame/src/modules/ModuleRenderer.cpp'].map(path=>readFile(new URL(`../${path}`,import.meta.url),'utf8')))
  assert.match(reminders,/app\/lib\/remindersResponsive\.mjs/)
  assert.match(reminders,/aspectRatio|ratio = c\.h > 0[\s\S]*1\.12f/)
  assert.match(reminders,/REM_SHALLOW_HORIZONTAL[\s\S]*REM_SPLIT_SECTIONS[\s\S]*REM_VERTICAL_LIST/)
  assert.match(reminders,/fitAdaptiveText[\s\S]*textWidth\(dst, font\)/)
  assert.match(reminders,/timeRect[\s\S]*titleRect/)
  const dispatch=reminders.match(/void render\(const Cell& c,[\s\S]*?\n}/)[0]
  assert.ok(dispatch.indexOf('CELL_ADAPTIVE')<dispatch.indexOf('CELL_SMALL'))
  for(const anchor of ['CELL_SMALL','CELL_MEDIUM','CELL_LARGE','CELL_XL'])assert.match(dispatch,new RegExp(anchor))
  assert.match(renderer,/strncasecmp\(module, "reminders", 9\)[\s\S]*module\[9\] == '\\0' \|\| module\[9\] == ':'/)
  assert.match(renderer,/strncasecmp\(module, "weather", 7\)/)
})
