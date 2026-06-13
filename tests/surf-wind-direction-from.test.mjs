import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const tables = JSON.parse(readFileSync(new URL('../app/lib/surf/waveguide_tables.json', import.meta.url), 'utf8'))
const scoringSource = readFileSync(new URL('../app/lib/surfScoring.ts', import.meta.url), 'utf8')
const hellesto = tables.spots['HellestÃ¸']

test('Hellestø wind direction table is meteorological FROM direction', () => {
  assert.match(tables.direction_convention, /^FROM_degrees/)

  const scoreByLabel = Object.fromEntries(hellesto.wind_dir.map((row) => [row.label, row.score_1_6]))

  assert.equal(scoreByLabel.E, 6)
  assert.equal(scoreByLabel.NE, 6)
  assert.equal(scoreByLabel.W, 1)
  assert.equal(scoreByLabel.NW, 1)
})

test('Hellestø wind direction debug explicitly labels FROM semantics', () => {
  assert.match(scoringSource, /windDirectionSemantic: 'from'/)
  assert.match(scoringSource, /windDirectionCompass = degToDir8\(args\.wd\)/)
  assert.match(scoringSource, /`\$\{compass\} from is \$\{quality\} for \$\{spotLabel\}`/)
})
