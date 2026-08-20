export const REMINDER_TEXT_ORDER=Object.freeze(['full','compact','short','tiny'])
export const REMINDER_STUDIO_PRESET_VALUES=Object.freeze(['normal','long','extreme','empty'])

/** Selects verbosity only after composition has allocated a real pixel width. */
export function chooseReminderTextVariant(item,availableWidth,measure) {
  const {text,protectedFacts=[]}=item
  const requiredFacts=protectedFacts.filter(fact=>!fact.optionalInTitle).map(fact=>fact.value)
  const eligible=REMINDER_TEXT_ORDER.filter(variant=>text[variant]&&requiredFacts.every(fact=>text[variant].includes(fact)))
  for(const variant of eligible) if(measure(text[variant])<=availableWidth)return {variant,text:text[variant]}
  const source=[...eligible].reverse().map(variant=>text[variant]).find(Boolean)||''
  if(!source)return {variant:'fallback',text:''}
  const ellipsis='…'
  if(measure(ellipsis)>availableWidth)return {variant:'fallback',text:''}
  // Protected facts are atomic. The fallback may omit an optional fact, but it
  // must never display a prefix such as "IMR 26-0…" or a partial location.
  const atoms=atomicTextParts(source,protectedFacts.map(fact=>fact.value));let fitted=''
  for(const atom of atoms){const candidate=fitted?`${fitted} ${atom}`:atom;if(measure(candidate+ellipsis)>availableWidth)break;fitted=candidate}
  const fallback=fitted?fitted+ellipsis:''
  if(requiredFacts.every(fact=>fallback.includes(fact)))return {variant:'fallback',text:fallback}
  const factsOnly=requiredFacts.join(' ')
  return {variant:'fallback',text:factsOnly&&measure(factsOnly)<=availableWidth?factsOnly:''}
}

function atomicTextParts(source,protectedFacts) {
  const facts=protectedFacts.filter(fact=>source.includes(fact)).sort((a,b)=>b.length-a.length)
  if(!facts.length)return source.split(/\s+/).filter(Boolean)
  const pattern=new RegExp(`(${facts.map(escapeRegExp).join('|')})`,'g')
  return source.split(pattern).flatMap(part=>facts.includes(part)?[part]:part.split(/\s+/)).filter(Boolean)
}

function escapeRegExp(value){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}

export function reminderComposition(profile,state) {
  const total=state.today.length+state.tomorrow.length
  if(!total)return Object.freeze({available:false,direction:'vertical',showHeading:false,showTime:false,showTomorrow:false,todayItems:0,tomorrowItems:0,maxItems:0,overflow:0})
  const direction=profile.rowSpan===1?'horizontal':'vertical'
  const large=direction==='vertical'&&profile.area>=8&&profile.height>=300
  // A Tomorrow-only state is still meaningful at every size. Otherwise the
  // secondary section is progressively disclosed only in genuinely large cells.
  const showTomorrow=state.today.length===0?state.tomorrow.length>0:large&&state.tomorrow.length>0
  const capacity=direction==='horizontal'?Math.min(3,profile.colSpan):profile.area<=2?2:profile.area<=4?3:profile.area<=8?4:6
  let tomorrowItems=showTomorrow?Math.min(state.tomorrow.length,large?2:capacity):0
  let todayItems=Math.min(state.today.length,Math.max(0,capacity-tomorrowItems))
  if(large&&state.today.length) {
    todayItems=Math.min(state.today.length,Math.max(1,capacity-tomorrowItems))
    tomorrowItems=Math.min(state.tomorrow.length,Math.max(0,capacity-todayItems))
  }
  const maxItems=todayItems+tomorrowItems
  return Object.freeze({available:true,direction,showHeading:direction==='vertical'&&profile.height>=150,showTime:true,showTomorrow,todayItems,tomorrowItems,maxItems,overflow:Math.max(0,total-maxItems)})
}

