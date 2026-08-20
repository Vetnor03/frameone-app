import test from 'node:test'
import assert from 'node:assert/strict'
import { legacyStudioVariant, responsiveCellProfile, STUDIO_MODULES, studioRenderStrategy } from '../app/lib/responsiveCellProfile.mjs'
import { moduleResponsivePolicies } from '../app/lib/moduleResponsivePolicies.mjs'
import { chooseReminderTextVariant, REMINDER_TEXT_ORDER, reminderStudioPresets } from '../app/lib/remindersResponsive.mjs'

test('all 16 rectangular geometries produce responsive profiles', () => {
  for (let colSpan=1;colSpan<=4;colSpan++) for (let rowSpan=1;rowSpan<=4;rowSpan++) {
    const profile=responsiveCellProfile(colSpan,rowSpan,colSpan*196,rowSpan*114)
    assert.equal(profile.colSpan,colSpan);assert.equal(profile.rowSpan,rowSpan)
    assert.equal(profile.area,colSpan*rowSpan);assert.ok(profile.width>0);assert.ok(profile.height>0)
  }
})

test('orientation uses the actual pixel rectangle rather than equal logical spans', () => {
  assert.equal(responsiveCellProfile(1,3,196,343).orientation,'portrait')
  assert.equal(responsiveCellProfile(3,1,589,114).orientation,'landscape')
  assert.equal(responsiveCellProfile(2,2,392,229).orientation,'landscape')
  assert.equal(responsiveCellProfile(4,4,785,458).orientation,'landscape')
  assert.equal(responsiveCellProfile(2,2,200,200).orientation,'square')
  assert.equal(responsiveCellProfile(1,1,106,100).orientation,'square')
})

test('four production geometries retain their legacy Studio variants', () => {
  assert.equal(legacyStudioVariant(4,1),'SMALL');assert.equal(legacyStudioVariant(2,2),'MEDIUM')
  assert.equal(legacyStudioVariant(4,2),'LARGE');assert.equal(legacyStudioVariant(4,4),'XL')
})

test('the other 12 geometries use the responsive renderer', () => {
  let responsive=0,legacy=0
  for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    const strategy=studioRenderStrategy('date',colSpan,rowSpan,colSpan*196,rowSpan*114)
    strategy.path==='responsive'?responsive++:legacy++
  }
  assert.equal(responsive,12);assert.equal(legacy,4)
})

test('all 128 module and geometry combinations have a render strategy', () => {
  assert.equal(STUDIO_MODULES.length,8);let covered=0
  for(const module of STUDIO_MODULES)for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    assert.ok(studioRenderStrategy(module,colSpan,rowSpan,colSpan*196,rowSpan*114).path);covered++
  }
  assert.equal(covered,128)
})

test('Reminders keeps four handmade anchors and owns the 12 adaptive paths', () => {
  const locked=new Map([['4x1','SMALL'],['2x2','MEDIUM'],['4x2','LARGE'],['4x4','XL']]);let adaptive=0
  for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    const strategy=studioRenderStrategy('reminders',colSpan,rowSpan,colSpan*196,rowSpan*114),expected=locked.get(`${colSpan}x${rowSpan}`)
    if(expected){assert.equal(strategy.path,'legacy');assert.equal(strategy.legacyVariant,expected)}
    else {assert.equal(strategy.path,'reminders-responsive');adaptive++}
  }
  assert.equal(adaptive,12)
})

test('all modules expose distinct responsive behavior contracts', () => {
  assert.deepEqual(Object.keys(moduleResponsivePolicies).sort(),[...STUDIO_MODULES].sort())
  assert.equal(moduleResponsivePolicies.reminders.variability,'high');assert.equal(moduleResponsivePolicies.reminders.textCompression,'ai-eligible-later')
  assert.equal(moduleResponsivePolicies.weather.variability,'bounded');assert.equal(moduleResponsivePolicies.weather.textCompression,'never')
  assert.ok(moduleResponsivePolicies.stocks.contentNature.includes('metrics'));assert.ok(moduleResponsivePolicies.stocks.contentNature.includes('visual'));assert.equal(moduleResponsivePolicies.stocks.textCompression,'never')
  assert.equal(moduleResponsivePolicies.date.variability,'low');assert.equal(moduleResponsivePolicies.date.textCompression,'never')
  assert.equal(moduleResponsivePolicies.countdown.textCompression,'ai-eligible-later')
})

