import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { safeCity, validDate, prayerClock, aladhanUrl, aladhanCoordinatesUrl, normalizeAladhan } from '../app/lib/integrations/aladhan/preview.mjs'
import { verifiedNorwegianPlace } from '../app/lib/integrations/aladhan/location.mjs'

const args={city:'Stavanger',date:'2026-11-18',asrMethod:1,method:3}
const data=(school='STANDARD')=>({code:200,data:{
  timings:{Fajr:'05:10',Sunrise:'08:00',Dhuhr:'12:15',Asr:'14:10',Sunset:'16:25',Maghrib:'16:25',Isha:'18:30'},
  date:{gregorian:{date:'18-11-2026'},hijri:{date:'07-06-1448',holidays:['Sample']}},
  meta:{latitude:58.97,longitude:5.73,timezone:'Europe/Oslo',school,method:{id:3,name:'Muslim World League'},latitudeAdjustmentMethod:'ANGLE_BASED'},
}})
test('Norway city and Asr 1x/2x map to AlAdhan school 0/1',()=>{
 const u=aladhanUrl({...args,highLatitude:3})
 assert.equal(u.origin,'https://api.aladhan.com')
 assert.equal(u.pathname,'/v1/timingsByCity/18-11-2026')
 assert.equal(u.searchParams.get('country'),'NO')
 assert.equal(u.searchParams.get('timezonestring'),'Europe/Oslo')
 assert.equal(u.searchParams.get('school'),'0')
 assert.equal(aladhanUrl({...args,asrMethod:2,highLatitude:1}).searchParams.get('school'),'1')
})
test('validated preview includes five prayers, sunrise, sunset and Hijri labels',()=>{
 const x=normalizeAladhan(data(),args)
 assert.deepEqual(x.times.map(i=>i.name),['Fajr','Sunrise','Dhuhr','Asr','Sunset','Maghrib','Isha'])
 assert.equal(x.provider,'AlAdhan')
 assert.equal(x.times[3].time,'14:10')
 assert.deepEqual(x.hijri.holidays,['Sample'])
 assert.equal(normalizeAladhan(data('HANAFI'),{...args,asrMethod:2}).asrMethod,2)
})
test('rejects unsupported clocks, cities, dates and mismatched upstream methods',()=>{
 assert.equal(prayerClock('5:08 (CET)'),'05:08')
 assert.equal(prayerClock('24:00'),null)
 assert.equal(validDate('2026-02-29'),false)
 assert.equal(validDate('2028-02-29'),true)
 assert.equal(safeCity('Stjørdal'),'Stjørdal')
 assert.equal(safeCity('Oslo&country=Russia'),null)
 const wrong=data()
 wrong.data.timings.Asr='-'
 assert.throws(()=>normalizeAladhan(wrong,args),/Incomplete/)
 assert.throws(()=>normalizeAladhan(data('HANAFI'),args),/Asr/)
 assert.throws(()=>normalizeAladhan(data(),{...args,method:13}),/method/)
 const wrongCountry=data();wrongCountry.data.meta.latitude=40
 assert.throws(()=>normalizeAladhan(wrongCountry,args),/Norway/)
 const wrongDate=data();wrongDate.data.date.gregorian.date='17-11-2026'
 assert.throws(()=>normalizeAladhan(wrongDate,args),/date/)
})
test('preview API stays read-only even when AlAdhan Connect is enabled',()=>{
 const cat=readFileSync(new URL('../app/lib/integrations/catalog.ts',import.meta.url),'utf8')
 const home=readFileSync(new URL('../app/HomePageClient.tsx',import.meta.url),'utf8')
 const route=readFileSync(new URL('../app/api/integrations/aladhan/preview/route.ts',import.meta.url),'utf8')
 assert.match(cat,/key: 'aladhan'[\s\S]*?connectable: true/)
 assert.match(home,/setAladhanPreviewOpen\(true\)/)
 assert.match(route,/getAuthenticatedUserId\(req\)/)
 assert.match(route,/revalidate:21600/)
 assert.doesNotMatch(route,/from\('integration_items'\)|from\('user_integrations'\)|device_settings|remindersFeed|BONNETID_API_TOKEN/)
})

