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
  if(!total)return {direction:'vertical',showHeading:false,showTime:false,showTomorrow:false,maxItems:0}
  const landscape=profile.orientation==='landscape'
  const maxItems=profile.density==='micro'?1:profile.density==='compact'?2:profile.density==='normal'?4:6
  return {direction:landscape&&profile.rowSpan<=2?'horizontal':'vertical',showHeading:profile.height>=150,showTime:true,showTomorrow:profile.area>=8&&state.tomorrow.length>0,maxItems}
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
