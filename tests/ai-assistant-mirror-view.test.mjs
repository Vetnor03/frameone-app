import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { selectAiAssistantFrameItems, AI_ASSISTANT_FRAME_LIMITS, sanitizeAiAssistantMirrorSummary } from '../app/lib/device/aiAssistantFrame.ts'

const route = readFileSync(new URL('../app/api/device/mirror-snapshot/route.ts', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')

function row(id, hoursAgo, extra = {}) {
  const now = new Date('2026-07-14T12:00:00.000Z')
  return {
    id,
    headline: `Headline ${id}`,
    summary: `Summary ${id}`,
    source_urls: ['https://example.com/source'],
    is_read: false,
    dismissed_from_frame: false,
    created_at: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString(),
    monitoring_watches: { owner_user_id: 'member-a', frame_id: null, show_on_frame: false, title: 'Surfshop.no' },
    ...extra,
  }
}

const options = { memberUserIds: ['member-a', 'member-b'], now: new Date('2026-07-14T12:00:00.000Z'), limit: 8 }

function mirrorSnapshotModules() {
  const match = route.match(/const MODULES = new Set\(\[([\s\S]*?)\]\)/)
  assert.ok(match, 'Mirror snapshot MODULES whitelist should be declared as a Set literal')
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1])
}

function parseStoredModuleLikeRoute(value) {
  const modules = new Set(mirrorSnapshotModules())
  const raw = String(value ?? '').trim()
  const [baseRaw, idRaw] = raw.split(':', 2)
  const base = baseRaw.toLowerCase()
  if (!modules.has(base)) return null
  const id = Math.max(1, Math.round(Number(idRaw || 1)) || 1)
  return { raw, base, id }
}

