import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const shopPage = readFileSync(new URL('../app/shop/page.tsx', import.meta.url), 'utf8')

test('RE:MIND product section localizes only its Norwegian copy', () => {
  assert.match(shopPage, /language === 'no' \? 'Komplett fra' : 'Complete RE:MIND from'/)
  assert.match(shopPage, /language === 'no' \? 'DETTE FØLGER MED' : 'What’s included'/)
  assert.match(shopPage, /language === 'no' \? 'RE:MIND · Valgfri ramme · Valgfritt innlegg · Ladekabel · Oppstartsveiledning' : 'RE:MIND display · Your frame · Your matte · Charging cable · Setup guide'/)
  assert.match(shopPage, /language === 'no' \? 'VELG STIL' : 'MAKE IT YOURS'/)
})

test('mattes promo uses Innlegg and localized copy only for Norwegian', () => {
  assert.match(shopPage, /language === 'no' \? 'INNLEGG' : 'Mattes'/)
  assert.match(shopPage, /language === 'no' \? 'Gi RE:MIND et nytt uttrykk\.' : <>Change the feel\.<br \/>Not the frame\.<\/>/)
  assert.match(shopPage, /language === 'no' \? 'Et innlegg for hvert rom og hver stil\.' : <>Choose the perfect matte to match<br \/>your space and reduce glare\.<\/>/)
  assert.match(shopPage, /language === 'no' \? 'SE UTVALGET' : 'SHOP MATTES'/)
})
