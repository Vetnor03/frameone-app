import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import {supportsPhysicalCustomLayout,validateCustomGeometry} from '../app/lib/customLayouts.mjs'
import {estimateReminderTextWidth,reminderComposition,reminderLayout,reminderStudioPresets} from '../app/lib/remindersResponsive.mjs'

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

test('physical 4x2 is explicitly Today and Tomorrow, never the legacy calendar composition',async()=>{
  const composition=reminderComposition(profile(4,2),reminderStudioPresets.normal)
  assert.equal(composition.family,'split-sections');assert.ok(composition.todayItems>0);assert.ok(composition.tomorrowItems>0)
  const layout=reminderLayout(profile(4,2),composition);assert.ok(layout.todayRect);assert.ok(layout.tomorrowRect)
  assert.ok(layout.todayRect.x+layout.todayRect.width<=layout.tomorrowRect.x)
  const firmware=await readFile(new URL('../frame/src/modules/ModuleReminders.cpp',import.meta.url),'utf8')
  assert.match(firmware,/forceFourByTwo[\s\S]*forceFourByTwo \? 0 : 1/)
  assert.match(firmware,/if \(c\.size == CELL_ADAPTIVE\)/)
  assert.doesNotMatch(firmware,/CELL_ADAPTIVE \|\| \(c\.colSpan == 4 && c\.rowSpan == 2\)/)
  const layoutSource=await readFile(new URL('../frame/src/core/Layout.cpp',import.meta.url),'utf8')
  assert.match(layoutSource,/exactBase\(module, "reminders"\)[\s\S]*cell\.colSpan == 4 && cell\.rowSpan == 2\)[\s\S]*cell\.size = CELL_ADAPTIVE/)
  assert.match(firmware,/if \(c\.size == CELL_LARGE\)[\s\S]*renderLarge\(c, buckets, bucketCount, primaryIdx\)/)
})

