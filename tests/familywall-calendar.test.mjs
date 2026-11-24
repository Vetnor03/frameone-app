import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeFamilyWallCalendar } from '../app/lib/integrations/familywall/normalize.ts'
import { buildFamilyWallCalendarItems } from '../app/lib/device/remindersFeed.ts'

test('FamilyWall normalizes offset timestamps, all-day dates, recurring instances and strips private notes', () => {
  const rows=normalizeFamilyWallCalendar({events:[
    {id:'event/1',title:'Dinner',start:'2026-11-26T18:00:00+01:00',end:'2026-11-26T19:00:00+01:00',notes:'private'},
    {id:'event/1',title:'Dinner',start:'2026-11-27T18:00:00+01:00'},
    {id:'event/2',title:'Holiday',start_date:'2026-11-26',all_day:true},
  ]})
  assert.equal(rows.length,3)
  assert.equal(rows[0].starts_at,'2026-11-26T17:00:00.000Z')
  assert.equal(rows[0].due_at,'2026-11-26T18:00:00.000Z')
  assert.notEqual(rows[0].external_id,rows[1].external_id)
  assert.equal(rows[2].raw.date,'2026-11-26')
  assert.equal(rows[2].raw.all_day,true)
  assert.doesNotMatch(JSON.stringify(rows),/private/)
  const frame=buildFamilyWallCalendarItems(rows,'2026-11-26','2026-12-01','Europe/Oslo',new Date('2026-11-26T12:00:00Z'))
  assert.equal(frame.length,3)
  assert.equal(frame[0].display_time,'18:00')
  assert.equal(frame[2].display_time,null)
  assert.ok(frame.every(item=>item.source==='familywall'))
})
test('Unsupported or partial calendar payload never becomes an empty successful snapshot',()=>{
  assert.throws(()=>normalizeFamilyWallCalendar({events:[{title:'unknown'}]}))
  assert.throws(()=>normalizeFamilyWallCalendar({events:[],has_more:true}))
  assert.throws(()=>normalizeFamilyWallCalendar('unknown text'))
  assert.throws(()=>normalizeFamilyWallCalendar({events:[{id:'a',title:'Dinner',start:'2026-11-26T18:00:00'}]}))
  assert.deepEqual(normalizeFamilyWallCalendar({events:[]}),[])
})