test('AI Assistant manual Show on frame control is removed from the app tab', () => {
  assert.doesNotMatch(assistant, /Show on frame|Vis på frame|showOnFrame|setWatchFrameVisibility|set_ai_assistant_watch_frame_visibility/)
  assert.doesNotMatch(assistant, /show_' \+ 'on_frame|monitoring_watches\(title\)/)
  assert.match(assistant, /finally \{\n      setLoading\(false\)/)
  assert.match(assistant, /Retry/)
})

test('AI Assistant mirror heading and loaded empty state support Norwegian and English copy', () => {
  const renderer = home.slice(home.indexOf('function mirrorAiAssistantHeader'), home.indexOf('function MirrorLargeRemindersCard'))
  assert.match(renderer, /function mirrorAiAssistantHeader\(detail: MirrorModuleDetail, language: AppLanguage\)/)
  assert.match(renderer, /aiAssistantTopicTitle/)
  assert.match(renderer, /aiAssistantDefaultTopicTitle/)
  assert.match(renderer, /INGENTING NYTT/)
  assert.match(renderer, /NOTHING NEW/)
  assert.doesNotMatch(renderer, /NYTT FOR DEG|NEW FOR YOU|WATCHING/)
  assert.doesNotMatch(renderer, /Loading AI Assistant|AI ASSISTANT|KI-ASSISTENT|\"Watch\"|\"monitoring\"/)
})

test('AI Assistant frame selector ignores show_on_frame and frame_id but enforces membership', () => {
  const selected = selectAiAssistantFrameItems([
    row('show-false-frame-null', 1, { monitoring_watches: { owner_user_id: 'member-a', frame_id: null, show_on_frame: false } }),
    row('show-true-other-frame', 2, { monitoring_watches: { owner_user_id: 'member-b', frame_id: 'frame-b', show_on_frame: true } }),
    row('unrelated-user', 0.5, { monitoring_watches: { owner_user_id: 'stranger', frame_id: null, show_on_frame: true } }),
  ], options)
  assert.deepEqual(selected.items.map((x) => x.id), ['show-false-frame-null', 'show-true-other-frame'])
})

test('AI Assistant frame selector expires updates at the 24-hour boundary and sorts newest first', () => {
  const selected = selectAiAssistantFrameItems([row('old', 24), row('newer', 1), row('newest', 0.5)], options)
  assert.deepEqual(selected.items.map((x) => x.id), ['newest', 'newer'])
  assert.equal(selected.overflowCount, 0)
})

test('AI Assistant frame selector applies size limits and overflow counts', () => {
  const rows = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => row(String(n), n + 0.1))
  assert.equal(AI_ASSISTANT_FRAME_LIMITS.small, 1)
  assert.equal(selectAiAssistantFrameItems(rows, { ...options, limit: AI_ASSISTANT_FRAME_LIMITS.small }).items.length, 1)
  assert.equal(selectAiAssistantFrameItems(rows, { ...options, limit: AI_ASSISTANT_FRAME_LIMITS.small }).overflowCount, 8)
  assert.equal(selectAiAssistantFrameItems(rows, { ...options, limit: AI_ASSISTANT_FRAME_LIMITS.medium }).items.length, 1)
  assert.equal(selectAiAssistantFrameItems(rows, { ...options, limit: AI_ASSISTANT_FRAME_LIMITS.large }).items.length, 2)
  assert.equal(selectAiAssistantFrameItems(rows, { ...options, limit: AI_ASSISTANT_FRAME_LIMITS.full }).items.length, 2)
})

test('AI Assistant frame selector excludes dismissed and read updates, and includes shared-frame members', () => {
  const selected = selectAiAssistantFrameItems([
    row('dismissed', 1, { dismissed_from_frame: true }),
    row('read-hidden', 1, { is_read: true }),
    row('shared-authorized', 2, { monitoring_watches: { owner_user_id: 'member-b', frame_id: null, show_on_frame: false } }),
  ], options)
  assert.deepEqual(selected.items.map((x) => x.id), ['shared-authorized'])
})

test('AI Assistant mirror snapshot parser accepts Assistant module cells', () => {
  assert.ok(mirrorSnapshotModules().includes('assistant'))
  assert.match(route, /parsed\.base === 'assistant'/)
  assert.deepEqual(parseStoredModuleLikeRoute('assistant'), { raw: 'assistant', base: 'assistant', id: 1 })
  assert.deepEqual(parseStoredModuleLikeRoute('assistant:2'), { raw: 'assistant:2', base: 'assistant', id: 2 })
})

test('AI Assistant zero updates returns structured empty snapshot data and server errors do not hang', () => {
  const selected = selectAiAssistantFrameItems([], options)
  assert.deepEqual(selected, { items: [], overflowCount: 0 })
  assert.match(route, /aiAssistantItems: \[\]/)
  assert.match(route, /aiAssistantOverflowCount: 0/)
  assert.match(route, /aiAssistantActiveWatchCount: 0/)
  assert.match(route, /aiAssistantLastCheckedAt: null/)
  assert.match(route, /\[mirror-snapshot:ai-assistant-failed\]/)
  assert.match(route, /return empty/)
})

test('AI Assistant mirror snapshot uses device members and frame-visible watches', () => {
  assert.match(route, /from\('device_members'\)/)
  assert.match(route, /select\('user_id'\)/)
  assert.match(route, /monitoring_watches!inner\(owner_user_id, title, preferred_language, show_on_frame, frame_id\)/)
  assert.match(route, /in\('monitoring_watches\.owner_user_id', memberUserIds\)/)
  assert.match(route, /eq\('monitoring_watches\.frame_id', frameId\)/)
  assert.match(route, /eq\('monitoring_watches\.show_on_frame', true\)/)
  assert.match(route, /eq\('is_read', false\)/)
  assert.match(route, /eq\('dismissed_from_frame', false\)/)
  assert.match(route, /gt\('created_at', sinceIso\)/)
})


test('AI Assistant mirror snapshot carries summary but not private watch request fields', () => {
  const selected = selectAiAssistantFrameItems([row('summary-item', 1, {
    headline: 'Events in Stavanger this weekend',
    summary: 'Fashion show Saturday at 18:00, football festival Sunday at 17:00.',
    monitoring_watches: { owner_user_id: 'member-a', title: 'Stavanger' },
    original_request: 'private request',
    trigger_description: 'private trigger',
  })], options)
  assert.deepEqual(selected.items[0], {
    id: 'summary-item',
    headline: 'Events in Stavanger this weekend',
    summary: 'Fashion show Saturday at 18:00, football festival Sunday at 17:00.',
    created_at: '2026-07-14T11:00:00.000Z',
    topicTitle: 'STAVANGER',
  })
  assert.match(route, /select\('id, headline, summary, created_at/)
  assert.doesNotMatch(JSON.stringify(selected.items[0]), /original_request|trigger_description|Skjer det noe kjekt/)
})

test('AI Assistant empty and populated states reserve the same header area', () => {
  const renderer = home.slice(home.indexOf('function mirrorAiAssistantHeader'), home.indexOf('function MirrorLargeRemindersCard'))
  const layout = renderer.slice(renderer.indexOf('function MirrorAiAssistantLayout'), renderer.indexOf('function MirrorAiAssistantCard'))
  const emptyBlock = renderer.slice(renderer.indexOf('if (items.length <= 0)'), renderer.indexOf("if (variant === 'small')"))
  const smallBlock = renderer.slice(renderer.indexOf("if (variant === 'small')"), renderer.indexOf('const primary = items[0]'))
  const populatedBlock = renderer.slice(renderer.indexOf('const primary = items[0]'), renderer.indexOf('function MirrorLargeRemindersCard'))

  assert.match(layout, /MIRROR_ASSISTANT_HEADER_ROW_CLASS/)
  assert.match(layout, /<div className=\{MIRROR_ASSISTANT_HEADER_ROW_CLASS\}>[\s\S]*<MirrorModuleHeader title=\{header\} className="mx-auto" \/>[\s\S]*<\/div>/)
  assert.match(layout, /flex h-full w-full flex-col items-center overflow-hidden text-center leading-none/)
  assert.match(layout, /flex min-h-0 w-full flex-1 flex-col items-center justify-center/)
  assert.match(emptyBlock, /<MirrorAiAssistantLayout[\s\S]*header=\{header\}/)
  assert.match(smallBlock, /<MirrorAiAssistantLayout[\s\S]*header=\{header\}/)
  assert.match(populatedBlock, /<MirrorAiAssistantLayout[\s\S]*header=\{header\}/)
  assert.doesNotMatch(emptyBlock, /<MirrorModuleHeader/)
  assert.doesNotMatch(emptyBlock, /h-full w-full flex-col items-center justify-center[\s\S]*<MirrorModuleHeader/)
})

test('AI Assistant Mirror View and physical frame use the shared assistant layout structure', () => {
  const renderer = home.slice(home.indexOf('const MIRROR_ASSISTANT_SHELL_CLASS'), home.indexOf('function MirrorLargeRemindersCard'))
  const renderBranches = home.slice(home.indexOf("if (module === 'assistant' && size === 'large')"), home.indexOf("if (module === 'reminders' && size === 'large')"))
  assert.match(renderer, /function MirrorAiAssistantLayout/)
  assert.match(renderer, /const MIRROR_ASSISTANT_HEADER_ROW_CLASS = "flex h-\[clamp\(1\.02rem,2\.48vw,1\.52rem\)\] shrink-0 items-start justify-center"/)
  assert.match(renderer, /<div className=\{MIRROR_ASSISTANT_HEADER_ROW_CLASS\}>[\s\S]*<MirrorModuleHeader title=\{header\} className="mx-auto" \/>[\s\S]*<\/div>/)
  assert.match(renderer, /<div className=\{`flex min-h-0 w-full flex-1 flex-col items-center justify-center/)
  assert.match(renderBranches, /size === 'large'[\s\S]*<MirrorAiAssistantLargeCard/)
  assert.match(renderBranches, /size === 'medium'[\s\S]*<MirrorAiAssistantCard/)
  assert.match(renderBranches, /size === 'small'[\s\S]*<MirrorAiAssistantCard/)
})



test('AI Assistant small layout uses full-width headline area with reminder-style padding', () => {
  const renderer = home.slice(home.indexOf('const MIRROR_ASSISTANT_SHELL_CLASS'), home.indexOf('function MirrorLargeRemindersCard'))
  const smallBlock = renderer.slice(renderer.indexOf("if (variant === 'small')"), renderer.indexOf('const primary = items[0]'))
  const populatedBlock = renderer.slice(renderer.indexOf('const primary = items[0]'), renderer.indexOf('function MirrorLargeRemindersCard'))

  assert.doesNotMatch(smallBlock, /max-w-\[18ch\]/)
  assert.doesNotMatch(renderer, /max-w-\[18ch\]/)
  assert.match(renderer, /const MIRROR_ASSISTANT_SMALL_SHELL_CLASS = "px-\[clamp\(0\.45rem,1\.2vw,0\.8rem\)\] pb-\[clamp\(0\.38rem,0\.95vw,0\.62rem\)\] pt-\[clamp\(0\.65rem,1\.7vw,1rem\)\]"/)
  assert.match(renderer, /const MIRROR_ASSISTANT_SMALL_BODY_CLASS = "w-full"/)
  assert.match(renderer, /const MIRROR_ASSISTANT_SMALL_HEADLINE_CLASS = "w-full max-w-full text-\[clamp\(0\.68rem,1\.6vw,0\.96rem\)\] font-medium leading-\[1\.09\] tracking-\[0\.04em\]"/)
  assert.match(smallBlock, /contentClassName=\{MIRROR_ASSISTANT_SMALL_BODY_CLASS\}/)
  assert.match(smallBlock, /<MirrorAiAssistantHeadline lines=\{2\} className=\{MIRROR_ASSISTANT_SMALL_HEADLINE_CLASS\}>\{item\.headline\}<\/MirrorAiAssistantHeadline>/)
  assert.match(home, /mx-auto overflow-hidden text-balance text-center \[-webkit-box-orient:vertical\] \[display:-webkit-box\]/)
  assert.match(home, /lines === 2 \? '\[-webkit-line-clamp:2\]'/)
  assert.match(smallBlock, /className=\{MIRROR_ASSISTANT_SMALL_SHELL_CLASS\}/)
  assert.match(populatedBlock, /\$\{isMedium \? 'max-w-\[34ch\]' : 'max-w-\[42ch\]'\}/)
  assert.match(populatedBlock, /!isMedium && secondary && <div className="w-full max-w-\[26ch\]/)
})
test('AI Assistant mirror renderer uses summary recap and no Watch title/request context', () => {
  const renderer = home.slice(home.indexOf('function mirrorAiAssistantHeader'), home.indexOf('function MirrorLargeRemindersCard'))
  assert.match(renderer, /<MirrorModuleHeader title=\{header\} className="mx-auto" \/>/)
  assert.match(renderer, /text-balance text-center/)
  assert.match(renderer, /items-center justify-center/)
  assert.match(renderer, /sanitizeAiAssistantMirrorSummary\(item\?\.summary, headline, recapWords\)/)
  assert.match(renderer, /<MirrorAiAssistantRecap/)
  assert.match(renderer, /primary\.summary/)
  assert.doesNotMatch(renderer, /item\?\.title|primary\.title|secondary\.title|mirrorAiAssistantContextLabel|monitoring_watches|original_request|trigger_description|instructions/i)
})

test('AI Assistant summary sanitizer removes markdown, keeps link labels, removes URLs, and strips duplicate headline', () => {
  const summary = `# Events in Stavanger this weekend
**Events in Stavanger this weekend** - [Fashion show](https://example.com/path?utm_source=x&fbclid=y) Saturday at 18:00.
- Football festival Sunday at 17:00
See https://tracker.example.com/a?utm_campaign=nope and [rail work](https://rail.example/?utm_medium=x).`
  const cleaned = sanitizeAiAssistantMirrorSummary(summary, 'Events in Stavanger this weekend', 80)
  assert.equal(cleaned, 'Fashion show Saturday at 18:00. Football festival Sunday at 17:00 See and rail work.')
  assert.doesNotMatch(cleaned, /[#*_\[\]\(\)]|https?:|utm_|fbclid/)
})

test('AI Assistant summary sanitizer falls back to empty for unusable input and clamps at word boundaries', () => {
  assert.equal(sanitizeAiAssistantMirrorSummary('', 'Headline', 20), '')
  assert.equal(sanitizeAiAssistantMirrorSummary('https://example.com/?utm_source=x', 'Headline', 20), '')
  assert.equal(sanitizeAiAssistantMirrorSummary('Headline: one two three four five', 'Headline', 3), 'one two three…')
  assert.doesNotMatch(sanitizeAiAssistantMirrorSummary('one two three four', '', 3), /\.\.\.$|thr$/)
})

test('AI Assistant mirror renderer clamps large and medium recap and omits small recap', () => {
  const renderer = home.slice(home.indexOf('function mirrorAiAssistantHeader'), home.indexOf('function MirrorLargeRemindersCard'))
  assert.match(renderer, /variant === 'large' \|\| variant === 'xl' \? 42 : variant === 'medium' \? 28 : 0/)
  assert.match(renderer, /lines=\{isMedium \? 2 : 3\}/)
  const smallBlock = renderer.slice(renderer.indexOf("if (variant === 'small')"), renderer.indexOf('const primary = items[0]'))
  assert.doesNotMatch(smallBlock, /MirrorAiAssistantRecap|summary/)
})

test('AI Assistant mirror typography stays aligned with surrounding module scale', () => {
  const renderer = home.slice(home.indexOf('function mirrorAiAssistantHeader'), home.indexOf('function MirrorLargeRemindersCard'))
  const emptyBlock = renderer.slice(renderer.indexOf('if (items.length <= 0)'), renderer.indexOf("if (variant === 'small')"))
  assert.match(home, /MIRROR_PRIMARY_TEXT_CLASS = "text-\[clamp\(0\.7rem,1\.5vw,0\.98rem\)\] font-medium tracking-\[0\.04em\]"/)
  assert.match(home, /MIRROR_SECONDARY_TEXT_CLASS = "text-\[clamp\(0\.66rem,1\.48vw,0\.94rem\)\] font-medium tracking-\[0\.035em\]"/)
  assert.match(renderer, /MIRROR_PRIMARY_TEXT_CLASS/)
  assert.match(renderer, /MIRROR_SECONDARY_TEXT_CLASS/)
  assert.doesNotMatch(renderer, /2\.55vw|1\.72rem|2\.35vw|1\.42rem/)
  assert.match(renderer, /font-medium leading-\[1\.18\]/)
  assert.match(emptyBlock, /\$\{MIRROR_SECONDARY_TEXT_CLASS\}/)
  assert.match(emptyBlock, /style=\{\{ color: mutedColor \}\}/)
  assert.doesNotMatch(emptyBlock, /font-family|fontFamily|#[0-9a-fA-F]{3,8}|rgb\(|rgba\(|text-zinc|text-gray|text-slate|text-neutral/)
})

test('AI Assistant empty body is centered below the fixed shared header area', () => {
  const renderer = home.slice(home.indexOf('const MIRROR_ASSISTANT_SHELL_CLASS'), home.indexOf('function MirrorLargeRemindersCard'))
  const emptyBlock = renderer.slice(renderer.indexOf('if (items.length <= 0)'), renderer.indexOf("if (variant === 'small')"))
  const smallBlock = renderer.slice(renderer.indexOf("if (variant === 'small')"), renderer.indexOf('const primary = items[0]'))
  const populatedBlock = renderer.slice(renderer.indexOf('const primary = items[0]'), renderer.indexOf('function MirrorLargeRemindersCard'))

  assert.match(renderer, /MIRROR_ASSISTANT_HEADER_ROW_CLASS/)
  assert.match(renderer, /shrink-0 items-start justify-center/)
  assert.match(renderer, /flex min-h-0 w-full flex-1 flex-col items-center justify-center/)
  assert.match(emptyBlock, /className=\{variant === 'small' \? MIRROR_ASSISTANT_SMALL_SHELL_CLASS : MIRROR_ASSISTANT_SHELL_CLASS\}/)
  assert.match(emptyBlock, /contentClassName=\{variant === 'small' \? MIRROR_ASSISTANT_SMALL_BODY_CLASS : MIRROR_ASSISTANT_BODY_CLASS\}/)
  assert.match(smallBlock, /className=\{MIRROR_ASSISTANT_SMALL_SHELL_CLASS\}/)
  assert.match(populatedBlock, /className=\{MIRROR_ASSISTANT_SHELL_CLASS\}/)
  assert.doesNotMatch(emptyBlock, /translate-y|mt-\[|pt-\[clamp\(0\.0|items-center justify-center[\s\S]*<MirrorModuleHeader/)
})

test('AI Assistant summary sanitizer removes generic intros and prefers concrete list findings', () => {
  const cleaned = sanitizeAiAssistantMirrorSummary('Her er noen arrangementer som finner sted i Stavanger helgen 18.–19. juli 2026: - Lørdag arrangeres Cute Closet Summer Fashion Show kl. 18. - Søndag er det fotballfest i Vågen kl. 17. - Jærbanen er stengt deler av helgen og kan påvirke reisen.', 'Arrangementer i Stavanger helgen 18.–19. juli', 40)
  assert.equal(cleaned, 'Lørdag arrangeres Cute Closet Summer Fashion Show kl. 18. Søndag er det fotballfest i Vågen kl. 17. Jærbanen er stengt deler av helgen og kan påvirke reisen.')
})

test('AI Assistant summary sanitizer truncates with at most one proper ellipsis and never through a word', () => {
  const cleaned = sanitizeAiAssistantMirrorSummary('Alpha beta gamma delta epsilon zeta eta theta iota', '', 5)
  assert.equal(cleaned, 'Alpha beta gamma delta epsilon…')
  assert.doesNotMatch(cleaned, /\.{3}|….*…|epsil$/)
})


test('AI Assistant empty state includes active watch count and latest successful check time', () => {
  const renderer = home.slice(home.indexOf('function mirrorAiAssistantHeader'), home.indexOf('function MirrorLargeRemindersCard'))
  assert.match(renderer, /aiAssistantActiveWatchCount/)
  assert.match(renderer, /aiAssistantLastCheckedAt/)
  assert.match(renderer, /Following \$\{count\} \$\{count === 1 \? 'thing' : 'things'\}/)
  assert.match(renderer, /Følger \$\{count\} \$\{count === 1 \? 'ting' : 'ting'\}/)
  assert.match(renderer, /Checked today/)
  assert.match(renderer, /Sjekket i dag/)
  assert.match(renderer, /checked \? `\$\{countLabel\} · \$\{checked\}` : countLabel/)
})

test('AI Assistant active watch metadata excludes inactive and error states in the shared snapshot path', () => {
  const detail = route.slice(route.indexOf('async function aiAssistantDetail'), route.indexOf('async function remindersDetail'))
  assert.match(detail, /from\('monitoring_watches'\)/)
  assert.match(detail, /select\('id, last_checked_at, status, title, preferred_language, created_at, show_on_frame, frame_id'\)/)
  assert.match(detail, /\.eq\('status', 'active'\)/)
  assert.doesNotMatch(detail, /\.in\('status', \['active', 'error'\]\)/)
  assert.match(detail, /activeWatches\.length/)
  assert.match(detail, /lastCheckedAt = activeWatches[\s\S]*sort\(\(a: string, b: string\) => new Date\(b\)\.getTime\(\) - new Date\(a\)\.getTime\(\)\)\[0\] \|\| null/)
})

test('AI Assistant zero active watches shows dedicated nothing-followed copy without private fields', () => {
  const renderer = home.slice(home.indexOf('function mirrorAiAssistantHeader'), home.indexOf('function MirrorLargeRemindersCard'))
  assert.match(renderer, /Nothing followed yet/)
  assert.match(renderer, /Følger ikke med på noe ennå/)
  assert.match(renderer, /if \(count <= 0\) return mirrorAiAssistantNothingFollowedMessage\(language\)/)
  const emptyBlock = renderer.slice(renderer.indexOf('if (items.length <= 0)'), renderer.indexOf("if (variant === 'small')"))
  assert.doesNotMatch(emptyBlock, /original_request|trigger_description|instructions|monitoring_watches/i)
})

test('AI Assistant Mirror View and physical frame consume the same snapshot fields without client polling', () => {
  assert.match(route, /aiAssistantActiveWatchCount: activeWatches\.length/)
  assert.match(route, /aiAssistantLastCheckedAt: lastCheckedAt/)
  assert.match(route, /aiAssistantActiveWatchTopics/)
  assert.match(home, /detail\.aiAssistantActiveWatchCount/)
  assert.match(home, /detail\.aiAssistantLastCheckedAt/)
  assert.match(home, /detail\.aiAssistantActiveWatchTopics/)
  assert.doesNotMatch(home.slice(home.indexOf('function MirrorAiAssistantCard'), home.indexOf('function MirrorLargeRemindersCard')), /fetch\(|setTimeout|setInterval|wake|refresh/i)
})
