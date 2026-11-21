import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeGoogleTask } from '../app/lib/integrations/google-tasks/normalize.mjs'
import { fetchGoogleTaskListsAndTasks, GOOGLE_TASKS_SCOPES } from '../app/lib/integrations/google-tasks/client.ts'
import { googleCalendarAuthUrl, GOOGLE_CALENDAR_SCOPES } from '../app/lib/integrations/google-calendar/client.ts'

test('Google Tasks grants only read-only Tasks access, not Calendar or write', () => {
  const oldId = process.env.GOOGLE_CALENDAR_CLIENT_ID
  const oldUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI
  try {
    process.env.GOOGLE_CALENDAR_CLIENT_ID = 'test-client'
    process.env.GOOGLE_CALENDAR_REDIRECT_URI = 'https://re-mind.no/api/integrations/google-calendar/callback'
    const taskUrl = new URL(googleCalendarAuthUrl('signed-state','challenge',GOOGLE_TASKS_SCOPES))
    assert.equal(taskUrl.searchParams.get('scope'), 'https://www.googleapis.com/auth/tasks.readonly')
    assert.equal(taskUrl.searchParams.get('code_challenge_method'),'S256')
    assert.equal(taskUrl.searchParams.get('redirect_uri'),process.env.GOOGLE_CALENDAR_REDIRECT_URI)
    const calendarUrl = new URL(googleCalendarAuthUrl('signed-state','challenge'))
    assert.equal(calendarUrl.searchParams.get('scope'), GOOGLE_CALENDAR_SCOPES.join(' '))
    assert.ok(!calendarUrl.searchParams.get('scope').includes('tasks.readonly'))
  } finally {
    if(oldId === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_ID
    else process.env.GOOGLE_CALENDAR_CLIENT_ID=oldId
    if(oldUri === undefined) delete process.env.GOOGLE_CALENDAR_REDIRECT_URI
    else process.env.GOOGLE_CALENDAR_REDIRECT_URI=oldUri
  }
})

test('Google Tasks due is date-only; no Norway timezone shift', () => {
  const item = normalizeGoogleTask({id:'x', title:' Bring parcel ', due:'2026-03-29T00:00:00.000Z'}, 'home')
  assert.equal(item.external_id,'home:x')
  assert.equal(item.title,'Bring parcel')
  assert.equal(item.raw.date,'2026-03-29')
  assert.equal(item.raw.all_day,true)
  assert.equal(item.raw.floating_time,undefined)
  assert.equal(item.starts_at,'2026-03-29T12:00:00.000Z')
})

test('Skipped completed, deleted and undated tasks; namespaced IDs', () => {
  const t = {id:'x',title:'Check',due:'2026-11-21T00:00:00.000Z'}
  assert.equal(normalizeGoogleTask({...t,status:'completed'},'a'),null)
  assert.equal(normalizeGoogleTask({...t,deleted:true},'a'),null)
  assert.equal(normalizeGoogleTask({...t,due:undefined},'a'),null)
  assert.equal(normalizeGoogleTask({...t,title:'  '},'a'),null)
  assert.notEqual(normalizeGoogleTask(t,'a').external_id,normalizeGoogleTask(t,'b').external_id)
})

test('Google Tasks paginates every task list before allowing cache replacement',async()=>{
  const original = globalThis.fetch
  const requests=[]
  try{
    globalThis.fetch = async(url) => {
      const u = new URL(String(url))
      requests.push(u)
      assert.equal(u.hostname,'tasks.googleapis.com')
      if(u.pathname.endsWith('/users/@me/lists'))return new Response(JSON.stringify({items:[{id:'one',title:'Personal'},{id:'two',title:'Work'}]}),{status:200})
      if(u.pathname.endsWith('/lists/one/tasks') && !u.searchParams.has('pageToken')){
        assert.equal(u.searchParams.get('showCompleted'),'false')
        return new Response(JSON.stringify({items:[{id:'a',title:'Task 1',due:'2026-11-21T00:00:00Z'}],nextPageToken:'more'}),{status:200})
      }
      if(u.searchParams.get('pageToken')==='more')return new Response(JSON.stringify({items:[{id:'b',title:'Task 2',due:'2026-11-22T00:00:00Z'}]}),{status:200})
      return new Response(JSON.stringify({items:[{id:'c',title:'Task 3',due:'2026-11-23T00:00:00Z'}]}),{status:200})
    }
    const results=await fetchGoogleTaskListsAndTasks('fake-token')
    assert.deepEqual(results.map(x=>x.listId+':'+x.task.id),['one:a','one:b','two:c'])
    assert.equal(requests.length,4)
  } finally {globalThis.fetch=original}
})

test('Approval gate, independent OAuth and existing Reminders module are wired',()=>{
  const files=[
    'app/lib/integrations/google-tasks/server.ts',
    'app/api/integrations/google-tasks/connect/route.ts',
    'app/api/integrations/google-calendar/callback/route.ts',
    'app/api/device/reminders/route.ts',
    'app/HomePageClient.tsx',
    'app/lib/integrations/catalog.ts',
  ].map(file=>readFileSync(new URL('../'+file,import.meta.url),'utf8'))
  assert.match(files[0],/GOOGLE_TASKS_TEST_USER_IDS/)
  assert.match(files[0],/GOOGLE_TASKS_PUBLIC_ENABLED/)
  assert.match(files[1],/googleTasksAllowedForUser/)
  assert.match(files[2],/verifyGoogleOAuthState/)
  assert.match(files[2],/connectGoogleTasksForUser/)
  assert.match(files[3],/buildGoogleTasksReminderItems/)
  assert.match(files[4],/\/api\/integrations\/google-tasks\/connect/)
  assert.match(files[4],/'google-tasks'/)
  assert.match(files[5],/key: 'google-tasks'.*under-evaluation/)
})