test('reminder wording uses the longest measured variant that fits, then fallback', () => {
  const item={time:'14:30',text:{full:'a very long full version',compact:'compact wording',short:'short copy',tiny:'tiny'},protectedFacts:[]}
  const measure=value=>value.length*10
  assert.equal(chooseReminderTextVariant(item,250,measure).variant,'full')
  assert.equal(chooseReminderTextVariant(item,160,measure).variant,'compact')
  assert.equal(chooseReminderTextVariant(item,105,measure).variant,'short')
  assert.equal(chooseReminderTextVariant(item,45,measure).variant,'tiny')
  assert.equal(chooseReminderTextVariant(item,25,measure).variant,'fallback')
  assert.deepEqual(REMINDER_TEXT_ORDER,['full','compact','short','tiny'])
})

test('protected IDs are atomic during deterministic fallback', () => {
  const item={time:'09:00',text:{full:'Project status for IMR 26-050',compact:'Status for IMR 26-050',short:'IMR 26-050',tiny:'IMR 26-050'},protectedFacts:[{value:'IMR 26-050',kind:'id',optionalInTitle:true}]}
  const measure=value=>value.length
  assert.equal(chooseReminderTextVariant(item,11,measure).text,'IMR 26-050')
  assert.equal(chooseReminderTextVariant(item,8,measure).text,'')
  for(const width of [1,5,8,9])assert.doesNotMatch(chooseReminderTextVariant(item,width,measure).text,/IMR 26(?:-|$)/)
})

test('time is structured and optional location can be omitted at low density', () => {
  const dentist=reminderStudioPresets.normal.today[0]
  assert.equal(dentist.time,'14:30');assert.ok(dentist.protectedFacts.some(fact=>fact.value==='Madla'&&fact.optionalInTitle))
  assert.equal(dentist.text.tiny,'Dentist');assert.doesNotMatch(dentist.text.tiny,/Madla/)
  assert.equal(chooseReminderTextVariant(dentist,8,value=>value.length).text,'Dentist')
})

test('non-optional title facts are never dropped by authored variants or fallback', () => {
  const mum=reminderStudioPresets.normal.today[2],measure=value=>value.length
  for(let width=0;width<8;width++){
    const displayed=chooseReminderTextVariant(mum,width,measure).text
    assert.ok(displayed===''||displayed.includes('Mum'));assert.notEqual(displayed,'Call…')
  }
  assert.equal(chooseReminderTextVariant(mum,3,measure).text,'Mum')
  assert.equal(chooseReminderTextVariant(mum,2,measure).text,'')
})

test('authored variants missing a required fact are ineligible', () => {
  const item={time:null,text:{full:'Call Mum tomorrow',compact:'Call Mum',short:'Call Mum',tiny:'Call'},protectedFacts:[{value:'Mum',kind:'name',optionalInTitle:false}]}
  assert.equal(chooseReminderTextVariant(item,4,value=>value.length).text,'Mum')
  assert.equal(chooseReminderTextVariant(item,2,value=>value.length).text,'')
})

test('deterministic reminder states cover empty, normal, long and extreme content', () => {
  assert.deepEqual(Object.keys(reminderStudioPresets),['empty','normal','long','extreme'])
  assert.equal(reminderStudioPresets.empty.today.length,0);assert.ok(reminderStudioPresets.normal.today.length>=3)
  assert.ok(reminderStudioPresets.long.tomorrow.length);assert.ok(reminderStudioPresets.extreme.today.length>reminderStudioPresets.normal.today.length)
})
