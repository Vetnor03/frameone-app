import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { test } from 'node:test'
import { buildSpondReminderItems, buildWasteCollectionItems } from '../app/lib/device/remindersFeed.ts'

const route = readFileSync(new URL('../app/api/device/reminders/route.ts', import.meta.url), 'utf8')
const feed = readFileSync(new URL('../app/lib/device/remindersFeed.ts', import.meta.url), 'utf8')

test('device reminders route keeps manual reminder query independent and returns the expected response shape', () => {
  assert.match(route, /\.from\('reminders'\)[\s\S]*?\.select\('id, device_id, title, due_date, due_time, repeat_type, custom_repeat_days, is_done'\)/)
  assert.match(route, /const manualItems:[\s\S]*?buildOccurrencesForRow[\s\S]*?source: 'remind' as const/)
  assert.match(route, /const physicalItems = selectedItems\.map\(toPhysicalDeviceReminderItem\)/)
  assert.match(route, /return NextResponse\.json\(\{ items: physicalItems \}\)/)
  assert.doesNotMatch(route, /all_items:|count: selectedItems\.length|today: todayYmd|timezone: timeZone/)
  assert.ok(route.includes('const allItems = [...manualItems, ...integrationItems]'))
  assert.match(route, /sort\(compareReminderItems\)/)
})



test('device reminders physical response maps selected items to the compact nine-field DTO only', () => {
  const dtoSection = route.slice(route.indexOf('function toPhysicalDeviceReminderItem'), route.indexOf('function isTimedOccurrenceAlreadyPassed'))
  const returnedKeys = Array.from(dtoSection.matchAll(/^    ([a-z_]+): item\.[a-z_]+,/gm)).map((match) => match[1])
  assert.deepEqual(returnedKeys, [
    'reminder_id',
    'title',
    'occurrence_date',
    'display_date',
    'days_until',
    'is_overdue',
    'repeat',
    'due_time',
    'display_time',
  ])
  for (const forbidden of ['raw', 'source', 'provider', 'external_id', 'url', 'area', 'integration']) {
    assert.doesNotMatch(dtoSection, new RegExp(`\\b${forbidden}\\b`))
  }
})

test('device reminders diagnostics are compact and do not log private reminder content', () => {
  assert.match(route, /compact_json_byte_size: compactJsonByteSize/)
  assert.match(route, /selected_item_count: physicalItems\.length/)
  assert.match(route, /includes_local_events: selectedItems\.some\(\(item\) => item\.source === 'local-events'\)/)
  const logSection = route.slice(route.indexOf("console.info('[device/reminders] compact response'"), route.indexOf('return NextResponse.json({ items: physicalItems })'))
  assert.doesNotMatch(logSection, /title|raw|external_id|token|encrypted_credentials/)
})

test('device reminders continue to collect manual, Waste, Spond, Teams, and Local Events before compacting', () => {
  assert.match(route, /const manualItems:[\s\S]*?source: 'remind' as const/)
  assert.match(route, /spondItems = buildSpondReminderItems/)
  assert.match(route, /teamsItems = buildTeamsMeetingItems/)
  assert.match(route, /wasteItems = buildWasteCollectionItems/)
  assert.match(route, /localEventItems = buildLocalEventFrameItem/)
  assert.match(route, /const integrationItems = \[\s*\.\.\.spondItems,\s*\.\.\.teamsItems,\s*\.\.\.wasteItems,\s*\.\.\.localEventItems,\s*\]\.sort\(compareReminderItems\)/)
})

test('device reminders sorting and two-date-group selection are unchanged before compacting', () => {
  assert.match(route, /const allItems = \[\.\.\.manualItems, \.\.\.integrationItems\][\s\S]*?\.sort\(compareReminderItems\)[\s\S]*?\.filter/)
  assert.match(route, /const selectedItems = selectReminderDisplayGroups\(allItems, limit\)/)
  assert.match(feed, /const selectedGroupKeys: string\[\] = \[\][\s\S]*?if \(selectedGroupKeys\.length >= 2\) break/)
})

test('no firmware, AI Assistant, or frame-config files are modified by this reminder web fix', () => {
  const changedFiles = execSync('git diff --name-only HEAD', { encoding: 'utf8' })
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean)
  assert.deepEqual(changedFiles.filter((file) => file.startsWith('frame/') || file.startsWith('public/firmware/')), [])
  assert.deepEqual(changedFiles.filter((file) => file.includes('ai-assistant') || file.includes('interpret-ai-assistant')), [])
  assert.deepEqual(changedFiles.filter((file) => file.includes('frame-config')), [])
})

