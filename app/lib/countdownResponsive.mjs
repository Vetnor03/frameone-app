export const COUNTDOWN_STUDIO_PRESET_VALUES=['normal','long','extreme','empty']
const freezeState=v=>Object.freeze({...v,upcoming:Object.freeze((v.upcoming??[]).map(x=>Object.freeze({...x})))})
export const countdownStudioPresets=Object.freeze({
 normal:freezeState({title:'Summer holiday',count:'42',unit:'days',targetDate:'30 June',upcoming:[{title:'Christmas',count:'126',unit:'days'},{title:'Anniversary',count:'365',unit:'days'}]}),
 long:freezeState({title:'Family summer holiday in southern France',count:'365',unit:'days',targetDate:'19 August 2027',upcoming:[{title:'School winter break',count:'487',unit:'days'},{title:'Grandparents’ golden anniversary',count:'730',unit:'days'}]}),
 extreme:freezeState({title:'The exceptionally long multi-generational family celebration and summer holiday across southern France',count:'99999',unit:'working days remaining',targetDate:'31 December 2299',upcoming:[{title:'A very long upcoming birthday celebration title',count:'100000',unit:'days'},{title:'Extended family reunion in the mountains',count:'100365',unit:'calendar days'},{title:'New century celebration',count:'250000',unit:'hours'}]}),
 empty:freezeState({title:null,count:null,unit:null,targetDate:null,upcoming:[]}),
})

