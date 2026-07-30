import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const detailPage = readFileSync(new URL('../app/shop/ProductDetailPage.tsx', import.meta.url), 'utf8')
const productData = readFileSync(new URL('../app/shop/productData.ts', import.meta.url), 'utf8')

test('Norwegian matte detail pages use Innlegg purchase copy', () => {
  assert.match(detailPage, /const isNorwegianMatte = kind === 'mattes' && language === 'no'/)

  for (const copy of [
    'ALLE INNLEGG',
    'INNLEGG TIL RE:MIND',
    'UTFØRELSE',
    'LEGG I HANDLEKURV',
    'RE:MIND-enheten selges separat.',
  ]) {
    assert.match(detailPage, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('Norwegian matte detail pages combine every localized subtitle with localized supporting copy', () => {
  assert.match(detailPage, /\{displaySubtitle\}\. \{language === 'no' \? 'Utviklet spesielt for RE:MIND og kan byttes på sekunder når du ønsker et nytt uttrykk\.'/)

  for (const id of [
    'classic-white', 'soft-black', 'warm-beige', 'cocoa-brown', 'sage-green',
    'white---black', 'black---white', 'mist-grey', 'dusty-blue', 'blush-pink',
    'ochre', 'forest-green', 'burgundy', 'natural-linen',
  ]) {
    assert.match(productData, new RegExp(`'${id}': \\{ name: '[^']+', subtitle: '[^']+' \\}`))
  }
})

test('Norwegian matte benefits are localized without changing their English alternatives', () => {
  for (const copy of [
    'UTVIKLET FOR RE:MIND',
    'Presis passform, utviklet som en del av RE:MIND-systemet.',
    'NYTT UTTRYKK PÅ SEKUNDER',
    'Bytt innlegg og uttrykk på sekunder – helt uten verktøy.',
    'LAGET FOR Å VARE',
    'Holdbare materialer, valgt for å tåle hverdagen.',
    'Made for RE:MIND',
    'A precise fit, designed as part of the original system.',
    'Swap in seconds',
    'Change the look without tools or replacing your display.',
    'Built to last',
    'Durable materials chosen for everyday life at home.',
  ]) {
    assert.ok(detailPage.includes(copy), `missing detail-page copy: ${copy}`)
  }
})
