export type CalmWindDirectionWeighting = {
  raw_wind_direction_score: number
  effective_wind_direction_score: number
  wind_direction_weight_multiplier: number
  wind_speed_ms: number
  calm_wind_weighting_applied: boolean
}

export function windDirectionWeightMultiplierForSpeed(windSpeedMs: number): number {
  if (!Number.isFinite(windSpeedMs)) return 0
  if (windSpeedMs < 1) return 0
  if (windSpeedMs < 2) return 0.25
  if (windSpeedMs < 3) return 0.6
  return 1
}

export function applyCalmWindDirectionWeighting(rawWindDirectionScore: number, windSpeedMs: number): CalmWindDirectionWeighting {
  const safeRawScore = Number.isFinite(rawWindDirectionScore) ? rawWindDirectionScore : 1
  const safeWindSpeed = Number.isFinite(windSpeedMs) ? windSpeedMs : 0
  const multiplier = windDirectionWeightMultiplierForSpeed(safeWindSpeed)
  const effectiveScore = safeRawScore * multiplier

  return {
    raw_wind_direction_score: safeRawScore,
    effective_wind_direction_score: effectiveScore,
    wind_direction_weight_multiplier: multiplier,
    wind_speed_ms: safeWindSpeed,
    calm_wind_weighting_applied: Math.abs(effectiveScore - safeRawScore) > 0.000001,
  }
}