// Integer-friendly approximation shared with the firmware candidate scorer.
export function estimateCountdownTextWidth(value,font='B9'){
 let units=0;for(const ch of String(value??'')){const cp=ch.codePointAt(0);units+=cp>127?6:ch===' '?3:/[ilI1.,:;!'|]/.test(ch)?3:/[MW@%&]/.test(ch)?9:/[A-Z0-9]/.test(ch)?7:6}
 return Math.floor((units*(font==='B18'?205:font==='B12'?142:108)+99)/100)
}
const useful=(text,width,font='B9')=>!text?0:Math.min(100,Math.floor(width*100/Math.max(1,estimateCountdownTextWidth(text,font))))

/** Select from useful compositions using only exact pixels and actual content. */
export function countdownComposition(profile,state){
 const available=state.count!=null&&state.count!==''&&state.unit!=null&&state.unit!==''
 if(!available)return Object.freeze({available:false,family:'unavailable',showTitle:false,showCount:false,showUnit:false,showTargetDate:false,upcomingRows:0,overflow:0,showCalendar:false,splitPercent:0})
 const w=profile.width,h=profile.height,pad=Math.max(8,Math.min(18,Math.floor(Math.min(w,h)*7/100))),iw=w-pad*2,ih=h-pad*2
 const effectiveDate=state.displayDate||state.targetDate
 const title=Boolean(state.title),date=Boolean(effectiveDate),events=state.upcoming??[]
 const numberNeeds=Math.max(30,estimateCountdownTextWidth(state.count,'B18')+8),unitNeeds=Math.max(32,estimateCountdownTextWidth(state.unit,'B9')+8)
 if(ih<92||(profile.orientation==='landscape'&&ih<170)){
  const metricNeeds=numberNeeds+unitNeeds+8,dateNeeds=date?estimateCountdownTextWidth(effectiveDate,'B9')+18:0
  const titleRoom=iw-metricNeeds-(dateNeeds?dateNeeds+12:0)-12
  const showTitle=title&&titleRoom>=70&&useful(state.title,titleRoom,'B12')>=28
  const showTargetDate=date&&iw-metricNeeds-(showTitle?Math.max(70,titleRoom):0)>=dateNeeds+8
  return Object.freeze({available:true,family:'horizontal',showTitle,showCount:true,showUnit:true,showTargetDate,upcomingRows:0,overflow:events.length,showCalendar:false,splitPercent:0})
 }
 const heroMinH=title?118:91,rowH=28,headerH=25,gap=14
 let best=null
 // Landscape split widths are symmetric candidates, scored by title and upcoming readability.
 if(iw>=390&&ih>=240&&events.length&&!(iw>=430&&ih>=390&&Math.abs(iw-ih)<100)){for(const percent of [40,45,50,55,60]){
  const heroW=Math.floor((iw-gap)*percent/100),listW=iw-gap-heroW
  if(heroW<numberNeeds+12||listW<130||ih<heroMinH)continue
  const capacity=Math.max(0,Math.floor((ih-headerH+4)/(rowH+4))),metricW=Math.min(120,Math.max(62,Math.floor(listW*38/100))),titleW=listW-metricW-10
  let rows=0,score=useful(state.title,heroW,'B12');for(const event of events.slice(0,capacity)){const metric=`${event.count} ${event.unit}`;if(titleW>=54&&useful(event.title,titleW)>=22&&estimateCountdownTextWidth(metric,'B9')<=metricW){rows++;score+=useful(event.title,titleW)}else break}
  if(rows){score+=rows*80;const candidate={family:'split-horizontal',splitPercent:percent,rows,score};if(!best||score>best.score)best=candidate}
 }}
 if(best)return Object.freeze({available:true,family:best.family,showTitle:title,showCount:true,showUnit:true,showTargetDate:date&&ih>=145,upcomingRows:best.rows,overflow:Math.max(0,events.length-best.rows),showCalendar:false,splitPercent:best.splitPercent})
 // Vertical disclosure spends only leftover rows after protecting the hero.
 const calendarUseful=iw>=430&&ih>=390&&events.length<=Math.floor((ih-heroMinH-gap-headerH)/(rowH+4))&&Math.floor(iw/7)>=42
 const calendarH=calendarUseful?Math.min(190,Math.floor(ih*42/100)):0
 const listPixels=ih-heroMinH-(calendarH?calendarH+gap:0)-gap-headerH
 const capacity=iw>=300&&!(profile.orientation==='landscape'&&ih<240)?Math.max(0,Math.floor((listPixels+4)/(rowH+4))):0
 let rows=0;for(const event of events.slice(0,capacity)){const metricW=Math.min(120,Math.max(62,Math.floor(iw*30/100))),titleW=iw-metricW-10;if(titleW>=54&&useful(event.title,titleW)>=22&&estimateCountdownTextWidth(`${event.count} ${event.unit}`,'B9')<=metricW)rows++;else break}
 const family=rows?'expanded-vertical':'stack'
 return Object.freeze({available:true,family,showTitle:title&&ih>=105,showCount:true,showUnit:true,showTargetDate:date&&ih>=130,upcomingRows:rows,overflow:Math.max(0,events.length-rows),showCalendar:calendarUseful,splitPercent:0})
}

// Geometry policy: measure compact content groups before positioning them.
// All positions are relative to the assigned cell: never bleed into adjacent cells.
export function countdownLayout(profile,c){
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v))
 const pad=Math.max(8,Math.min(18,Math.floor(Math.min(profile.width,profile.height)*7/100)))
 const inner={x:pad,y:pad,width:Math.max(1,profile.width-2*pad),height:Math.max(1,profile.height-2*pad)}
 if(!c.available)return Object.freeze({pad,emptyRect:inner,primaryRect:null,heroGroupRect:null,titleRect:null,countRect:null,unitRect:null,targetDateRect:null,upcomingRect:null,upcomingGroupRect:null,upcomingRows:[],calendarRect:null,overflowRect:null})
 const gap=clamp(Math.round(Math.min(inner.width,inner.height)*.06),8,14)
 let primaryRect={...inner},upcomingRect=null,calendarRect=null
 if(c.family==='split-horizontal'){
  const pw=Math.floor((inner.width-gap)*c.splitPercent/100)
  primaryRect={x:inner.x,y:inner.y,width:pw,height:inner.height}
  upcomingRect={x:inner.x+pw+gap,y:inner.y,width:inner.width-pw-gap,height:inner.height}
 }else if(c.upcomingRows||c.showCalendar){
  const listH=c.upcomingRows?25+c.upcomingRows*28+(c.upcomingRows-1)*4+(c.overflow?18:0):0
  const calH=c.showCalendar?Math.min(190,Math.floor(inner.height*.42)):0
  primaryRect={x:inner.x,y:inner.y,width:inner.width,height:Math.max(91,inner.height-listH-calH-(listH?gap:0)-(calH?gap:0))}
  if(listH)upcomingRect={x:inner.x,y:primaryRect.y+primaryRect.height+gap,width:inner.width,height:listH}
  if(calH)calendarRect={x:inner.x,y:inner.y+inner.height-calH,width:inner.width,height:calH}
 }
 let titleRect=null,countRect=null,unitRect=null,targetDateRect=null,heroGroupRect=null
 if(c.family==='horizontal'){
  // Treat label, value and date as one measured phrase; never pin the date to the right edge.
  const dateW=c.showTargetDate?clamp(Math.floor(primaryRect.width*.19),60,112):0
  const titleW=c.showTitle?clamp(Math.floor(primaryRect.width*.30),70,160):0
  const separators=(titleW?gap:0)+(dateW?gap:0)
  const metricW=Math.max(54,Math.min(200,primaryRect.width-titleW-dateW-separators))
  const groupW=Math.min(primaryRect.width,titleW+dateW+metricW+separators)
  const groupX=primaryRect.x+Math.floor((primaryRect.width-groupW)/2)
  heroGroupRect={x:groupX,y:primaryRect.y,width:groupW,height:primaryRect.height}
  let cursor=groupX
  if(titleW){titleRect={x:cursor,y:primaryRect.y,width:titleW,height:primaryRect.height};cursor+=titleW+gap}
  const countW=Math.max(30,Math.floor(metricW*.58))
  countRect={x:cursor,y:primaryRect.y,width:countW,height:primaryRect.height}
  unitRect={x:cursor+countW,y:primaryRect.y,width:metricW-countW,height:primaryRect.height}
  cursor+=metricW
  if(dateW)targetDateRect={x:cursor+gap,y:primaryRect.y,width:dateW,height:primaryRect.height}
 }else{
  // Keep the complete hero together. Extra height is outer breathing room, not internal gaps.
  const titleH=c.showTitle?clamp(Math.round(primaryRect.height*.14),22,38):0
  const dateH=c.showTargetDate?22:0
  const unitH=20
  const countH=clamp(Math.round(primaryRect.height*.30),34,88)
  const innerGap=clamp(Math.round(primaryRect.height*.025),3,10)
  const groupH=Math.min(primaryRect.height,titleH+countH+unitH+dateH+innerGap*(Number(!!titleH)+Number(!!dateH)))
  const groupW=Math.min(primaryRect.width,Math.max(90,Math.floor(primaryRect.width*.84)),380)
  const groupX=primaryRect.x+Math.floor((primaryRect.width-groupW)/2)
  const groupY=primaryRect.y+Math.floor((primaryRect.height-groupH)/2)
  heroGroupRect={x:groupX,y:groupY,width:groupW,height:groupH}
  let cursor=groupY
  if(titleH){titleRect={x:groupX,y:cursor,width:groupW,height:titleH};cursor+=titleH+innerGap}
  countRect={x:groupX,y:cursor,width:groupW,height:countH};cursor+=countH
  unitRect={x:groupX,y:cursor,width:groupW,height:unitH};cursor+=unitH
  if(dateH)targetDateRect={x:groupX,y:cursor+innerGap,width:groupW,height:dateH}
 }
 const upcomingRows=[]
 let upcomingGroupRect=null,overflowRect=null
 if(upcomingRect&&c.upcomingRows){
  const footerH=c.overflow?18:0
  const rowH=clamp(Math.floor((upcomingRect.height-32-footerH-4*(c.upcomingRows-1))/c.upcomingRows),16,34)
  const groupH=32+c.upcomingRows*rowH+4*(c.upcomingRows-1)
  const maxRowsWidth=Math.min(upcomingRect.width,420)
  const groupW=c.family==='split-horizontal'?upcomingRect.width:Math.min(maxRowsWidth,Math.max(130,Math.round(upcomingRect.width*.84)))
  const groupX=upcomingRect.x+Math.floor((upcomingRect.width-groupW)/2)
  const groupY=upcomingRect.y+Math.max(0,Math.floor((upcomingRect.height-footerH-groupH)/2))
  upcomingGroupRect={x:groupX,y:groupY,width:groupW,height:Math.min(groupH,upcomingRect.height-footerH)}
  for(let i=0;i<c.upcomingRows;i++){
   const rowY=groupY+32+i*(rowH+4)
   const rowRect={x:groupX,y:rowY,width:groupW,height:rowH}
   // The right-side metric belongs to its label. Use a compact central pair, not opposite edges.
   const pairW=Math.min(groupW,Math.max(125,Math.round(groupW*.79)))
   const titleW=Math.max(54,Math.floor(pairW*.67))
   const metricW=pairW-titleW-8
   const pairX=groupX+Math.floor((groupW-pairW)/2)
   upcomingRows.push(Object.freeze({rowRect,titleRect:{x:pairX,y:rowY,width:titleW,height:rowH},metricRect:{x:pairX+titleW+8,y:rowY,width:metricW,height:rowH}}))
  }
  if(footerH)overflowRect={x:groupX,y:upcomingRect.y+upcomingRect.height-footerH,width:groupW,height:footerH}
 }
 return Object.freeze({pad,emptyRect:null,primaryRect,heroGroupRect,titleRect,countRect,unitRect,targetDateRect,upcomingRect,upcomingGroupRect,upcomingRows:Object.freeze(upcomingRows),calendarRect,overflowRect})
}

export function fitCountdownStructuredText(value,width,height,measure,{maxFont=16,minFont=9}={}){if(!value||width<=0||height<=0)return null;for(let size=Math.floor(maxFont);size>=Math.ceil(minFont);size--)if(size<=height&&measure(value,size)<=width)return Object.freeze({text:value,fontSize:size});return null}
