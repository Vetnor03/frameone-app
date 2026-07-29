import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const chrome = readFileSync(new URL('../app/shop/ShopChrome.tsx', import.meta.url), 'utf8')

test('Norwegian shop navigation uses the requested category labels', () => {
  const norwegianLabels = /language === "no"\s*\? \{ frames: "Rammer", mattes: "Innlegg", bundles: "Pakker", about: "Om oss" \}/g

  assert.equal(chrome.match(norwegianLabels)?.length, 2)
  assert.equal(chrome.match(/\{navigationLabels\.frames\}/g)?.length, 3)
  assert.equal(chrome.match(/\{navigationLabels\.mattes\}/g)?.length, 3)
  assert.equal(chrome.match(/\{navigationLabels\.bundles\}/g)?.length, 3)
  assert.equal(chrome.match(/\{navigationLabels\.about\}/g)?.length, 3)
  assert.doesNotMatch(chrome, /passepartout/i)
})

test('English shop navigation labels and the RE:MIND product name stay unchanged', () => {
  const englishLabels = /: \{ frames: "Frames", mattes: "Mattes", bundles: "Bundles", about: "About" \}/g

  assert.equal(chrome.match(englishLabels)?.length, 2)
  assert.equal(chrome.match(/^\s+RE:MIND$/gm)?.length, 4)
})
