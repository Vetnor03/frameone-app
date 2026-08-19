import {
  normalizeCustomSpotScoringProfile,
  scoreSurf,
  type CustomSpotScoringProfile,
  type SurfScoreResult,
  type UserSurfExperienceRecord,
} from '../surfScoring'

export type SurfSwell = {
  present: boolean
  height_m: number
  direction_deg_from: number
  period_s: number
}

export type SurfMarineBundle = {
  time_utc: string
  primary: SurfSwell
  secondary: SurfSwell
  wind_speed_ms: number
  wind_direction_deg_from: number
}

export type SurfSwellMetrics = {
  height: number
  period: number
  correctedHeight: number
  usable: boolean
  nearFlat: boolean
}

export type SurfSwellSelection = {
  chosen: 'primary' | 'secondary'
  chosenSwell: SurfSwell
  selectedSwellIndex: 1 | 2
  primaryScore: SurfScoreResult
  secondaryScore: SurfScoreResult | null
  combinedScore: SurfScoreResult
  primaryMetrics: SurfSwellMetrics
  secondaryMetrics: SurfSwellMetrics
  whySelected: string
}

const MIN_USABLE_SWELL_HEIGHT_M = 0.35
const MIN_USABLE_SWELL_PERIOD_S = 5
const NEAR_FLAT_SWELL_HEIGHT_M = 0.3
const NEAR_FLAT_SWELL_PERIOD_S = 4
const CLEARLY_STRONGER_ENERGY_RATIO = 1.75
const CLEARLY_STRONGER_CORRECTED_M = 0.35

export function correctedSwellHeight(heightM: number, periodS: number) {
  if (!(heightM > 0) || !(periodS > 0)) return heightM
  return heightM * (periodS / 10)
}

export function surfSwellMetrics(swell: SurfSwell): SurfSwellMetrics {
  const height = Number.isFinite(swell.height_m) ? swell.height_m : 0
  const period = Number.isFinite(swell.period_s) ? swell.period_s : 0
  const correctedHeight = correctedSwellHeight(height, period)

  return {
    height,
    period,
    correctedHeight,
    usable: height >= MIN_USABLE_SWELL_HEIGHT_M && period >= MIN_USABLE_SWELL_PERIOD_S,
    nearFlat: height <= NEAR_FLAT_SWELL_HEIGHT_M || period <= NEAR_FLAT_SWELL_PERIOD_S,
  }
}

function clearlyStrongerEnergy(a: SurfSwellMetrics, b: SurfSwellMetrics) {
  if (!a.usable || a.correctedHeight <= 0) return false
  if (a.correctedHeight < b.correctedHeight + CLEARLY_STRONGER_CORRECTED_M) return false
  return a.correctedHeight >= Math.max(
    b.correctedHeight * CLEARLY_STRONGER_ENERGY_RATIO,
    CLEARLY_STRONGER_CORRECTED_M
  )
}

function scoredBlendFloat(scored: SurfScoreResult | null | undefined) {
  const blended = Number(scored?.breakdown?.experience?.blended_rating_float)
  const rating = Number(scored?.rating)
  if (Number.isFinite(blended)) return blended
  if (Number.isFinite(rating)) return rating
  return -Infinity
}

function scoredRating(scored: SurfScoreResult | null | undefined) {
  const rating = Number(scored?.rating)
  return Number.isFinite(rating) ? rating : -Infinity
}

function scoredExperienceMatched(scored: SurfScoreResult | null | undefined) {
  return !!scored?.breakdown?.experience?.matched
}

function scoredConfidence(scored: SurfScoreResult | null | undefined) {
  const confidence = Number(scored?.breakdown?.experience?.confidence)
  return Number.isFinite(confidence) ? confidence : 0
}

function scoredTablesTotal(scored: SurfScoreResult | null | undefined) {
  const total = Number(scored?.breakdown?.tables?.total)
  return Number.isFinite(total) ? total : -Infinity
}

/**
 * Positive means A is better, negative means B is better.
 * Keep this ordering aligned with the surf forecast route: blended score first,
 * then displayed rating, matched experience, confidence and finally table total.
 */
function compareScored(a: SurfScoreResult, b: SurfScoreResult) {
  const aBlend = scoredBlendFloat(a)
  const bBlend = scoredBlendFloat(b)
  if (aBlend !== bBlend) return aBlend > bBlend ? 1 : -1

  const aRating = scoredRating(a)
  const bRating = scoredRating(b)
  if (aRating !== bRating) return aRating > bRating ? 1 : -1

  const aMatched = scoredExperienceMatched(a)
  const bMatched = scoredExperienceMatched(b)
  if (aMatched !== bMatched) return aMatched ? 1 : -1

  const aConfidence = scoredConfidence(a)
  const bConfidence = scoredConfidence(b)
  if (aConfidence !== bConfidence) return aConfidence > bConfidence ? 1 : -1

  const aTotal = scoredTablesTotal(a)
  const bTotal = scoredTablesTotal(b)
  if (aTotal !== bTotal) return aTotal > bTotal ? 1 : -1

  return 0
}

