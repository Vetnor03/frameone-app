import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { sanitizeFrameText } from '../app/lib/frameText.mjs'

test('canonical server sanitizer preserves only the frame character contract', () => {
  assert.equal(sanitizeFrameText('Clear and dry through tonight, reaching 20°C this afternoon.'), 'Clear and dry through tonight, reaching 20°C this afternoon.')
  assert.equal(sanitizeFrameText('Besøk farmor på Ålgård'), 'Besøk farmor på Ålgård')
  assert.equal(sanitizeFrameText('Møte med Øyvind'), 'Møte med Øyvind')
  assert.equal(sanitizeFrameText('Ærlig talt'), 'Ærlig talt')
  assert.equal(sanitizeFrameText('Møte – Lene’s «plan»…'), `Møte - Lene's "plan"...`)
  assert.equal(sanitizeFrameText('Fotball ⚽ kl. 18 😊'), 'Fotball kl. 18')
  assert.equal(sanitizeFrameText('Café München'), 'Cafe Munchen')
  assert.equal(sanitizeFrameText('unknown 中 � text'), 'unknown text')
  assert.equal(sanitizeFrameText('Kommer du?'), 'Kommer du?')
})

test('all reminder sources and AI fallback cross the canonical frame boundary', async () => {
  for (const source of ['Calendar', 'Teams', 'Spond', 'user reminder', 'AI-shortened reminder']) {
    assert.equal(sanitizeFrameText(`${source}: Møte – Lene’s «plan» 😊`), `${source}: Møte - Lene's "plan"`)
  }
  const optimizer = await readFile(new URL('../app/lib/frameContentOptimizer.ts', import.meta.url), 'utf8')
  assert.match(optimizer, /sanitizeFrameText\(item\.title\)/)
  assert.match(optimizer, /truncateAtWordBoundary\(sanitizeFrameText\(title\)/)
})

test('weather and free-form firmware paths use shared final normalization', async () => {
  const weather = await readFile(new URL('../frame/src/modules/ModuleWeather.cpp', import.meta.url), 'utf8')
  const reminders = await readFile(new URL('../frame/src/modules/ModuleReminders.cpp', import.meta.url), 'utf8')
  assert.match(weather, /normalizeUtf8ForDisplay\(out\.aiInsight/)
  assert.match(reminders, /normalizeUtf8ForDisplay/)
})

test('Soccer compares normalized config and normalizes every API display field', async () => {
  const soccer = await readFile(new URL('../frame/src/modules/ModuleSoccer.cpp', import.meta.url), 'utf8')
  assert.match(soccer, /displayEqualsUtf8\(oldCfg\.teamName, teamName/)
  assert.match(soccer, /displayEqualsUtf8\(oldCfg\.competitionName, competitionName/)
  assert.doesNotMatch(soccer, /strcmp\(oldCfg\.teamName, teamName/)

  for (const field of [
    'out.teamName', 'out.competitionName', 'out.nextHomeShort', 'out.nextAwayShort',
    'out.prevHomeShort', 'out.prevAwayShort', 'out.teamAbove', 'out.teamBelow',
    'r.teamShort', 'out.topScorerName',
  ]) {
    assert.match(soccer, new RegExp(`copyDisplayText\\(${field.replace('.', '\\.')}`))
  }
  assert.match(soccer, /appendDisplayText\(out, n, name\)/)
  assert.match(soccer, /appendDisplayText\(out, n, s\)/)

  assert.equal(sanitizeFrameText('Bodø/Glimt'), 'Bodø/Glimt')
  assert.equal(sanitizeFrameText('Tromsø'), 'Tromsø')
  assert.equal(sanitizeFrameText('José María – mål ⚽'), 'Jose Maria - mål')
  assert.equal(sanitizeFrameText('Tromsø’s «keeper» 😊'), `Tromsø's "keeper"`)
})
