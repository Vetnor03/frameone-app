import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')

test('AI Assistant uses the stable assistant module identifier, not a permanent core tab', () => {
  assert.match(home, /type CoreTabKey = 'frame' \| 'settings'/)
  assert.match(home, /type ModuleKey = 'assistant' \| 'date'/)
  assert.match(home, /value === 'assistant'/)
  const tabsBlock = home.match(/const tabs = useMemo\(\(\) => \{[\s\S]*?\}, \[dynamicTabs, language\]\)/)?.[0] ?? ''
  assert.doesNotMatch(tabsBlock, /key: 'assistant' as const/)
  assert.match(home, /const dynamicTabs = useMemo/)
  assert.match(home, /moduleLabel\(language, m\)/)
})

test('AI Assistant navigation and pinning are driven by selected or pinned module state', () => {
  assert.match(home, /activeModules = Array\.from\([\s\S]*Object\.values\(cellsByLayout\[layoutKey\]\)/)
  assert.match(home, /pinnedInactive = pinnedModuleTabs\.filter/)
  assert.match(home, /activeUnpinned = activeModules\.filter/)
  assert.match(home, /setPinnedModuleTabs\(\(prev\) => \{[\s\S]*markDirty\(\{ pinnedModuleTabs: nextPinned \}\)/)
  assert.match(home, /activeTab === 'assistant' \? \(\s*<AIAssistantTab language=\{language\} activeDeviceId=\{activeDeviceId\}/)
  assert.match(home, /if \(tabs\.some\(\(tab\) => tab\.key === activeTab\)\) return/)
})

test('AI Assistant appears first as one full-width top module picker card', () => {
  assert.match(home, /const prominentOption: ModuleKey = 'assistant'/)
  assert.match(home, /<button\s*key=\{prominentOption\}[\s\S]*?className="col-span-2 min-h-11 rounded-2xl border border-\[color:var\(--bd-10\)\]/)
  assert.match(home, /\{moduleLabel\(language, prominentOption\)\}/)
  assert.match(home, /const options: ModuleKey\[] = \['reminders', 'date', 'weather', 'countdown', 'surf', 'soccer', 'groceries', 'stocks'\]/)
})

test('saved module configurations remain backwards compatible and pinned values are validated', () => {
  assert.match(home, /function baseModuleKeyFromStored\(moduleStr: string\): ModuleKey \| null/)
  assert.match(home, /const base = raw\.split\(':'\)\[0\]\.toLowerCase\(\)/)
  assert.match(home, /return base/)
  assert.match(home, /filter\(\(m\): m is ModuleKey => isModuleKey\(m\) && m !== 'date'\)/)
})

test('generic Assistant copy is localized and does not promise notifications', () => {
  assert.match(assistant, /Be RE:MIND holde øye med noe for deg\. Nye endringer og oppdateringer samles her\./)
  assert.match(assistant, /Ask RE:MIND to keep an eye on something for you\. New changes and updates are collected here\./)
  assert.match(assistant, /Følg med på endringer i en sak jeg er interessert i/)
  assert.match(assistant, /Si fra når noe jeg venter på blir tilgjengelig/)
  assert.match(assistant, /Hold øye med prisendringer på noe jeg vurderer å kjøpe/)
  assert.match(assistant, /Keep track of changes to something I care about/)
  assert.match(assistant, /Tell me when something I am waiting for becomes available/)
  assert.match(assistant, /Keep an eye on price changes for something I am considering buying/)
  assert.match(assistant, /Bare nye og relevante endringer vises\./)
  assert.match(assistant, /Only new and relevant changes are shown\./)
  assert.doesNotMatch(assistant, /notified|Notify me|Varsle meg|beskjed|push notification|push-varsel/i)
})