function scoreOne(args: {
  spotKey: string
  swell: SurfSwell
  marine: SurfMarineBundle
  userExperiences?: UserSurfExperienceRecord[]
  customSpotProfile?: CustomSpotScoringProfile | null
}) {
  return scoreSurf({
    spotKey: args.spotKey,
    swellHeightM: args.swell.height_m,
    swellPeriodS: args.swell.period_s,
    swellDirDeg: args.swell.direction_deg_from,
    windSpeedMs: args.marine.wind_speed_ms,
    windDirDeg: args.marine.wind_direction_deg_from,
    userExperiences: args.userExperiences,
    customSpotProfile: args.customSpotProfile,
  })
}

function buildCombinedScore(args: {
  spotKey: string
  marine: SurfMarineBundle
  chosen: 'primary' | 'secondary'
  whySelected: string
  userExperiences?: UserSurfExperienceRecord[]
  customSpotProfile?: CustomSpotScoringProfile | null
}) {
  const chosenSwell = args.chosen === 'secondary' ? args.marine.secondary : args.marine.primary
  const selectedMainSwellIndex = args.chosen === 'secondary' ? 2 : 1

  return scoreSurf({
    spotKey: args.spotKey,
    swellHeightM: chosenSwell.height_m,
    swellPeriodS: chosenSwell.period_s,
    swellDirDeg: chosenSwell.direction_deg_from,
    windSpeedMs: args.marine.wind_speed_ms,
    windDirDeg: args.marine.wind_direction_deg_from,
    selectedMainSwellIndex,
    swells: [
      {
        index: 1,
        height_m: args.marine.primary.height_m,
        period_s: args.marine.primary.period_s,
        direction_deg_from: args.marine.primary.direction_deg_from,
      },
      ...(args.marine.secondary.present
        ? [{
            index: 2,
            height_m: args.marine.secondary.height_m,
            period_s: args.marine.secondary.period_s,
            direction_deg_from: args.marine.secondary.direction_deg_from,
          }]
        : []),
    ],
    forecastTimeUtc: args.marine.time_utc,
    whySelected: args.whySelected,
    userExperiences: args.userExperiences,
    customSpotProfile: args.customSpotProfile,
  })
}

export function selectBestSurfSwell(args: {
  spotKey: string
  marine: SurfMarineBundle
  userExperiences?: UserSurfExperienceRecord[]
  customSpotProfile?: CustomSpotScoringProfile | null
}): SurfSwellSelection {
  const { spotKey, marine, userExperiences, customSpotProfile } = args
  const primaryMetrics = surfSwellMetrics(marine.primary)
  const secondaryMetrics = surfSwellMetrics(marine.secondary)

  const primaryScore = scoreOne({
    spotKey,
    swell: marine.primary,
    marine,
    userExperiences,
    customSpotProfile,
  })

  let secondaryScore: SurfScoreResult | null = null
  let chosen: 'primary' | 'secondary' = 'primary'
  let whySelected = 'secondary swell not present'

  if (marine.secondary.present) {
    secondaryScore = scoreOne({
      spotKey,
      swell: marine.secondary,
      marine,
      userExperiences,
      customSpotProfile,
    })

    if (normalizeCustomSpotScoringProfile(customSpotProfile)) {
      const cmp = compareScored(primaryScore, secondaryScore)
      if (cmp < 0) {
        chosen = 'secondary'
        whySelected = 'custom spot secondary scored higher with custom sector profile'
      } else if (cmp > 0) {
        whySelected = 'custom spot primary scored higher with custom sector profile'
      } else if (secondaryMetrics.correctedHeight > primaryMetrics.correctedHeight) {
        chosen = 'secondary'
        whySelected = 'custom spot scores tied; secondary has greater corrected height'
      } else {
        whySelected = 'custom spot scores tied with custom sector profile; primary fallback'
      }
    } else if (primaryMetrics.usable && secondaryMetrics.nearFlat) {
      whySelected = 'primary usable; secondary is near-flat/short-period'
    } else if (secondaryMetrics.usable && primaryMetrics.nearFlat) {
      chosen = 'secondary'
      whySelected = 'secondary usable; primary is near-flat/short-period'
    } else if (clearlyStrongerEnergy(primaryMetrics, secondaryMetrics)) {
      whySelected = 'primary has clearly stronger usable energy'
    } else if (clearlyStrongerEnergy(secondaryMetrics, primaryMetrics)) {
      chosen = 'secondary'
      whySelected = 'secondary has clearly stronger usable energy'
    } else {
      const cmp = compareScored(primaryScore, secondaryScore)
      if (cmp < 0) {
        chosen = 'secondary'
        whySelected = 'scores comparable after usable-energy gates; secondary scored higher'
      } else if (cmp > 0) {
        whySelected = 'scores comparable after usable-energy gates; primary scored higher'
      } else if (secondaryMetrics.correctedHeight > primaryMetrics.correctedHeight) {
        chosen = 'secondary'
        whySelected = 'scores tied; secondary has greater corrected height'
      } else {
        whySelected = 'scores tied; primary fallback'
      }
    }
  }

  const chosenSwell = chosen === 'secondary' ? marine.secondary : marine.primary
  const selectedSwellIndex = chosen === 'secondary' ? 2 : 1
  const combinedScore = buildCombinedScore({
    spotKey,
    marine,
    chosen,
    whySelected,
    userExperiences,
    customSpotProfile,
  })

  return {
    chosen,
    chosenSwell,
    selectedSwellIndex,
    primaryScore,
    secondaryScore,
    combinedScore,
    primaryMetrics,
    secondaryMetrics,
    whySelected,
  }
}
