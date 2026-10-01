import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {supportsPhysicalCustomLayout,validateCustomGeometry} from '../app/lib/customLayouts.mjs'
import {chooseReminderTextVariant,estimateReminderTextWidth,reminderComposition,reminderDensity,reminderLayout,reminderStudioPresets} from '../app/lib/remindersResponsive.mjs'

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
  mixed[1].module='countdown';assert.deepEqual(supportsPhysicalCustomLayout(mixed),{valid:true,errors:[],unsupportedSlots:[]})
})

test('pixel dimensions select shallow, vertical, and split Studio families',()=>{
  assert.equal(reminderComposition(profile(2,1),reminderStudioPresets.normal).family,'shallow-horizontal')
  assert.equal(reminderComposition(profile(1,3),reminderStudioPresets.normal).family,'vertical-list')
  assert.ok(['split-sections','vertical-list'].includes(reminderComposition(profile(3,2),reminderStudioPresets.normal).family))
})

test('Today-only, Tomorrow-only, empty, and mixed disclosure follow Studio policy',()=>{
  const today={today:reminderStudioPresets.normal.today,tomorrow:[]}
  const tomorrow={today:[],tomorrow:reminderStudioPresets.normal.tomorrow}
  assert.equal(reminderComposition(profile(1,2),today).todayItems,1)
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
  assert.match(reminders,/if \(!g_cache->ok\)[\s\S]*"Fetch failed"/)
  assert.match(reminders,/if \(bucketCount == 0\)[\s\S]*"Nothing upcoming"/)
  assert.doesNotMatch(reminders,/todayCount \+ tomorrowCount == 0\) \{ drawEmptyState/)
})

test('Today and Tomorrow buckets still enter the responsive composition unchanged',async()=>{
  const reminders=await readFile(new URL('../frame/src/modules/ModuleReminders.cpp',import.meta.url),'utf8')
  assert.match(reminders,/findBucketByDaysUntil\(buckets, bucketCount, 0\)[\s\S]*findBucketByDaysUntil\(buckets, bucketCount, 1\)/)
  assert.match(reminders,/AdaptiveReminderComposition comp = adaptiveComposition\(c, today, tomorrow\)/)
})


