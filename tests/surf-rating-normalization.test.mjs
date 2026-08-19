import assert from 'node:assert/strict'
import test from 'node:test'

import { calibratedFinalSurfRating1to6, normalizeSurfRating1to6, surfRatingIsExperienceBased } from '../app/lib/surf/ratings.ts'

test('normal spot rating stays on existing 1-6 scale', () => {
  const normalized = normalizeSurfRating1to6({ rating: 5, score: 5 })

  assert.equal(normalized.rating, 5)
  assert.equal(normalized.source, 'base')
  assert.equal(normalized.ratingFromExperience, false)
})

test('custom spot rating uses blended 1-6 experience rating when present', () => {
  const normalized = normalizeSurfRating1to6({
    spotId: 'custom:abc',
    rating: 2,
    breakdown: {
      experience: {
        matched: true,
        rating_1_6: 6,
        model_rating_1_6: 2,
        blended_rating_1_6: 5,
      },
    },
  })

  assert.equal(normalized.rating, 5)
  assert.equal(normalized.source, 'experience_blend')
  assert.equal(normalized.ratingFromExperience, true)
  assert.equal(normalized.experienceDiceValue, 5)
})

test('canonical scorer rating is preserved before reconstructing a base score', () => {
  const normalized = normalizeSurfRating1to6({
    rating: 4,
    breakdown: {
      experience: {
        matched: false,
        confidence: 0.34,
        blended_rating_float: 4.45,
        blended_rating_1_6: 4,
      },
      scoring_breakdown: {
        finalScoreFloatAfterPenalties: 3.8,
      },
    },
  })

  assert.equal(normalized.rating, 4)
  assert.equal(normalized.source, 'base')
  assert.equal(normalized.ratingFromExperience, false)
})

test('shared final surf calibration is used for raw final score floats', () => {
  assert.equal(calibratedFinalSurfRating1to6(5.6), 5)
  assert.equal(calibratedFinalSurfRating1to6(5.8), 6)

  const normalizedBase = normalizeSurfRating1to6({
    breakdown: { scoring_breakdown: { finalScoreFloatAfterPenalties: 5.6 } },
  })
  assert.equal(normalizedBase.rating, 5)
  assert.equal(normalizedBase.source, 'base')

  const normalizedExperience = normalizeSurfRating1to6({
    breakdown: { experience: { matched: true, blended_rating_float: 5.6, blended_rating_1_6: 6 } },
  })
  assert.equal(normalizedExperience.rating, 5)
  assert.equal(normalizedExperience.source, 'experience_blend')
  assert.equal(normalizedExperience.ratingFromExperience, true)
})

test('missing or invalid rating is unavailable and does not become 1', () => {
  const normalized = normalizeSurfRating1to6({ rating: null, score: 0, breakdown: { experience: { matched: false } } })

  assert.equal(normalized.rating, undefined)
  assert.equal(normalized.source, 'unavailable')
  assert.equal(normalized.ratingFromExperience, false)
})

test('custom spot dayparts normalize and preserve empty unavailable parts', () => {
  const dayparts = [
    {
      label: 'Morning',
      rating: 3,
      wave_height_range_label: '1.0m',
      breakdown: { experience: { matched: false } },
    },
    {
      label: 'Noon',
      rating: 2,
      wave_height_range_label: '1.2m',
      breakdown: { experience: { matched: true, blended_rating_1_6: 4, rating_1_6: 5 } },
    },
    {
      label: 'Afternoon',
      rating: null,
      wave_height_range_label: '--',
    },
  ]

  const normalized = dayparts.map((part) => normalizeSurfRating1to6(part))

  assert.equal(normalized[0].rating, 3)
  assert.equal(normalized[1].rating, 4)
  assert.equal(surfRatingIsExperienceBased(dayparts[1]), true)
  assert.equal(normalized[2].rating, undefined)
})