test('Today-only, Tomorrow-only, empty, and mixed disclosure follow Studio policy',()=>{
  const today={today:reminderStudioPresets.normal.today,tomorrow:[]}
  const tomorrow={today:[],tomorrow:reminderStudioPresets.normal.tomorrow}
  assert.equal(reminderComposition(profile(1,2),today).todayItems,3)
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

test('physical long-title regression makes the same content-aware Studio and firmware decision',async()=>{
  const item=(title,time='18:00')=>({time,text:{full:title,compact:title,short:title,tiny:title},protectedFacts:[]})
  const state={today:[item('3 menn og en bobil - live // Stavangeren'),item('Discussion Evening: Prejudice Then and Now'),item('Gorrlaus at Tou in Stavanger East'),item('Torsdag på Tungenes: Bare Egil Band')],tomorrow:[item('Ice cider tasting at Sandalen gard','12:15'),item('The Talling Sisters – Live & Terrified'),item('A final particularly descriptive concert title')]}
  const p={width:776,height:343,colSpan:4,rowSpan:3,area:12,orientation:'landscape'}
  const composition=reminderComposition(p,state),layout=reminderLayout(p,composition)
  assert.equal(composition.selectedFont,'B12');assert.notEqual(composition.splitRatio,.7)
  assert.ok((layout.tomorrowRect?.width||0)>(p.width-layout.pad*2)*.3)
  assert.ok(layout.items.every(row=>row.density.font!=='B18'&&row.titleRect.width>=54))
  assert.equal(composition.maxItems,7);assert.equal(composition.overflow,0);assert.ok(composition.readabilityScore>0)
  const visible=[...state.today.slice(0,composition.todayItems),...state.tomorrow.slice(0,composition.tomorrowItems)]
  assert.ok(layout.items.every((row,index)=>row.titleRect.width/estimateReminderTextWidth(visible[index].text.full,'B12')>=.28))
  const firmware=await readFile(new URL('../frame/src/modules/ModuleReminders.cpp',import.meta.url),'utf8')
  for(const token of ['adaptiveEstimatedTextWidth','adaptiveUsefulTitleScore','splitPercents[] = {35, 40, 45, 50, 55, 60, 65}','bestMinimum','comp.splitPercent'])assert.ok(firmware.includes(token),token)
  assert.doesNotMatch(firmware,/\(inner\.w - gap\) \* 70/)
})

test('Studio and firmware width inputs count UTF-8 code points identically',async()=>{
  const vectors=[['Torsdag på Tungenes',157,119],['Søndag',53,40],['Blåbær',49,37],['The Talling Sisters – Live & Terrified',280,213]]
  const firmwareEstimate=(value,font)=>{const bytes=new TextEncoder().encode(value);let units=0
    for(let index=0;index<bytes.length;){const lead=bytes[index];let codepoint=lead,advance=1
      if((lead&0xe0)===0xc0){codepoint=((lead&0x1f)<<6)|(bytes[index+1]&0x3f);advance=2}
      else if((lead&0xf0)===0xe0){codepoint=((lead&0x0f)<<12)|((bytes[index+1]&0x3f)<<6)|(bytes[index+2]&0x3f);advance=3}
      else if((lead&0xf8)===0xf0){codepoint=((lead&7)<<18)|((bytes[index+1]&0x3f)<<12)|((bytes[index+2]&0x3f)<<6)|(bytes[index+3]&0x3f);advance=4}
      index+=advance;const ch=String.fromCodePoint(codepoint);units+=codepoint>0x7f?6:ch===' '?3:/[ilI1.,:;!'|]/.test(ch)?3:/[MW@%&]/.test(ch)?9:/[A-Z0-9]/.test(ch)?7:6
    }return Math.floor((units*(font==='B12'?142:108)+99)/100)}
  for(const [value,b12,b9] of vectors){assert.equal(estimateReminderTextWidth(value,'B12'),b12);assert.equal(estimateReminderTextWidth(value,'B9'),b9);assert.equal(firmwareEstimate(value,'B12'),b12);assert.equal(firmwareEstimate(value,'B9'),b9)}
  const firmware=await readFile(new URL('../frame/src/modules/ModuleReminders.cpp',import.meta.url),'utf8')
  assert.match(firmware,/const uint8_t\* p[\s\S]*codepoint > 0x7F[\s\S]*units \+= 6/)
})

test('unusable extra titles cause overflow, while the selected items remain above the quality floor',()=>{
  const item=(title)=>({time:'18:00',text:{full:title,compact:title,short:title,tiny:title},protectedFacts:[]})
  const state={today:[item('Readable event'),item('X'.repeat(500))],tomorrow:[item('Tomorrow event')]}
  const p={width:500,height:190,colSpan:3,rowSpan:2,area:6,orientation:'landscape'}
  const composition=reminderComposition(p,state),layout=reminderLayout(p,composition)
  assert.ok(composition.overflow>0)
  const omitted=state.today[composition.todayItems]
  if(omitted){const titleWidth=layout.items[0].titleRect.width,ratio=titleWidth/estimateReminderTextWidth(omitted.text.full,composition.selectedFont);assert.ok(titleWidth<54||ratio<.28)}
})

test('split candidates can give Tomorrow more width than Today',()=>{
  const item=(title)=>({time:'18:00',text:{full:title,compact:title,short:title,tiny:title},protectedFacts:[]})
  const state={today:Array.from({length:4},()=>item('Lunch')),tomorrow:Array.from({length:3},()=>item('Tomorrow title that needs substantially more width'))}
  const composition=reminderComposition({width:776,height:343,colSpan:4,rowSpan:3,area:12,orientation:'landscape'},state)
  assert.equal(composition.direction,'split');assert.ok(composition.splitRatio<.5);assert.equal(composition.maxItems,7)
})

test('pathological titles use a safe non-empty dense fallback',()=>{
  const item=(title)=>({time:'18:00',text:{full:title,compact:title,short:title,tiny:title},protectedFacts:[]})
  const state={today:[item('T'.repeat(1000))],tomorrow:[item('M'.repeat(1000))]}
  const composition=reminderComposition({width:500,height:220,colSpan:3,rowSpan:2,area:6,orientation:'landscape'},state)
  assert.equal(composition.selectedFont,'B9');assert.ok(composition.maxItems>=1);assert.equal(composition.readabilityScore,0)
})

test('B9 wins when it reveals several additional useful reminders',()=>{
  const item=(title)=>({time:'18:00',text:{full:title,compact:title,short:title,tiny:title},protectedFacts:[]})
  const state={today:Array.from({length:3},(_,index)=>item(`${'X'.repeat(70)}${index}`)),tomorrow:Array.from({length:3},(_,index)=>item(`${'X'.repeat(70)}${index}`))}
  const profile={width:500,height:230,colSpan:3,rowSpan:2,area:6,orientation:'landscape'}
  const composition=reminderComposition(profile,state)
  assert.equal(composition.selectedFont,'B9');assert.equal(composition.maxItems,6);assert.equal(composition.overflow,0)
  // At B12 the split title floor fails and the stacked height holds only two;
  // B9's four-item information gain is therefore meaningful rather than marginal.
  const usableHeight=profile.height-2*Math.max(9,Math.min(18,Math.round(Math.min(profile.width,profile.height)*.08)))
  const b12StackedRows=usableHeight-60-10-24
  assert.ok(2*42+5<=b12StackedRows);assert.ok(3*42+2*5>b12StackedRows)
})

test('B12 remains selected when dense typography gains only one item',()=>{
  const item=(title)=>({time:'18:00',text:{full:title,compact:title,short:title,tiny:title},protectedFacts:[]})
  const state={today:[item('Today')],tomorrow:Array.from({length:4},(_,index)=>item(`Tomorrow ${index}`))}
  const composition=reminderComposition({width:500,height:230,colSpan:3,rowSpan:2,area:6,orientation:'landscape'},state)
  assert.equal(composition.selectedFont,'B12');assert.equal(composition.maxItems,4);assert.equal(composition.overflow,1)
})

test('firmware mirrors the one-item B12 calmness bonus',async()=>{
  const firmware=await readFile(new URL('../frame/src/modules/ModuleReminders.cpp',import.meta.url),'utf8')
  assert.match(firmware,/informationRank = count \+ fontRank[\s\S]*bestInformationRank = bestCount \+ bestFont/)
})

test('overflow owns a separate footer and never consumes a visible reminder row',()=>{
  for(const [w,h] of [[1,1],[1,3],[3,2]]){const p=profile(w,h),composition=reminderComposition(p,reminderStudioPresets.extreme),layout=reminderLayout(p,composition)
    assert.ok(composition.overflow>0)
    assert.equal(layout.items.length,composition.maxItems)
    const usableWidth=p.width-layout.pad*2
    assert.ok(layout.footerRect||layout.todayFooterRect||layout.tomorrowFooterRect||usableWidth<196)
  }
})

test('large vertical Today and Tomorrow sections preserve every geometry floor',()=>{
  const p={...profile(2,4),width:300,height:500,orientation:'portrait'}
  const source=reminderStudioPresets.extreme
  const state={today:[...source.today,...source.today],tomorrow:[...source.tomorrow,...source.tomorrow]}
  const composition=reminderComposition(p,state),layout=reminderLayout(p,composition)
  assert.equal(composition.family,'vertical-list')
  assert.ok(composition.todayItems>1&&composition.tomorrowItems>1&&layout.footerRect)
  assert.ok(layout.todayRect&&layout.tomorrowRect)
  assert.ok(layout.todayRect.y+layout.todayRect.height+10<=layout.tomorrowRect.y)
  assert.ok(layout.tomorrowRect.y+layout.tomorrowRect.height+6<=layout.footerRect.y)
  assert.ok(layout.todayRect.height>=30+composition.todayItems*38+(composition.todayItems-1)*4)
  assert.ok(layout.tomorrowRect.height>=30+composition.tomorrowItems*38+(composition.tomorrowItems-1)*4)
    for(const item of layout.items)assert.ok(item.itemRect.height>=34)
  for(let i=1;i<layout.items.length;i++) {
    const previous=layout.items[i-1].itemRect,current=layout.items[i].itemRect
    if(previous.y<current.y&&previous.y+previous.height<=current.y)assert.ok(current.y-(previous.y+previous.height)>=4)
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
  assert.match(renderer,/cell\.size != CELL_ADAPTIVE[\s\S]*AdaptiveModuleCapability::supports\(module\)/)
  assert.match(await readFile(new URL('../frame/src/modules/AdaptiveModuleCapability.h',import.meta.url),'utf8'),/exactBase\(module, "reminders"\)/)
})
