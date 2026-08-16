import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('../app/shop/press/page.tsx', import.meta.url), 'utf8')
const shell = readFileSync(new URL('../app/shop/CompanyPageShell.tsx', import.meta.url), 'utf8')

test('Press Room provides the requested Norwegian copy while retaining English', () => {
  for (const copy of [
    'TILBAKE TIL FORSIDEN',
    'PRESSE',
    'Møt RE:MIND.',
    'En digital ramme fra Stavanger – utviklet for å samle nyttig informasjon på ett sted, i et format som passer naturlig inn i hjemmet.',
    'KORT FORTALT',
    'RE:MIND samler påminnelser, vær, kalender og oppdateringer fra tjenester du allerede bruker i én gjennomført skjerm for hjemmet.',
    'Grunnlagt',
    'Stavanger, Norge',
    'Grunnlegger',
    'Kategori',
    'Rolig teknologi',
    'KONTAKT OSS',
    'PRESSEMATERIELL',
    'Logo og produktbilder',
    'Bruk gjerne disse bildene når du skriver om RE:MIND. Sørg for at logoen er tydelig, og ikke endre proporsjonene.',
    'Appikon',
    'RE:MIND-logo',
    'RE:MIND-enhet',
    'Nordisk eik',
    'Mørk RE:MIND',
    'LAST NED ↓',
  ]) assert.ok(page.includes(copy), `missing Norwegian copy: ${copy}`)

  for (const copy of [
    'Press room',
    'Meet RE:MIND.',
    'A calm digital frame from Stavanger, Norway—created to put useful information in view and help people spend less time reaching for their phones.',
    'In short',
    'RE:MIND brings reminders, weather, calendars and updates from the services people already use into one considered home display.',
    'Stavanger, Norway',
    'Contact press team',
    'Media assets',
    'Logo & product pictures',
    'App icon',
    'RE:MIND logo',
    'Download ↓',
  ]) assert.ok(page.includes(copy), `missing original English copy: ${copy}`)
})

test('Press Room preserves navigation, contact and asset download behavior', () => {
  assert.match(page, /backLabel=\{isNorwegian \? 'TILBAKE TIL FORSIDEN' : 'Back to home'\}/)
  assert.match(shell, /href=\{`\/shop\?lang=\$\{language\}`\}/)
  assert.match(page, /href="mailto:support@re-mind\.no\?subject=Press%20enquiry"/)
  assert.match(page, /src: '\/AppLogo\.png'/)
  assert.match(page, /src: '\/Logo\.png'/)
  assert.doesNotMatch(page, /r_Logo\.png|R:-logo|R: logo/)
  assert.match(page, /href=\{asset\.src\}[^>]*download/)
})
