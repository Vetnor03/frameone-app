import {
  normalizeCustomSpotScoringProfile,
  scoreSurf,
  type CustomSpotScoringProfile,
  type UserSurfExperienceRecord,
} from '../surfScoring'

export type SurfSwell = {
  present: boolean
  height_m: number
  direction_deg_from: number
  period_s: number
}

export type SurfConditions = {
  time_utc: string
  primary: SurfSwell
  secondary: SurfSwell
  wind_speed_ms: number
  wind_direction_deg_from: number
}

const MIN_USABLE_SWELL_HEIGHT_M = 0.35
const MIN_USABLE_SWELL_PERIOD_S = 5
const NEAR_FLAT_SWELL_HEIGHT_M = 0.3
const NEAR_FLAT_SWELL_PERIOD_S = 4
const CLEARLY_STRONGER_ENERGY_RATIO = 1.75
const CLEARLY_STRONGER_CORRECTED_M = 0.35

export function correctedHeightForSwellSelection(height: number, period: number) {
  if (!(height > 0) || !(period > 0)) return height
  return height * (period / 10)
}

function metrics(swell: SurfSwell) {
  const height = Number.isFinite(swell.height_m) ? swell.height_m : 0
  const period = Number.isFinite(swell.period_s) ? swell.period_s : 0
  return {
    height,
    period,
    correctedHeight: correctedHeightForSwellSelection(height, period),
    usable: height >= MIN_USABLE_SWELL_HEIGHT_M && period >= MIN_USABLE_SWELL_PERIOD_S,
    nearFlat: height <= NEAR_FLAT_SWELL_HEIGHT_M || period <= NEAR_FLAT_SWELL_PERIOD_S,
  }
}

function clearlyStrongerEnergy(a: ReturnType<typeof metrics>, b: ReturnType<typeof metrics>) {
  if (!a.usable || a.correctedHeight <= 0) return false
  if (a.correctedHeight < b.correctedHeight + CLEARLY_STRONGER_CORRECTED_M) return false
  return a.correctedHeight >= Math.max(b.correctedHeight * CLEARLY_STRONGER_ENERGY_RATIO, CLEARLY_STRONGER_CORRECTED_M)
}

export function surfScoreBlendedValue(scored: ReturnType<typeof scoreSurf> | null | undefined) {
  const blended = Number(scored?.breakdown.experience?.blended_rating_float)
  const rating = Number(scored?.rating)
  if (Number.isFinite(blended)) return blended
  if (Number.isFinite(rating)) return rating
  return -Infinity
}

export function surfScoreConfidenceValue(scored: ReturnType<typeof scoreSurf> | null | undefined) {
  const confidence = Number(scored?.breakdown.experience?.confidence)
  return Number.isFinite(confidence) ? confidence : 0
}

export function surfScoreTablesValue(scored: ReturnType<typeof scoreSurf> | null | undefined) {
  const total = Number(scored?.breakdown.tables?.total)
  return Number.isFinite(total) ? total : -Infinity
}

function compareScored(a: ReturnType<typeof scoreSurf>, b: ReturnType<typeof scoreSurf>) {
  const aBlend = surfScoreBlendedValue(a)
  const bBlend = surfScoreBlendedValue(b)
  if (bBlend !== aBlend) return bBlend > aBlend ? 1 : -1
  if (b.rating !== a.rating) return b.rating > a.rating ? 1 : -1
  const aMatched = !!a.breakdown.experience?.matched
  const bMatched = !!b.breakdown.experience?.matched
  if (aMatched !== bMatched) return bMatched ? 1 : -1
  const aConfidence = surfScoreConfidenceValue(a)
  const bConfidence = surfScoreConfidenceValue(b)
  if (bConfidence !== aConfidence) return bConfidence > aConfidence ? 1 : -1
  const aTotal = surfScoreTablesValue(a)
  const bTotal = surfScoreTablesValue(b)
  return bTotal === aTotal ? 0 : bTotal > aTotal ? 1 : -1
}

export function compareSurfScoresThenHeight(args: {
  scoredA: ReturnType<typeof scoreSurf>
  scoredB: ReturnType<typeof scoreSurf>
  correctedHeightA: number
  correctedHeightB: number
}) {
  const comparison = compareScored(args.scoredA, args.scoredB)
  if (comparison !== 0) return comparison
  if (args.correctedHeightB > args.correctedHeightA) return 1
  if (args.correctedHeightA > args.correctedHeightB) return -1
  return 0
}

export function selectedSwellFromPick(conditions: SurfConditions, picked: { chosen: 'primary' | 'secondary' }) {
  return picked.chosen === 'secondary' ? conditions.secondary : conditions.primary
}

export function selectedSwellIndex(picked: { chosen: 'primary' | 'secondary' }) {
  return picked.chosen === 'secondary' ? 2 : 1
}

