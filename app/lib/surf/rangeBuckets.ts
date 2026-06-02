export type NumericRangeBucket = {
  min?: number | string | null
  max?: number | string | null
  min_exclusive?: boolean
  max_inclusive?: boolean
}

type RangeBoundSide = 'min' | 'max'

type ParsedRangeBound = {
  value: number
  open: boolean
  valid: boolean
}

function parseRangeBound(raw: unknown, side: RangeBoundSide): ParsedRangeBound {
  if (raw === null || raw === undefined) {
    return {
      value: side === 'min' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      open: true,
      valid: true,
    }
  }

  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (normalized === 'open') {
      return {
        value: side === 'min' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
        open: true,
        valid: true,
      }
    }
    if (side === 'min' && (normalized === '-infinity' || normalized === '-inf')) {
      return { value: Number.NEGATIVE_INFINITY, open: true, valid: true }
    }
    if (side === 'max' && (normalized === 'infinity' || normalized === '+infinity' || normalized === 'inf' || normalized === '+inf')) {
      return { value: Number.POSITIVE_INFINITY, open: true, valid: true }
    }
  }

  const value = Number(raw)
  if (Number.isFinite(value)) return { value, open: false, valid: true }
  return { value: 0, open: false, valid: false }
}

export function isValidRangeBound(raw: unknown, side: RangeBoundSide): boolean {
  return parseRangeBound(raw, side).valid
}

export function rangeBucketSortValue(bucket: NumericRangeBucket): number {
  return parseRangeBound(bucket.min, 'min').value
}

export function rangeBucketMatches(
  bucket: NumericRangeBucket,
  value: number,
  opts?: { upperExclusive?: boolean },
): boolean {
  const min = parseRangeBound(bucket.min, 'min')
  const max = parseRangeBound(bucket.max, 'max')
  if (!min.valid || !max.valid) return false

  const lowerMatches = min.open
    ? true
    : bucket.min_exclusive === true
      ? value > min.value
      : value >= min.value

  const upperMatches = max.open
    ? true
    : opts?.upperExclusive === true
      ? value < max.value
      : value <= max.value

  return lowerMatches && upperMatches
}
