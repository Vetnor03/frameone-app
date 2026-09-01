import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/device/mirror-snapshot/route.ts', import.meta.url), 'utf8')
const deviceData = readFileSync(new URL('../app/lib/device/aiAssistantDeviceData.ts', import.meta.url), 'utf8')
const large = home.slice(home.indexOf('function MirrorAiAssistantLargeCard'), home.indexOf('function MirrorLargeRemindersCard'))
const shared = home.slice(home.indexOf('function MirrorAiAssistantCard'), home.indexOf('function MirrorAiAssistantLargeCard'))

test('large Assistant renders a 50/50 two-column layout with aligned shared headers and no divider', () => {
  assert.match(large, /grid h-full w-full grid-cols-2/)
  assert.doesNotMatch(large, /border-l|style=\{\{ borderColor, color: mutedColor \}\}/)
  assert.doesNotMatch(large, /border-t/)
  assert.match(large, /style=\{\{ color: mutedColor \}\}/)
  assert.match(large, /<MirrorAiAssistantLayout[\s\S]*<MirrorAiAssistantLayout/)
  assert.match(large, /header=\{item\?\.topicTitle \|\| aiAssistantNoUpdatesHeader\(language\)\}/)
  assert.match(large, /header=\{mirrorAiAssistantFollowingHeader\(language\)\}/)
  assert.match(home, /MIRROR_ASSISTANT_HEADER_ROW_CLASS/)
  assert.match(home, /<MirrorModuleHeader title=\{header\} className="mx-auto"/)
})

test('large Assistant left panel shows exactly one selected update or the empty state', () => {
  assert.match(large, /const \[item\] = mirrorAiAssistantItems\(detail, 1, 42, language\)/)
  assert.doesNotMatch(large, /const secondary = items\[1\]|items\.slice\(1\)|maxItems=\{2\}/)
  assert.match(large, /mirrorAiAssistantNoUpdatesBody\(language\)/)
  assert.match(home, /No new updates/)
  assert.match(home, /Ingen nye oppdateringer/)
  assert.match(home, /NOTHING NEW|aiAssistantNoUpdatesHeader\(language\)/)
})

test('large Assistant right panel uses snapshot watch topics, deduplicates, caps at five and reports overflow', () => {
  assert.match(home, /aiAssistantActiveWatchTopics\?: string\[\]/)
  assert.match(route, /aiAssistantActiveWatchTopics: \[\]/)
  assert.match(route, /aiAssistantActiveWatchTopics = uniqueNonEmpty\(activeWatches\.map/)
  assert.match(large, /const topics = mirrorAiAssistantActiveWatchTopics\(detail, language\)/)
  assert.match(large, /const visibleTopics = topics\.slice\(0, 5\)/)
  assert.match(large, /const overflowCount = Math\.max\(0, topics\.length - visibleTopics\.length\)/)
  assert.match(home, /`\+ \$\{count\} til`/)
  assert.match(home, /`\+ \$\{count\} more`/)
  assert.match(home, /seen\.has\(topic\)/)
})

test('snapshot filters to active member-owned watches without legacy frame visibility filters and does not expose private watch fields', () => {
  const detail = route.slice(route.indexOf('async function aiAssistantDetail'), route.indexOf('async function remindersDetail')) + deviceData
  assert.match(detail, /\.in\('owner_user_id', memberUserIds\)/)
  assert.match(detail, /\.eq\('status', 'active'\)/)
  assert.doesNotMatch(detail, /\.eq\('show_on_frame', true\)|\.eq\('frame_id', frameId\)|monitoring_watches\.show_on_frame|monitoring_watches\.frame_id/)
  assert.doesNotMatch(detail, /original_request|trigger_description|search_guidance/)
  assert.doesNotMatch(large, /original_request|trigger_description|search_guidance|instructions/i)
})

test('small and medium Assistant layouts remain on the existing shared card without new timers or refreshes', () => {
  const branches = home.slice(home.indexOf("if (module === 'assistant' && size === 'large')"), home.indexOf("if (module === 'reminders' && size === 'large')"))
  assert.match(branches, /size === 'large'[\s\S]*<MirrorAiAssistantLargeCard/)
  assert.match(branches, /size === 'medium'[\s\S]*<MirrorAiAssistantCard/)
  assert.match(branches, /size === 'small'[\s\S]*<MirrorAiAssistantCard/)
  assert.doesNotMatch(large, /setTimeout|setInterval|requestAnimationFrame|fetch\(|refresh|wake/i)
})