export function pickBestSwell(args: {
  spotKey: string
  marine: SurfConditions
  userExperiences?: UserSurfExperienceRecord[]
  customSpotProfile?: CustomSpotScoringProfile | null
}) {
  const { spotKey, marine, userExperiences, customSpotProfile } = args
  const score = (swell: SurfSwell) => scoreSurf({
    spotKey,
    swellHeightM: swell.height_m,
    swellPeriodS: swell.period_s,
    swellDirDeg: swell.direction_deg_from,
    windSpeedMs: marine.wind_speed_ms,
    windDirDeg: marine.wind_direction_deg_from,
    userExperiences,
    customSpotProfile,
  })
  const primaryScore = score(marine.primary)
  const primaryMetrics = metrics(marine.primary)
  const secondaryMetrics = metrics(marine.secondary)

  const finish = (chosen: 'primary' | 'secondary', secondaryScore: ReturnType<typeof scoreSurf> | null, whySelected: string) => {
    const main = chosen === 'secondary' ? marine.secondary : marine.primary
    const mainIndex = chosen === 'secondary' ? 2 : 1
    const chosenScore = scoreSurf({
      spotKey, swellHeightM: main.height_m, swellPeriodS: main.period_s,
      swellDirDeg: main.direction_deg_from, windSpeedMs: marine.wind_speed_ms,
      windDirDeg: marine.wind_direction_deg_from, selectedMainSwellIndex: mainIndex,
      swells: [
        { index: 1, height_m: marine.primary.height_m, period_s: marine.primary.period_s, direction_deg_from: marine.primary.direction_deg_from },
        ...(marine.secondary.present ? [{ index: 2, height_m: marine.secondary.height_m, period_s: marine.secondary.period_s, direction_deg_from: marine.secondary.direction_deg_from }] : []),
      ],
      forecastTimeUtc: marine.time_utc, whySelected, userExperiences, customSpotProfile,
    })
    const directionScore = (value: ReturnType<typeof scoreSurf> | null) => Number.isFinite(Number(value?.breakdown.tables?.wave_dir.score)) ? Number(value?.breakdown.tables?.wave_dir.score) : null
    const total = (value: ReturnType<typeof scoreSurf> | null) => Number.isFinite(Number(value?.breakdown.tables?.total)) ? Number(value?.breakdown.tables?.total) : null
    const debug = {
      selected_swell_source: chosen, primary_swell_direction_deg_from: marine.primary.direction_deg_from,
      primary_swell_height_m: marine.primary.height_m, primary_swell_period_s: marine.primary.period_s,
      primary_swell_direction_score: directionScore(primaryScore), primary_combined_score: total(primaryScore),
      secondary_swell_direction_deg_from: marine.secondary.present ? marine.secondary.direction_deg_from : null,
      secondary_swell_height_m: marine.secondary.present ? marine.secondary.height_m : null,
      secondary_swell_period_s: marine.secondary.present ? marine.secondary.period_s : null,
      secondary_swell_direction_score: marine.secondary.present ? directionScore(secondaryScore) : null,
      secondary_combined_score: marine.secondary.present ? total(secondaryScore) : null,
      selected_swell_height_m: main.height_m, selected_swell_period_s: main.period_s,
      selected_swell_direction_deg_from: main.direction_deg_from,
    }
    return {
      chosen, chosenScore, primaryScore, secondaryScore, selectedSwellIndex: mainIndex,
      selectedMainSwellIndex: mainIndex,
      contributingSwellIndexes: chosenScore.breakdown.contributingSwellIndexes ?? [mainIndex],
      swellMixSignature: chosenScore.breakdown.swellMixSignature ?? null,
      experienceMatchType: chosenScore.breakdown.experienceMatchType ?? 'none',
      experienceConfidence: chosenScore.breakdown.experienceConfidence ?? 0,
      modelRating: chosenScore.breakdown.modelRating ?? chosenScore.rating,
      experienceRating: chosenScore.breakdown.experienceRating ?? null,
      finalRating: chosenScore.breakdown.finalRating ?? chosenScore.rating,
      selectedSwellHeight: main.height_m, selectedSwellPeriod: main.period_s,
      selectedSwellDirection: main.direction_deg_from,
      ratingSource: Math.abs(chosenScore.experienceAdjustment) > 0.000001 ? 'experience_blend' : 'tables',
      displayHeightSource: chosen, whySelected, selectionDebug: debug, ...debug,
      primaryMetrics, secondaryMetrics,
    }
  }

  if (!marine.secondary.present) return finish('primary', null, 'secondary swell not present')
  const secondaryScore = score(marine.secondary)
  const better = () => {
    return compareSurfScoresThenHeight({
      scoredA: primaryScore,
      scoredB: secondaryScore,
      correctedHeightA: primaryMetrics.correctedHeight,
      correctedHeightB: secondaryMetrics.correctedHeight,
    })
  }
  if (normalizeCustomSpotScoringProfile(customSpotProfile)) {
    const cmp = better()
    return cmp > 0 ? finish('secondary', secondaryScore, 'custom spot secondary scored higher with custom sector profile') : finish('primary', secondaryScore, cmp < 0 ? 'custom spot primary scored higher with custom sector profile' : 'custom spot scores tied with custom sector profile; primary fallback')
  }
  if (primaryMetrics.usable && secondaryMetrics.nearFlat) return finish('primary', secondaryScore, 'primary usable; secondary is near-flat/short-period')
  if (secondaryMetrics.usable && primaryMetrics.nearFlat) return finish('secondary', secondaryScore, 'secondary usable; primary is near-flat/short-period')
  if (clearlyStrongerEnergy(primaryMetrics, secondaryMetrics)) return finish('primary', secondaryScore, 'primary has clearly stronger usable energy')
  if (clearlyStrongerEnergy(secondaryMetrics, primaryMetrics)) return finish('secondary', secondaryScore, 'secondary has clearly stronger usable energy')
  const cmp = better()
  return cmp > 0 ? finish('secondary', secondaryScore, 'scores comparable after usable-energy gates; secondary scored higher') : finish('primary', secondaryScore, cmp < 0 ? 'scores comparable after usable-energy gates; primary scored higher' : 'scores tied; primary fallback')
}
