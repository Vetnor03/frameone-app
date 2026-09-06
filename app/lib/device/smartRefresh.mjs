import { createHash } from 'node:crypto'

export const DEADLINE_HARD = 'hard'
export const DEADLINE_SOFT = 'soft'
export const DEFAULT_COALESCE_MS = 15 * 60_000
export const DEFAULT_REVISION_POLL_MS = 10 * 60_000

const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]))
}

/** Hash only a module's already-normalized, actually rendered values. */
export function renderHash(renderState) {
  return createHash('sha256').update(JSON.stringify(canonical(renderState))).digest('hex')
}

const validDeadline = (deadline) => deadline && Number.isFinite(deadline.at) &&
  (deadline.type === DEADLINE_HARD || deadline.type === DEADLINE_SOFT)

export function normalizeModule(input) {
  const deadlines = (input.deadlines ?? []).filter(validDeadline).sort((a, b) => a.at - b.at)
  return {
    key: String(input.key),
    render: canonical(input.render),
    renderHash: input.renderHash ?? renderHash(input.render),
    bounds: input.bounds,
    partialSafe: input.partialSafe !== false,
    sourceCheckedAt: input.sourceCheckedAt ?? null,
    deadlines,
  }
}

/** Select one frame wake without ever postponing a hard boundary. */
export function nextWake(modules, { now, revisionCheckedAt, revisionPollMs = DEFAULT_REVISION_POLL_MS } = {}) {
  const revisionAt = (revisionCheckedAt ?? now) + revisionPollMs
  const deadlines = modules.flatMap((module) => module.deadlines.map((deadline) => ({ ...deadline, key: module.key })))
  const hardAt = Math.min(...deadlines.filter((d) => d.type === DEADLINE_HARD).map((d) => d.at), Infinity)
  const anyAt = Math.min(revisionAt, ...deadlines.map((d) => d.at))
  return Math.min(hardAt, anyAt)
}

/** Work consumed by a single awake/network session. Soft work can be pulled forward. */
export function dueWork(modules, { now, revisionCheckedAt, revisionPollMs = DEFAULT_REVISION_POLL_MS, coalesceMs = DEFAULT_COALESCE_MS, manual = false } = {}) {
  const revisionAt = (revisionCheckedAt ?? now) + revisionPollMs
  const due = new Set()
  for (const module of modules) {
    if (manual || module.deadlines.some((d) => d.at <= now || (d.type === DEADLINE_SOFT && d.at <= now + coalesceMs))) due.add(module.key)
  }
  return { moduleKeys: [...due], revisionPoll: manual || revisionAt <= now + coalesceMs, screenWide: manual }
}

const union = (rectangles) => rectangles.reduce((out, rect) => !out ? { ...rect } : ({
  x: Math.min(out.x, rect.x), y: Math.min(out.y, rect.y),
  w: Math.max(out.x + out.w, rect.x + rect.w) - Math.min(out.x, rect.x),
  h: Math.max(out.y + out.h, rect.y + rect.h) - Math.min(out.y, rect.y),
}), null)

/** Decide display work independently from source/revision work. */
export function displayPlan(previous, desired, { layoutChanged = false, panelPartialSafe = true, health = {} } = {}) {
  const dirty = desired.filter((module) => previous[module.key] !== module.renderHash)
  if (!dirty.length && !layoutChanged) return { type: 'none', dirtyKeys: [], regions: [] }
  const dirtyArea = dirty.reduce((sum, module) => sum + module.bounds.w * module.bounds.h, 0)
  const screenArea = health.screenArea ?? 800 * 480
  const healthRequiresFull = (health.partialCount ?? 0) >= (health.maxPartialCount ?? 20) ||
    (health.accumulatedDirtyArea ?? 0) + dirtyArea >= (health.maxAccumulatedArea ?? screenArea * 3)
  if (layoutChanged || !panelPartialSafe || dirty.some((module) => !module.partialSafe) || healthRequiresFull) {
    return { type: 'full', dirtyKeys: dirty.map((m) => m.key), regions: [{ x: 0, y: 0, w: 800, h: 480 }] }
  }
  const bounds = dirty.map((module) => module.bounds)
  // Combining overlapping/nearby tiles avoids redundant panel setup; distant tiles stay independent.
  const combined = bounds.length > 1 && union(bounds).w * union(bounds).h <= dirtyArea * 1.35
  return { type: 'partial', dirtyKeys: dirty.map((m) => m.key), regions: combined ? [union(bounds)] : bounds }
}

export class SmartRefreshState {
  constructor(saved = {}) {
    this.displayedHashes = { ...(saved.displayedHashes ?? {}) }
    this.backendRevision = saved.backendRevision ?? 0
    this.revisionCheckedAt = saved.revisionCheckedAt ?? null
    this.sourceFreshness = { ...(saved.sourceFreshness ?? {}) }
    this.health = { partialCount: 0, accumulatedDirtyArea: 0, ...(saved.health ?? {}) }
  }

  revisionResult(revision, changedKeys, now) {
    const changed = revision !== this.backendRevision
    this.revisionCheckedAt = now
    if (changed) this.backendRevision = revision
    return { changed, affectedKeys: changed ? [...new Set(changedKeys ?? [])] : [] }
  }

  sourceSucceeded(key, checkedAt) { this.sourceFreshness[key] = checkedAt }
  sourceFailed() { /* Preserve known-good freshness and render state. */ }

  /** Commit physical state only after the synchronous driver reports success. */
  displaySucceeded(plan, desired) {
    for (const module of desired) if (plan.dirtyKeys.includes(module.key) || plan.type === 'full') this.displayedHashes[module.key] = module.renderHash
    if (plan.type === 'full') this.health = { ...this.health, partialCount: 0, accumulatedDirtyArea: 0 }
    if (plan.type === 'partial') {
      this.health.partialCount++
      this.health.accumulatedDirtyArea += plan.regions.reduce((sum, r) => sum + r.w * r.h, 0)
    }
  }

  displayFailed() { /* Deliberately do not advance displayed hashes/counters. */ }
  snapshot() { return canonical(this) }
}