test('verified Norwegian geocoding resolves Stavanger and rejects wrong or fuzzy places', () => {
  const results = { results: [
    { name: 'Stavanger', country_code: 'NO', latitude: 58.96997, longitude: 5.7331 },
    { name: 'Stavanger', country_code: 'US', latitude: 45, longitude: -90 },
  ] }
  assert.deepEqual(verifiedNorwegianPlace(results, 'Stavanger'),
    { name: 'Stavanger', latitude: 58.96997, longitude: 5.7331 })
  assert.throws(() => verifiedNorwegianPlace(results, 'Oslo'), /Could not find/)
  assert.throws(() => verifiedNorwegianPlace({ results: [
    { name: 'Stavanger', country_code: 'NO', latitude: 35, longitude: 5 },
  ] }, 'Stavanger'), /Could not find/)
  assert.throws(() => verifiedNorwegianPlace(results, 'Oslo&lat=70'), /Enter a Norwegian/)
})

test('Norway coordinates go to the AlAdhan coordinate endpoint, not city-name geocoding', () => {
  const url = aladhanCoordinatesUrl({
    date: args.date, latitude: 58.96997, longitude: 5.7331, asrMethod: 1, method: 3, highLatitude: 3,
  })
  assert.equal(url.pathname, '/v1/timings/18-11-2026')
  assert.equal(url.searchParams.get('latitude'), '58.96997')
  assert.equal(url.searchParams.get('longitude'), '5.7331')
  assert.equal(url.searchParams.get('timezonestring'), 'Europe/Oslo')
  assert.equal(url.searchParams.get('school'), '0')
  assert.equal(aladhanCoordinatesUrl({
    date: args.date, latitude: 58.96997, longitude: 5.7331, asrMethod: 2, method: 3, highLatitude: 3,
  }).searchParams.get('school'), '1')
  assert.throws(() => aladhanCoordinatesUrl({
    date: args.date, latitude: 40, longitude: 5.7331, asrMethod: 1, method: 3, highLatitude: 3,
  }), /Invalid AlAdhan coordinates/)
})

test('AlAdhan missing city coordinates no longer blocks verified Norwegian positions', () => {
  const payload = data()
  delete payload.data.meta.latitude
  delete payload.data.meta.longitude
  const selection = { ...args, coordinates: { latitude: 58.96997, longitude: 5.7331 } }
  const result = normalizeAladhan(payload, selection)
  assert.deepEqual(result.coordinates, selection.coordinates)
  // A contradictory provider response must still be rejected.
  payload.data.meta.latitude = 40
  payload.data.meta.longitude = 5.7331
  assert.throws(() => normalizeAladhan(payload, selection), /coordinates do not match/)
})

test('AlAdhan previews and connecting now share the same Norwegian coordinates lookup', () => {
  const backend = readFileSync(new URL('../app/lib/integrations/aladhan/server.ts', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../app/api/integrations/aladhan/preview/route.ts', import.meta.url), 'utf8')
  assert.match(backend, /resolveNorwegianCity\(selection\.city\)/)
  assert.match(backend, /aladhanCoordinatesUrl\(/)
  assert.match(route, /resolveNorwegianCity\(city\)/)
  assert.match(route, /aladhanCoordinatesUrl\(/)
  const modal = readFileSync(new URL('../app/components/AladhanPreviewModal.tsx', import.meta.url), 'utf8')
  assert.match(modal, /Juster beregningene/)
  assert.match(modal, /aria-expanded=\{advanced\}/)
  assert.match(modal, /KOBLE TIL/)
  assert.doesNotMatch(modal, /type="date"/)
})
