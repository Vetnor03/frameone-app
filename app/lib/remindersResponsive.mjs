export const REMINDER_TEXT_ORDER=Object.freeze(['full','compact','short','tiny'])

/** Selects verbosity only after composition has allocated a real pixel width. */
export function chooseReminderTextVariant(text,availableWidth,measure) {
  for(const variant of REMINDER_TEXT_ORDER) if(text[variant]&&measure(text[variant])<=availableWidth)return {variant,text:text[variant]}
  const source=text.tiny||text.short||text.compact||text.full||''
  if(measure(source)<=availableWidth)return {variant:'tiny',text:source}
  const ellipsis='…'
  if(measure(ellipsis)>availableWidth)return {variant:'fallback',text:''}
  const words=source.split(/\s+/).filter(Boolean);let fitted=''
  for(const word of words){const candidate=fitted?`${fitted} ${word}`:word;if(measure(candidate+ellipsis)>availableWidth)break;fitted=candidate}
  if(fitted)return {variant:'fallback',text:fitted+ellipsis}
  let clipped='';for(const character of source){if(measure(clipped+character+ellipsis)>availableWidth)break;clipped+=character}
  return {variant:'fallback',text:clipped+ellipsis}
}

export function reminderComposition(profile,state) {
  const total=state.today.length+state.tomorrow.length
  if(!total)return {direction:'vertical',showHeading:false,showTime:false,showTomorrow:false,maxItems:0}
  const landscape=profile.orientation==='landscape'
  const maxItems=profile.density==='micro'?1:profile.density==='compact'?2:profile.density==='normal'?4:6
  return {direction:landscape&&profile.rowSpan<=2?'horizontal':'vertical',showHeading:profile.height>=150,showTime:true,showTomorrow:profile.area>=8&&state.tomorrow.length>0,maxItems}
}

const dentist={time:'14:30',text:{full:'Dentist appointment at Madla Medical Centre',compact:'Dentist appointment at Madla',short:'Dentist at Madla',tiny:'Dentist'},protectedFacts:['14:30','Madla','Madla Medical Centre']}
const project={time:'09:00',text:{full:'Project status meeting for Equinor IMR 26-050',compact:'Equinor IMR 26-050 meeting',short:'IMR 26-050 meeting',tiny:'IMR meeting'},protectedFacts:['09:00','Equinor','IMR 26-050']}
const football={time:'18:00',text:{full:'Football training at Stavanger stadium',compact:'Football training in Stavanger',short:'Football training',tiny:'Football'},protectedFacts:['18:00','Stavanger']}
const mum={time:'20:00',text:{full:'Call Mum about Sunday dinner plans',compact:'Call Mum about Sunday dinner',short:'Call Mum Sunday',tiny:'Call Mum'},protectedFacts:['20:00','Mum','Sunday']}
const prescriptions={time:null,text:{full:'Pick up prescriptions from Madla pharmacy',compact:'Prescriptions from Madla pharmacy',short:'Pick up prescriptions',tiny:'Prescriptions'},protectedFacts:['Madla']}

export const reminderStudioPresets=Object.freeze({
  empty:{today:[],tomorrow:[]},
  normal:{today:[dentist,football,mum],tomorrow:[project]},
  long:{today:[dentist,project,football,mum],tomorrow:[prescriptions,project]},
  extreme:{today:[project,dentist,football,mum,prescriptions],tomorrow:[project,dentist,football,mum]},
})
