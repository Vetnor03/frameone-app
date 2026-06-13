export type SurfRatingSource = 'experience_blend' | 'base' | 'unavailable'

export type NormalizedSurfRating = {
  rating?: number
  source: SurfRatingSource
  ratingFromExperience: boolean
  experienceDiceValue?: number
}

export type SurfRatingVisual = {
  rating: number
  bars: number
  label: string
  color: string
}

export function surfRatingLabel(rating: unknown): string {
  switch (Math.round(Number(rating) || 0)) {
    case 1: return 'Flat'
    case 2: return 'Poor'
    case 3: return 'Poor to Fair'
    case 4: return 'Fair'
    case 5: return 'Good'
    case 6: return 'Epic'
    default: return 'Unavailable'
  }
}

export function surfRatingColor(rating: unknown): string {
  switch (Math.round(Number(rating) || 0)) {
    case 1: return '#dc2626'
    case 2: return '#d97706'
    case 3: return '#facc15'
    case 4: return '#84cc16'
    case 5: return '#15803d'
    case 6: return '#a855f7'
    default: return 'rgba(255,255,255,0.28)'
  }
}

export function surfRatingVisual(rating: unknown): SurfRatingVisual {
  const normalized = Math.max(0, Math.min(6, Math.round(Number(rating) || 0)))
  return {
    rating: normalized,
    bars: normalized,
    label: surfRatingLabel(normalized),
    color: surfRatingColor(normalized),
  }
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : {}
}

function asNumber(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export function calibratedFinalSurfRating1to6(finalScoreFloat: unknown): number | undefined {
  const n = asNumber(finalScoreFloat)
  if (n == null) return undefined
  if (n < 1 || n > 6) return undefined
  if (n < 2.2) return 1
  if (n < 3.4) return 2
  if (n < 4.4) return 3
  if (n < 5.2) return 4
  if (n < 5.75) return 5
  return 6
}

function asRating1to6(value: unknown): number | undefined {
  const n = asNumber(value)
  if (n == null || n < 1 || n > 6) return undefined
  return Math.round(n)
}

function truthy(value: unknown): boolean {
  if (value === true) return true
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase())
  return false
}

function includesExperience(value: unknown): boolean {
  return typeof value === 'string' && value.toLowerCase().includes('experience')
}

export function surfRatingIsExperienceBased(payload: unknown): boolean {
  const record = asRecord(payload)
  const breakdownExperience = asRecord(asRecord(record.breakdown).experience)
  const topExperience = asRecord(record.experience)
  const picked = asRecord(record.picked)
  const pickedBreakdownExperience = asRecord(asRecord(picked.breakdown).experience)
  const pickedExperience = asRecord(picked.experience)

  return (
    truthy(record.isExperienceBased) ||
    truthy(record.ratingFromExperience) ||
    truthy(record.basedOnExperience) ||
    includesExperience(record.ratingSource) ||
    includesExperience(record.source) ||
    truthy(breakdownExperience.matched) ||
    truthy(breakdownExperience.isExperienceBased) ||
    truthy(topExperience.matched) ||
    truthy(topExperience.isExperienceBased) ||
    truthy(pickedBreakdownExperience.matched) ||
    truthy(pickedBreakdownExperience.isExperienceBased) ||
    truthy(pickedExperience.matched) ||
    truthy(pickedExperience.isExperienceBased)
  )
}

export function normalizeSurfRating1to6(payload: unknown, fallbackRating?: unknown): NormalizedSurfRating {
  const record = asRecord(payload)
  const breakdownExperience = asRecord(asRecord(record.breakdown).experience)
  const topExperience = asRecord(record.experience)
  const picked = asRecord(record.picked)
  const pickedBreakdownExperience = asRecord(asRecord(picked.breakdown).experience)
  const pickedExperience = asRecord(picked.experience)
  const isExperienceBased = surfRatingIsExperienceBased(record)

  if (isExperienceBased) {
    const blendedFloatCandidates = [
      breakdownExperience.blended_rating_float,
      topExperience.blended_rating_float,
      pickedBreakdownExperience.blended_rating_float,
      pickedExperience.blended_rating_float,
    ]

    for (const candidate of blendedFloatCandidates) {
      const rating = calibratedFinalSurfRating1to6(candidate)
      if (rating != null) {
        return {
          rating,
          source: 'experience_blend',
          ratingFromExperience: true,
          experienceDiceValue: rating,
        }
      }
    }

    const blendedCandidates = [
      breakdownExperience.blended_rating_1_6,
      topExperience.blended_rating_1_6,
      pickedBreakdownExperience.blended_rating_1_6,
      pickedExperience.blended_rating_1_6,
      record.finalRating,
      asRecord(picked).finalRating,
    ]

    for (const candidate of blendedCandidates) {
      const rating = asRating1to6(candidate)
      if (rating != null) {
        return {
          rating,
          source: 'experience_blend',
          ratingFromExperience: true,
          experienceDiceValue: rating,
        }
      }
    }
  }

  const finalScoreFloatCandidates = [
    asRecord(asRecord(record.breakdown).scoring_breakdown).finalScoreFloatAfterPenalties,
    asRecord(record.breakdown).finalScoreFloatAfterPenalties,
    asRecord(record.breakdown).finalScoreFloat,
  ]

  for (const candidate of finalScoreFloatCandidates) {
    const rating = calibratedFinalSurfRating1to6(candidate)
    if (rating != null) {
      return {
        rating,
        source: isExperienceBased ? 'experience_blend' : 'base',
        ratingFromExperience: isExperienceBased,
        experienceDiceValue: isExperienceBased ? rating : undefined,
      }
    }
  }

  const baseCandidates = [
    record.rating,
    record.score,
    record.stars,
    record.modelRating,
    asRecord(picked).rating,
    asRecord(picked).score,
    asRecord(picked).stars,
    asRecord(picked).modelRating,
    breakdownExperience.model_rating_1_6,
    topExperience.model_rating_1_6,
    pickedBreakdownExperience.model_rating_1_6,
    pickedExperience.model_rating_1_6,
    fallbackRating,
  ]

  for (const candidate of baseCandidates) {
    const rating = asRating1to6(candidate)
    if (rating != null) {
      return {
        rating,
        source: isExperienceBased ? 'experience_blend' : 'base',
        ratingFromExperience: isExperienceBased,
        experienceDiceValue: isExperienceBased ? rating : undefined,
      }
    }
  }

  if (isExperienceBased) {
    const rawExperienceCandidates = [
      breakdownExperience.rating_1_6,
      topExperience.rating_1_6,
      pickedBreakdownExperience.rating_1_6,
      pickedExperience.rating_1_6,
    ]
    for (const candidate of rawExperienceCandidates) {
      const rating = asRating1to6(candidate)
      if (rating != null) {
        return {
          rating,
          source: 'experience_blend',
          ratingFromExperience: true,
          experienceDiceValue: rating,
        }
      }
    }
  }

  return { source: 'unavailable', ratingFromExperience: false }
}
