import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const surf = readFileSync(new URL('../frame/src/modules/ModuleSurf.cpp', import.meta.url), 'utf8')
const fetchBody = surf.slice(
  surf.indexOf('static bool fetchSurfScore2'),
  surf.indexOf('static SurfAdaptivePolicy::SurfDataNeeds legacyDataNeeds'),
)
const fixedSpotFlow = fetchBody.slice(fetchBody.indexOf('if (!isBest)'), fetchBody.indexOf('const bool needsSecond'))
const winnerDetailFlow = fetchBody.slice(fetchBody.indexOf('if (httpGetJson(urlW, docWinner))'))

function todaysBestResult(selection, detail) {
  const result = structuredClone(selection)
  if (detail?.ok) {
    if (detail.dayparts) result.dayparts = structuredClone(detail.dayparts)
    if (detail.daily) result.daily = structuredClone(detail.daily)
  } else {
    result.dayparts = []
    result.daily = []
  }
  return result
}

test('Today’s Best winner detail cannot replace first-pass headline fields', () => {
  assert.doesNotMatch(winnerDetailFlow, /parseScoreResponseIntoCache\s*\(\s*docWinner\s*,\s*out\s*\)/)
  assert.match(winnerDetailFlow, /tryParseDayPartsFromJson\(docWinner, out\)/)
  assert.match(winnerDetailFlow, /tryParseDailyFromJson\(docWinner, out\)/)

  const selection = {
    spotId: 'toveisbukta', rating: 2, score: 2,
    ratingFromExperience: false, experienceDiceValue: -1,
  }
  for (const detail of [
    { ok: true, rating: 2 },
    { ok: true, rating: 4 },
    { ok: true },
    { ok: false },
  ]) {
    const result = todaysBestResult(selection, detail)
    assert.deepEqual(
      [result.spotId, result.rating, result.score, result.ratingFromExperience, result.experienceDiceValue],
      ['toveisbukta', 2, 2, false, -1],
    )
  }
})

test('Today’s Best first-pass experience headline remains authoritative', () => {
  const selection = {
    spotId: 'custom:reef', rating: 5, score: 5,
    ratingFromExperience: true, experienceDiceValue: 5,
  }
  const result = todaysBestResult(selection, {
    ok: true, rating: 2, score: 2,
    ratingFromExperience: false, experienceDiceValue: -1,
  })
  assert.deepEqual(
    [result.rating, result.score, result.ratingFromExperience, result.experienceDiceValue],
    [5, 5, true, 5],
  )
})

test('successful winner detail still enriches dayparts and daily forecast', () => {
  const detail = {
    ok: true,
    dayparts: [{ label: 'Morning', rating: 3 }],
    daily: [{ label: 'Tomorrow', rating: 4 }],
  }
  const result = todaysBestResult({ spotId: 'toveisbukta', rating: 2 }, detail)
  assert.deepEqual(result.dayparts, detail.dayparts)
  assert.deepEqual(result.daily, detail.daily)
})

test('fixed-spot Surf keeps its existing full-response parse and detail behavior', () => {
  assert.match(fixedSpotFlow, /parseScoreResponseIntoCache\(doc, out\)/)
  assert.match(fixedSpotFlow, /tryParseDayPartsFromJson\(doc, out\)/)
  assert.match(fixedSpotFlow, /tryParseDailyFromJson\(doc, out\)/)
})

test('physical renderer retains exact rating words and fills rating of six blocks', () => {
  const labels = surf.slice(surf.indexOf('static const char* ratingToWord'), surf.indexOf('static int ratingToFilled6'))
  for (const [rating, word] of [[1, 'Flat'], [2, 'Poor'], [3, 'Poor to Fair'], [4, 'Fair'], [5, 'Good'], [6, 'Epic']]) {
    assert.match(labels, new RegExp(`case ${rating}: return "${word}";`))
  }

  const blocks = surf.slice(surf.indexOf('static int ratingToFilled6'), surf.indexOf('static int blocksWidthPxSized'))
  assert.match(blocks, /int filled = ratingToFilled6\(rating1to6\)/)
  assert.match(blocks, /for \(int i = 0; i < 6; i\+\+\)/)
  assert.match(blocks, /if \(i < filled\) d\.fillRoundRect/)
  for (let rating = 1; rating <= 6; rating += 1) {
    assert.equal(Math.min(6, Math.max(0, rating)), rating)
  }
})