test('Reminders body typography is fixed at regular 9pt and never falls back to B12',async()=>{
  const reminders=await readFile(new URL('../frame/src/modules/ModuleReminders.cpp',import.meta.url),'utf8')
  const density=reminderDensity(500,1)
  assert.equal(density.font,'B9');assert.equal(density.fontSize,13);assert.equal(density.rowHeight,88)
  assert.match(reminders,/REMINDER_CONTENT_FONT = FONT_B9/)
  assert.match(reminders,/return \{FONT_B9, 88, 5, 48\}/)
  assert.doesNotMatch(reminders,/AdaptiveReminderDensity\{FONT_B12/)
  assert.doesNotMatch(reminders,/fitAdaptiveText/)
})

test('long reminders keep complete text and reduce the visible item count instead',async()=>{
  const item=(title,time='18:00')=>({time,text:{full:title,compact:title,short:title,tiny:title},protectedFacts:[]})
  const state={today:[item('3 menn og en bobil - live // Stavangeren'),item('Discussion Evening: Prejudice Then and Now'),item('Gorrlaus at Tou in Stavanger East'),item('Torsdag på Tungenes: Bare Egil Band')],tomorrow:[item('Ice cider tasting at Sandalen gard','12:15'),item('The Talling Sisters – Live & Terrified'),item('A final particularly descriptive concert title')]}
  const p={width:776,height:343,colSpan:4,rowSpan:3,area:12,orientation:'landscape'}
  const composition=reminderComposition(p,state),layout=reminderLayout(p,composition)
  assert.equal(composition.selectedFont,'B9')
  assert.ok(composition.maxItems<state.today.length+state.tomorrow.length)
  assert.ok(composition.overflow>0)
  assert.equal(layout.items.length,composition.maxItems)
  assert.ok(layout.items.every(row=>row.density.font==='B9'&&row.itemRect.height>=84&&!row.stacked))
  const firmware=await readFile(new URL('../frame/src/modules/ModuleReminders.cpp',import.meta.url),'utf8')
  assert.match(firmware,/wrapTextToLines\([\s\S]*bool& complete/)
  assert.match(firmware,/if \(!complete \|\| item\.lineCount <= 0\) return false/)
  assert.match(firmware,/for \(int columns = candidateCount; columns >= 1 && visibleCount == 0; --columns\)/)
  assert.doesNotMatch(firmware,/fitAdaptiveText/)
})

test('mirror text fallback wraps the complete source instead of creating ellipsis',()=>{
  const item={text:{full:'A reminder title that needs wrapping',compact:'A reminder title',short:'Reminder title',tiny:'Reminder'},protectedFacts:[]}
  const selected=chooseReminderTextVariant(item,10,()=>999)
  assert.equal(selected.variant,'wrapped')
  assert.equal(selected.text,item.text.full)
  assert.ok(!selected.text.includes('…')&&!selected.text.includes('...'))
})

test('B9 width estimates remain stable for Norwegian and punctuation-heavy titles',()=>{
  const vectors=[['Torsdag på Tungenes',119],['Søndag',40],['Blåbær',37],['The Talling Sisters – Live & Terrified',213]]
  for(const [value,b9] of vectors)assert.equal(estimateReminderTextWidth(value,'B9'),b9)
})

test('an unbreakable pathological title is omitted rather than clipped',()=>{
  const item=(title)=>({time:'18:00',text:{full:title,compact:title,short:title,tiny:title},protectedFacts:[]})
  const state={today:[item('T'.repeat(1000))],tomorrow:[item('M'.repeat(1000))]}
  const p={width:500,height:220,colSpan:3,rowSpan:2,area:6,orientation:'landscape'}
  const composition=reminderComposition(p,state),layout=reminderLayout(p,composition)
  assert.equal(composition.selectedFont,'B9')
  assert.equal(composition.maxItems,0)
  assert.equal(composition.overflow,2)
  assert.equal(layout.items.length,0)
  assert.ok(layout.footerRect)
})

test('narrow custom layouts show fewer complete reminders instead of squeezing them',()=>{
  const today={today:reminderStudioPresets.normal.today,tomorrow:[]}
  assert.equal(reminderComposition(profile(1,2),today).todayItems,1)
  assert.equal(reminderComposition(profile(1,3),reminderStudioPresets.normal).maxItems,2)
  assert.equal(reminderComposition(profile(1,4),reminderStudioPresets.normal).maxItems,3)
  for(const [w,h] of [[1,2],[1,3],[1,4]]){
    const p=profile(w,h),composition=reminderComposition(p,reminderStudioPresets.normal),layout=reminderLayout(p,composition)
    assert.equal(layout.items.length,composition.maxItems)
    assert.ok(layout.items.every(row=>row.density.font==='B9'&&!row.stacked))
  }
})

test('split candidates may trade item count for enough width to keep titles complete',()=>{
  const item=(title)=>({time:'18:00',text:{full:title,compact:title,short:title,tiny:title},protectedFacts:[]})
  const state={today:Array.from({length:4},()=>item('Lunch')),tomorrow:Array.from({length:3},()=>item('Tomorrow title that needs substantially more width'))}
  const composition=reminderComposition({width:776,height:343,colSpan:4,rowSpan:3,area:12,orientation:'landscape'},state)
  assert.equal(composition.selectedFont,'B9')
  assert.ok(composition.maxItems<7)
  assert.ok(composition.overflow>0)
  assert.ok(composition.splitRatio<=.5)
})

test('overflow owns separate space and never consumes a visible reminder row',()=>{
  for(const [w,h] of [[1,1],[1,3],[3,2]]){const p=profile(w,h),composition=reminderComposition(p,reminderStudioPresets.extreme),layout=reminderLayout(p,composition)
    assert.ok(composition.overflow>0)
    assert.equal(layout.items.length,composition.maxItems)
    const usableWidth=p.width-layout.pad*2
    assert.ok(layout.footerRect||layout.todayFooterRect||layout.tomorrowFooterRect||usableWidth<196)
  }
})

test('large vertical Today and Tomorrow sections preserve the complete-text row floor',()=>{
  const p={...profile(2,4),width:300,height:500,orientation:'portrait'}
  const source=reminderStudioPresets.extreme
  const state={today:[...source.today,...source.today],tomorrow:[...source.tomorrow,...source.tomorrow]}
  const composition=reminderComposition(p,state),layout=reminderLayout(p,composition)
  assert.equal(composition.family,'vertical-list')
  assert.ok(composition.todayItems>=1&&composition.tomorrowItems>=1&&layout.footerRect)
  assert.ok(layout.todayRect&&layout.tomorrowRect)
  assert.ok(layout.todayRect.y+layout.todayRect.height+10<=layout.tomorrowRect.y)
  assert.ok(layout.tomorrowRect.y+layout.tomorrowRect.height+6<=layout.footerRect.y)
  for(const item of layout.items){assert.equal(item.density.font,'B9');assert.ok(item.itemRect.height>=84)}
})

test('allocated time and title regions are bounded and disjoint',()=>{
  for(const [w,h] of adaptive){const p=profile(w,h),composition=reminderComposition(p,reminderStudioPresets.extreme),layout=reminderLayout(p,composition)
    for(const item of layout.items){
      for(const rect of [item.timeRect,item.titleRect]){assert.ok(rect.x>=0&&rect.y>=0);assert.ok(rect.x+rect.width<=p.width);assert.ok(rect.y+rect.height<=p.height)}
      assert.equal(item.stacked,false)
      assert.ok(item.timeRect.x+item.timeRect.width<=item.titleRect.x)
    }
  }
})

test('firmware keeps adaptive routing and complete-text rules across all anchor sizes',async()=>{
  const [reminders,renderer]=await Promise.all(['frame/src/modules/ModuleReminders.cpp','frame/src/modules/ModuleRenderer.cpp'].map(path=>readFile(new URL(`../${path}`,import.meta.url),'utf8')))
  assert.match(reminders,/app\/lib\/remindersResponsive\.mjs/)
  assert.match(reminders,/aspectRatio|ratio = c\.h > 0[\s\S]*1\.12f/)
  assert.match(reminders,/REM_SHALLOW_HORIZONTAL[\s\S]*REM_SPLIT_SECTIONS[\s\S]*REM_VERTICAL_LIST/)
  assert.match(reminders,/wrapTextToLines[\s\S]*complete/)
  assert.doesNotMatch(reminders,/fitAdaptiveText/)
  assert.match(reminders,/timeRect[\s\S]*titleRect/)
  const dispatch=reminders.match(/void render\(const Cell& c,[\s\S]*?\n}/)[0]
  assert.ok(dispatch.indexOf('CELL_ADAPTIVE')<dispatch.indexOf('CELL_SMALL'))
  for(const anchor of ['CELL_SMALL','CELL_MEDIUM','CELL_LARGE','CELL_XL'])assert.match(dispatch,new RegExp(anchor))
  assert.match(renderer,/strncasecmp\(module, "reminders", 9\)[\s\S]*module\[9\] == '\\0' \|\| module\[9\] == ':'/)
  assert.match(renderer,/strncasecmp\(module, "weather", 7\)/)
})