test('device reminders default to cached integration rows unless sync is explicitly requested', () => {
  assert.match(route, /function normalizeSkipSync\(raw: string \| null\) \{\s*if \(raw == null\) return true/)
  assert.match(route, /if \(v === '0' \|\| v === 'false' \|\| v === 'no'\) return false/)
  assert.match(route, /const skipSync = normalizeSkipSync\(url\.searchParams\.get\('skip_sync'\)\)/)
})

test('optional reminder providers are isolated with provider-level try/catch blocks', () => {
  for (const provider of ['spond', 'teams', 'waste']) {
    assert.ok(route.includes(`logOptionalReminderProviderFailure('${provider}'`))
  }
  assert.match(route, /\.eq\('provider', 'edge-of-norway'\)[\s\S]*?logOptionalReminderProviderFailure\('local-events'/)
  assert.match(route, /if \(integrationItemsError\) throw integrationItemsError/)
  assert.match(route, /if \(teamsIntegrationItemsError\) throw teamsIntegrationItemsError/)
  assert.match(route, /if \(wasteIntegrationItemsError\) throw wasteIntegrationItemsError/)
  assert.match(route, /if \(localEventsError\) throw localEventsError/)
  assert.doesNotMatch(route, /return NextResponse\.json\(\{ error: (integrationItemsError|teamsIntegrationItemsError|wasteIntegrationItemsError|localEventsError)\.message \}/)
})

test('provider errors cannot turn an otherwise successful device reminder response into HTTP 500', () => {
  const successResponseIndex = route.indexOf('return NextResponse.json({ items: physicalItems })')
  assert.notEqual(successResponseIndex, -1)
  for (const provider of ['spond', 'teams', 'waste', 'local-events']) {
    const catchIndex = route.indexOf(`logOptionalReminderProviderFailure('${provider}'`)
    assert.ok(catchIndex > -1, `missing ${provider} optional failure logging`)
    assert.ok(catchIndex < successResponseIndex, `${provider} catch should continue to success response`)
  }
})

test('Local Events code is fail-soft and limited in the device reminders endpoint and feed types', () => {
  assert.match(route, /logOptionalReminderProviderFailure\('local-events'/)
  assert.match(feed, /buildLocalEventFrameItem/)
  assert.match(feed, /DeviceReminderSource = 'spond' \| 'teams' \| 'waste' \| 'remind' \| 'local-events'/)
})

test('Local Events diagnostic remains separate from reminders, so diagnostic failures are not imported or called', () => {
  const diagnostic = readFileSync(new URL('../app/api/integrations/local-events/diagnostic/route.ts', import.meta.url), 'utf8')
  assert.match(diagnostic, /Local Events diagnostic failed/)
  assert.doesNotMatch(route, /diagnostic|fetchLocalEvents|parseLocalEvents/)
})

test('Spond builder only returns Spond event reminders and excludes unrelated Local Events-shaped rows', () => {
  const items = buildSpondReminderItems([
    { id: '1', user_id: 'u1', provider: 'spond', external_id: 'event:1', title: 'Practice', body: null, starts_at: '2026-07-13T10:00:00.000Z', due_at: null, priority: null, raw: null },
    { id: '2', user_id: 'u1', provider: 'local_events', external_id: 'local:1', title: 'Town concert', body: null, starts_at: '2026-07-13T11:00:00.000Z', due_at: null, priority: null, raw: { source: 'local_events' } },
  ], '2026-07-12', '2026-08-01', 'UTC', false)
  assert.equal(items.length, 1)
  assert.equal(items[0].source, 'spond')
  assert.equal(items[0].title, 'Practice')
})

test('Waste builder requires explicit waste raw metadata and excludes Local Events rows', () => {
  const items = buildWasteCollectionItems([
    { id: '1', user_id: 'u1', provider: 'waste', external_id: 'waste:1', title: 'Paper', body: null, starts_at: '2026-07-14T00:00:00.000Z', due_at: null, priority: null, raw: { source: 'waste', type: 'waste_collection', date: '2026-07-14', waste_fraction: 'papir' } },
    { id: '2', user_id: 'u1', provider: 'local_events', external_id: 'local:1', title: 'Market', body: null, starts_at: '2026-07-14T11:00:00.000Z', due_at: null, priority: null, raw: { source: 'local_events', type: 'event' } },
  ], '2026-07-12', '2026-08-01', 'UTC', false)
  assert.equal(items.length, 1)
  assert.equal(items[0].source, 'waste')
  assert.equal(items[0].title, 'Paper')
})

test('empty successful reminder queries return an empty successful response rather than an error path', () => {
  assert.match(route, /const rows = Array\.isArray\(data\) \? \(data as ReminderRow\[\]\) : \[\]/)
  assert.ok(route.includes('const allItems = [...manualItems, ...integrationItems]'))
  assert.match(route, /sort\(compareReminderItems\)/)
  assert.match(route, /const physicalItems = selectedItems\.map\(toPhysicalDeviceReminderItem\)/)
  assert.match(route, /return NextResponse\.json\(\{ items: physicalItems \}\)/)
})

test('existing user and frame ownership isolation is preserved', () => {
  assert.match(route, /async function sharedDeviceIdsForFrame/)
  assert.match(route, /\.from\('devices'\)[\s\S]*?\.eq\('device_id', deviceId\)/)
  assert.match(route, /\.from\('reminders'\)[\s\S]*?\.in\('device_id', sharedDeviceIds\)/)
  assert.match(route, /\.from\('reminder_completions'\)[\s\S]*?\.in\('device_id', sharedDeviceIds\)/)
  assert.match(route, /\.from\('integration_items'\)[\s\S]*?\.in\('user_id', memberUserIds\)/)
})