/** Allocate every drawable Reminders region before Canvas rendering begins. */
export function reminderLayout(profile,composition) {
  const pad=Math.max(9,Math.min(18,Math.round(Math.min(profile.width,profile.height)*.08)))
  const inner={x:pad,y:pad,width:Math.max(1,profile.width-pad*2),height:Math.max(1,profile.height-pad*2)}
  if(!composition.available)return Object.freeze({pad,emptyRect:inner,todayRect:null,tomorrowRect:null,footerRect:null,items:Object.freeze([])})
  const footerWidth=composition.direction==='horizontal'&&composition.overflow?Math.min(58,Math.max(42,inner.width*.13)):0
  const footerHeight=composition.direction==='vertical'&&composition.overflow?22:0
  const footerRect=composition.overflow?(composition.direction==='horizontal'
    ?{x:inner.x+inner.width-footerWidth,y:inner.y,width:footerWidth,height:inner.height}
    :{x:inner.x,y:inner.y+inner.height-footerHeight,width:inner.width,height:footerHeight}):null
  const content={x:inner.x,y:inner.y,width:Math.max(1,inner.width-footerWidth-(footerWidth?8:0)),height:Math.max(1,inner.height-footerHeight-(footerHeight?6:0))}
  if(composition.direction==='horizontal') {
    const count=Math.max(1,composition.todayItems+composition.tomorrowItems),gap=count>1?12:0,itemWidth=Math.max(1,(content.width-gap*(count-1))/count)
    const items=Array.from({length:count},(_,index)=>itemRegions({x:content.x+index*(itemWidth+gap),y:content.y,width:itemWidth,height:content.height},true))
    return Object.freeze({pad,emptyRect:null,todayRect:content,tomorrowRect:null,footerRect,items:Object.freeze(items)})
  }
  const headingHeight=composition.showHeading?30:0
  const tomorrowHeight=composition.tomorrowItems?Math.min(content.height*.42,headingHeight+composition.tomorrowItems*48):0
  const sectionGap=tomorrowHeight?10:0
  const todayHeight=composition.todayItems?Math.max(1,content.height-tomorrowHeight-sectionGap):0
  const todayRect=composition.todayItems?{x:content.x,y:content.y,width:content.width,height:todayHeight}:null
  const tomorrowRect=composition.tomorrowItems?{x:content.x,y:content.y+todayHeight+sectionGap,width:content.width,height:tomorrowHeight}:null
  const items=[]
  addSectionItems(items,todayRect,composition.todayItems,headingHeight,profile.width<230)
  addSectionItems(items,tomorrowRect,composition.tomorrowItems,headingHeight,profile.width<230)
  return Object.freeze({pad,emptyRect:null,todayRect,tomorrowRect,footerRect,items:Object.freeze(items)})
}

function addSectionItems(items,rect,count,headingHeight,stacked) {
  if(!rect||!count)return
  const rowsTop=rect.y+headingHeight,rowHeight=Math.max(1,(rect.height-headingHeight)/count)
  for(let index=0;index<count;index++)items.push(itemRegions({x:rect.x,y:rowsTop+index*rowHeight,width:rect.width,height:rowHeight},stacked))
}

function itemRegions(itemRect,stacked) {
  const inset=2,box={x:itemRect.x+inset,y:itemRect.y+inset,width:Math.max(1,itemRect.width-inset*2),height:Math.max(1,itemRect.height-inset*2)}
  if(stacked) {
    const timeHeight=Math.min(18,Math.max(1,box.height*.38))
    return Object.freeze({itemRect,timeRect:{x:box.x,y:box.y,width:box.width,height:timeHeight},titleRect:{x:box.x,y:box.y+timeHeight,width:box.width,height:Math.max(1,box.height-timeHeight)},stacked:true})
  }
  const timeWidth=Math.min(48,Math.max(38,box.width*.22)),gap=7
  return Object.freeze({itemRect,timeRect:{x:box.x,y:box.y,width:timeWidth,height:box.height},titleRect:{x:box.x+timeWidth+gap,y:box.y,width:Math.max(1,box.width-timeWidth-gap),height:box.height},stacked:false})
}

// Time remains structured. Title facts describe only atomic tokens that may be
// included verbatim or intentionally omitted as a whole at lower densities.
const dentist={time:'14:30',text:{full:'Dentist appointment at Madla Medical Centre',compact:'Dentist appointment at Madla',short:'Dentist at Madla',tiny:'Dentist'},protectedFacts:[{value:'Madla Medical Centre',kind:'location',optionalInTitle:true},{value:'Madla',kind:'location',optionalInTitle:true}]}
const project={time:'09:00',text:{full:'Project status meeting for Equinor IMR 26-050',compact:'Equinor IMR 26-050 meeting',short:'IMR 26-050 meeting',tiny:'IMR meeting'},protectedFacts:[{value:'Equinor',kind:'name',optionalInTitle:true},{value:'IMR 26-050',kind:'id',optionalInTitle:true}]}
const football={time:'18:00',text:{full:'Football training at Stavanger stadium',compact:'Football training in Stavanger',short:'Football training',tiny:'Football'},protectedFacts:[{value:'Stavanger',kind:'location',optionalInTitle:true}]}
const mum={time:'20:00',text:{full:'Call Mum about Sunday dinner plans',compact:'Call Mum about Sunday dinner',short:'Call Mum Sunday',tiny:'Call Mum'},protectedFacts:[{value:'Mum',kind:'name',optionalInTitle:false},{value:'Sunday',kind:'date-context',optionalInTitle:true}]}
const prescriptions={time:null,text:{full:'Pick up prescriptions from Madla pharmacy',compact:'Prescriptions from Madla pharmacy',short:'Pick up prescriptions',tiny:'Prescriptions'},protectedFacts:[{value:'Madla',kind:'location',optionalInTitle:true}]}

export const reminderStudioPresets=Object.freeze({
  empty:{today:[],tomorrow:[]},
  normal:{today:[dentist,football,mum],tomorrow:[project]},
  long:{today:[dentist,project,football,mum],tomorrow:[prescriptions,project]},
  extreme:{today:[project,dentist,football,mum,prescriptions],tomorrow:[project,dentist,football,mum]},
})
