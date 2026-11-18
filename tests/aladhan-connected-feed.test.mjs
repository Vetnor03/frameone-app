import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { osloYmd, followingDays, osloWallClockToIso } from '../app/lib/integrations/aladhan/time.mjs'
import { buildAladhanPrayerItems } from '../app/lib/device/remindersFeed.ts'
import { isUpcomingIntegratedCalendarItem } from '../app/lib/device/calendarVisibility.ts'
import { physicalModuleDeadlines, physicalRenderDigest } from '../app/lib/device/contentSignature.mjs'

const ymd = '2026-11-18'
const row = (name, time, date=ymd) => ({
  id: name+'-'+date, user_id:'tester', provider:'aladhan',
  external_id:'stavanger:'+date+':'+name.toLowerCase(),
  title:name, body:null, starts_at:osloWallClockToIso(date,time), due_at:null, priority:5,
  raw:{source:'aladhan',type:'prayer_time',date,time,method:3,asr_method:1,calculated:true},
})
const fixtures = [row('Fajr','05:31'),row('Soloppgang','07:43'),row('Dhuhr','12:15'),row('Asr','13:30'),
  row('Solnedgang','16:31'),row('Maghrib','16:32'),row('Isha','18:00')]
const remaining = time => buildAladhanPrayerItems(fixtures,ymd,'2026-11-24','Europe/Oslo',new Date(time))

test('local Norway conversion survives DST and does not invent nonexistent times', () => {
  assert.equal(osloWallClockToIso('2026-11-18','12:15'),'2026-11-18T11:15:00.000Z')
  assert.equal(osloWallClockToIso('2026-07-01','12:15'),'2026-07-01T10:15:00.000Z')
  assert.equal(osloWallClockToIso('2026-03-29','02:30'),null)
  assert.equal(osloYmd(new Date('2026-11-18T23:15:00Z')),'2026-11-19')
  assert.deepEqual(followingDays(3,new Date('2026-12-31T14:00:00Z')),['2026-12-31','2027-01-01','2027-01-02'])
})

test('AlAdhan records join Reminders without impersonating IRN', () => {
  assert.deepEqual(remaining('2026-11-18T11:14:00Z').map(x=>x.title),['Dhuhr','Asr','Solnedgang','Maghrib','Isha'])
  assert.deepEqual(remaining('2026-11-18T11:15:00Z').map(x=>x.title),['Asr','Solnedgang','Maghrib','Isha'])
  assert.equal(remaining('2026-11-18T11:15:00Z').every(x=>x.source==='aladhan'),true)
  assert.equal(buildAladhanPrayerItems([{...fixtures[0],raw:{source:'bonnetid',type:'prayer_time'}}],ymd,ymd,'Europe/Oslo').length,0)
  assert.equal(isUpcomingIntegratedCalendarItem('aladhan',ymd,'12:15',ymd,'12:14'),true)
  assert.equal(isUpcomingIntegratedCalendarItem('aladhan',ymd,'12:15',ymd,'12:15'),false)
  assert.equal(isUpcomingIntegratedCalendarItem('remind',ymd,'12:15',ymd,'12:16'),true)
})

test('existing physical smart scheduler wakes for every AlAdhan boundary', () => {
  const settings={powerSaver:true,cells:[{module:'reminders',col:0,row:0,w:400,h:240}],modules:{}}
  const before=Date.parse('2026-11-18T11:14:00Z')
  const source={reminders:{items:remaining('2026-11-18T11:14:00Z')}}
  const first=physicalModuleDeadlines({settings,sources:source,now:before}).reminders
    .find(x=>x.reason==='reminder_boundary')
  assert.deepEqual(first,{at:Date.parse('2026-11-18T11:15:00Z'),type:'hard',reason:'reminder_boundary'})
  const after=Date.parse('2026-11-18T11:15:00Z')
  const updated={reminders:{items:remaining('2026-11-18T11:15:00Z')}}
  const next=physicalModuleDeadlines({settings,sources:updated,now:after}).reminders.find(x=>x.reason==='reminder_boundary')
  assert.equal(next.at,Date.parse('2026-11-18T12:30:00Z'))
  assert.notEqual(
    physicalRenderDigest('reminders',source.reminders,settings.cells[0],{},before),
    physicalRenderDigest('reminders',updated.reminders,settings.cells[0],{},after))
})

test('AlAdhan is a real but experimental Connect source, with own storage lifecycle', () => {
  const cat=readFileSync(new URL('../app/lib/integrations/catalog.ts',import.meta.url),'utf8')
  const home=readFileSync(new URL('../app/HomePageClient.tsx',import.meta.url),'utf8')
  const backend=readFileSync(new URL('../app/lib/integrations/aladhan/server.ts',import.meta.url),'utf8')
  const physical=readFileSync(new URL('../app/api/device/reminders/route.ts',import.meta.url),'utf8')
  assert.match(cat,/key: 'aladhan'[\s\S]*?status: 'experimental', connectable: true/)
  assert.match(home,/if \(source === 'aladhan'\) return 'AlAdhan'/)
  assert.match(home,/changeFrameIntegration\('aladhan', \{ enabled: true \}\)/)
  assert.match(home,/sourceFilter !== 'aladhan'/)
  assert.match(home,/integrations\/aladhan\/sync/)
  assert.match(backend,/provider: PROVIDER,/)
  assert.match(backend,/eq\('provider', PROVIDER\)/)
  assert.match(backend,/onConflict: 'user_id,provider,external_id'/)
  assert.match(physical,/buildAladhanPrayerItems/)
  assert.match(physical,/syncAladhanIfStale/)
  assert.match(physical,/item\.source !== 'aladhan'/)
  assert.doesNotMatch(backend,/BONNETID_API_TOKEN|api\.bonnetid\.no/)
})
