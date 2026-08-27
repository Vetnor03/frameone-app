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
 const title=Boolean(state.title),date=Boolean(state.targetDate),events=state.upcoming??[]
 const numberNeeds=Math.max(30,estimateCountdownTextWidth(state.count,'B18')+8),unitNeeds=Math.max(32,estimateCountdownTextWidth(state.unit,'B9')+8)
 if(ih<92||(profile.orientation==='landscape'&&ih<170)){
  const metricNeeds=numberNeeds+unitNeeds+8,dateNeeds=date?estimateCountdownTextWidth(state.targetDate,'B9')+18:0
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

export function countdownLayout(profile,c){
 const pad=Math.max(8,Math.min(18,Math.floor(Math.min(profile.width,profile.height)*7/100))),inner={x:pad,y:pad,width:Math.max(1,profile.width-pad*2),height:Math.max(1,profile.height-pad*2)}
 if(!c.available)return Object.freeze({pad,emptyRect:inner,primaryRect:null,heroGroupRect:null,titleRect:null,countRect:null,unitRect:null,targetDateRect:null,upcomingRect:null,upcomingGroupRect:null,upcomingRows:[],calendarRect:null,overflowRect:null})
 let primaryRect={...inner},upcomingRect=null,calendarRect=null,gap=14
 if(c.family==='split-horizontal'){const pw=Math.floor((inner.width-gap)*c.splitPercent/100);primaryRect={x:inner.x,y:inner.y,width:pw,height:inner.height};upcomingRect={x:inner.x+pw+gap,y:inner.y,width:inner.width-pw-gap,height:inner.height}}
 else if(c.upcomingRows||c.showCalendar){const listH=c.upcomingRows?25+c.upcomingRows*28+(c.upcomingRows-1)*4+(c.overflow?18:0):0,calH=c.showCalendar?Math.min(190,Math.floor(inner.height*42/100)):0;primaryRect={x:inner.x,y:inner.y,width:inner.width,height:Math.max(91,inner.height-listH-calH-(listH?gap:0)-(calH?gap:0))};if(listH)upcomingRect={x:inner.x,y:primaryRect.y+primaryRect.height+gap,width:inner.width,height:listH};if(calH)calendarRect={x:inner.x,y:inner.y+inner.height-calH,width:inner.width,height:calH}}
 let titleRect=null,countRect,unitRect,targetDateRect=null,heroGroupRect=primaryRect
 if(c.family==='horizontal'){const dateW=c.showTargetDate?Math.min(150,Math.max(70,Math.floor(primaryRect.width*23/100))):0,titleW=c.showTitle?Math.min(Math.floor(primaryRect.width*38/100),Math.max(70,primaryRect.width-dateW-145)):0,metricX=primaryRect.x+titleW+(titleW?10:0),metricW=primaryRect.width-titleW-(titleW?10:0)-dateW-(dateW?10:0),countW=Math.max(30,Math.floor(metricW*58/100));if(titleW)titleRect={x:primaryRect.x,y:primaryRect.y,width:titleW,height:primaryRect.height};countRect={x:metricX,y:primaryRect.y,width:countW,height:primaryRect.height};unitRect={x:metricX+countW,y:primaryRect.y,width:metricW-countW,height:primaryRect.height};if(dateW)targetDateRect={x:primaryRect.x+primaryRect.width-dateW,y:primaryRect.y,width:dateW,height:primaryRect.height}}
 else{const titleH=c.showTitle?Math.min(38,Math.max(24,Math.floor(primaryRect.height*20/100))):0,dateH=c.showTargetDate?24:0,unitH=22,contentH=titleH+Math.min(88,Math.max(42,primaryRect.height-titleH-unitH-dateH))+unitH+dateH,groupH=(c.family==='stack'?primaryRect.height:Math.min(primaryRect.height-2,Math.max(contentH,primaryRect.height-120)));heroGroupRect=c.family==='stack'?primaryRect:{x:primaryRect.x,y:primaryRect.y+(primaryRect.height-groupH)/2,width:primaryRect.width,height:groupH};if(titleH)titleRect={x:heroGroupRect.x,y:heroGroupRect.y,width:heroGroupRect.width,height:titleH};countRect={x:heroGroupRect.x,y:heroGroupRect.y+titleH,width:heroGroupRect.width,height:Math.max(30,heroGroupRect.height-titleH-unitH-dateH)};unitRect={x:heroGroupRect.x,y:countRect.y+countRect.height,width:heroGroupRect.width,height:unitH};if(dateH)targetDateRect={x:heroGroupRect.x,y:unitRect.y+unitRect.height,width:heroGroupRect.width,height:dateH}}
 let upcomingGroupRect=null,overflowRect=null;const upcomingRows=[]
 if(upcomingRect){const footerH=c.overflow?18:0,rowH=Math.min(34,Math.max(1,Math.floor((upcomingRect.height-27-5-4*(c.upcomingRows-1))/c.upcomingRows)),Math.max(28,upcomingRect.width*.085)),groupH=27+5+c.upcomingRows*rowH+(c.upcomingRows-1)*4,groupY=c.family==='split-horizontal'?upcomingRect.y+(upcomingRect.height-groupH)/2:upcomingRect.y;upcomingGroupRect={x:upcomingRect.x,y:groupY,width:upcomingRect.width,height:groupH};for(let i=0;i<c.upcomingRows;i++){const rowRect={x:upcomingRect.x,y:groupY+32+i*(rowH+4),width:upcomingRect.width,height:rowH},metricW=Math.min(120,Math.max(62,Math.floor(rowRect.width*30/100)));upcomingRows.push(Object.freeze({rowRect,titleRect:{x:rowRect.x,y:rowRect.y,width:rowRect.width-metricW-10,height:rowH},metricRect:{x:rowRect.x+rowRect.width-metricW,y:rowRect.y,width:metricW,height:rowH}}))}if(footerH)overflowRect={x:upcomingRect.x,y:upcomingRect.y+upcomingRect.height-footerH,width:upcomingRect.width,height:footerH}}
 return Object.freeze({pad,emptyRect:null,primaryRect,heroGroupRect,titleRect,countRect,unitRect,targetDateRect,upcomingRect,upcomingGroupRect,upcomingRows:Object.freeze(upcomingRows),calendarRect,overflowRect})
}
export function fitCountdownStructuredText(value,width,height,measure,{maxFont=16,minFont=9}={}){if(!value||width<=0||height<=0)return null;for(let size=Math.floor(maxFont);size>=Math.ceil(minFont);size--)if(size<=height&&measure(value,size)<=width)return Object.freeze({text:value,fontSize:size});return null}
