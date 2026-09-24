import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')

test('AI Follow implementation remains intact behind the release UI switch', () => {
  assert.match(home, /type CoreTabKey = 'frame' \| 'settings'/)
  assert.match(home, /type ModuleKey = 'assistant' \| 'date'/)
  assert.match(home, /value === 'assistant'/)
  assert.match(home, /const SHOW_AI_FOLLOW_UI = false/)
  const tabsBlock = home.match(/const tabs = useMemo\(\(\) => \{[\s\S]*?\}, \[dynamicTabs, language\]\)/)?.[0] ?? ''
  assert.doesNotMatch(tabsBlock, /key: 'assistant' as const/)
  assert.match(home, /deriveDynamicModuleKeys<ModuleKey>[\s\S]*filter\(\(m\) => SHOW_AI_FOLLOW_UI \|\| m !== 'assistant'\)/)
  assert.match(home, /SHOW_AI_FOLLOW_UI && \(tab === 'assistant' \|\| tab === 'ai-assistant'\)/)
})

test('AI Follow tab stays hidden while the lightweight RE:MIND helper remains available', () => {
  assert.match(home, /deriveDynamicModuleKeys<ModuleKey>\(activeLayoutModules, pinnedModuleTabs\)/)
  assert.match(home, /setPinnedModuleTabs\(\(prev\) => \{[\s\S]*markDirty\(\{ pinnedModuleTabs: nextPinned \}\)/)
  assert.match(home, /activeTab === 'assistant' \? \(\s*<AIAssistantTab language=\{language\} activeDeviceId=\{activeDeviceId\}/)
  assert.match(home, /isPlainFrameAssistantSurface && showFrameAssistant/)
  assert.doesNotMatch(home, /SHOW_AI_FOLLOW_UI && isPlainFrameAssistantSurface/)
  assert.match(home, /if \(tabs\.some\(\(tab\) => tab\.key === activeTab\)\) return/)
})

test('AI Follow module is hidden but helper and Tips & Tricks settings remain visible', () => {
  assert.match(home, /const options: ModuleKey\[] = \['assistant', 'reminders', 'news', 'date', 'weather', 'countdown', 'surf', 'ski', 'soccer', 'groceries', 'stocks'\][\s\S]*filter\(\(module\): module is ModuleKey => SHOW_AI_FOLLOW_UI \|\| module !== 'assistant'\)/)
  assert.match(home, /ASSISTANT & TIPS/)
  assert.match(home, /Show RE:MIND Assistant/)
  assert.match(home, /Tips & Tricks/)
  assert.match(home, /AssistantPreferenceToggle/)
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
