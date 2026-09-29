import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { additionalModuleGroups, recommendedModuleKeys } from '../app/lib/modulePickerCatalog.mjs'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const available = JSON.parse(readFileSync(new URL('../shared/frame-modules.json', import.meta.url), 'utf8'))
const labels = {
  en: { reminders: 'REMINDERS', news: 'NEWS', date: 'DATE', weather: 'WEATHER', countdown: 'COUNTDOWN', groceries: 'GROCERIES', stocks: 'INVESTMENTS', ski: 'SKI', soccer: 'SOCCER', surf: 'SURF', assistant: 'AI Assistant' },
  no: { reminders: 'PÅMINNELSER', news: 'NYHETER', date: 'DATO', weather: 'VÆR', countdown: 'NEDTELLING', groceries: 'HANDLELISTE', stocks: 'INVESTERINGER', ski: 'SKI', soccer: 'FOTBALL', surf: 'SURF', assistant: 'KI-assistent' },
}

const groups = (language, enabled = false) =>
  additionalModuleGroups(language, (module) => labels[language][module], enabled)

test('exactly the four chosen core modules are visible first', () => {
  assert.deepEqual(recommendedModuleKeys, ['reminders', 'news', 'date', 'weather'])
  assert.equal(new Set(recommendedModuleKeys).size, 4)
  assert.match(home, /recommendedModuleKeys\.map\(/)
  assert.match(home, /\{isNo \? 'Anbefalt' : 'Recommended'\}/)
})

test('secondary modules are alphabetized by translated category and translated title', () => {
  const english = groups('en')
  assert.deepEqual(english.map((group) => group.label), ['Everyday', 'Finance', 'Sports'])
  assert.deepEqual(english.map((group) => group.modules), [
    ['countdown', 'groceries'],
    ['stocks'],
    ['ski', 'soccer', 'surf'],
  ])
  const norwegian = groups('no')
  assert.deepEqual(norwegian.map((group) => group.label), ['Hverdag', 'Sport', 'Økonomi'])
  assert.deepEqual(norwegian.map((group) => group.modules), [
    ['groceries', 'countdown'],
    ['soccer', 'ski', 'surf'],
    ['stocks'],
  ])
})

test('all public existing modules remain available exactly once, and AI Follow stays hidden', () => {
  const displayed = [...recommendedModuleKeys, ...groups('en').flatMap((group) => group.modules)]
  const publiclyAvailable = available.map((module) => module.id).filter((id) => id !== 'assistant')
  assert.deepEqual([...displayed].sort(), [...publiclyAvailable].sort())
  assert.equal(new Set(displayed).size, displayed.length)
  assert.equal(displayed.length, 10)
  assert.ok(!displayed.includes('assistant'))
  assert.ok(groups('en', true).flatMap((group) => group.modules).includes('assistant'))
})

test('single More Modules disclosure groups and scrolls without nested dropdowns', () => {
  const picker = home.slice(home.indexOf('function PickerModal({'), home.indexOf('function ThemePickerModal({'))
  assert.match(picker, /const \[moreOpen, setMoreOpen\] = useState\(false\)/)
  assert.match(picker, /aria-expanded=\{moreOpen\}/)
  assert.match(picker, /aria-controls="picker-more-modules"/)
  assert.match(picker, /id="picker-more-modules"/)
  assert.match(picker, /max-h-\[min\(36dvh,260px\)\] overflow-y-auto/)
  assert.match(picker, /groups\.map\(\(group\) =>/)
  assert.match(picker, /group\.modules\.map\(\(moduleKey\) =>/)
  assert.doesNotMatch(picker, /setCategoryOpen|categoryExpanded|<details/)
  assert.match(picker, /onClick=\{\(\) => onPick\(moduleKey\)\}/)
  assert.match(picker, /onClick=\{onClear\}/)
  assert.match(home, /selectWidget: 'VELG MODUL'/)
})

test('picker-only work leaves the onboarding default assignments unchanged', () => {
  assert.match(home, /const presetCells: Record<number, ModuleKey \| null> = \{ 0: 'date', 1: 'reminders', 2: 'weather', 3: 'countdown' \}/)
})
