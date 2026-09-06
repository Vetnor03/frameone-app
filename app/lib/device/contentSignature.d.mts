export type UnknownRecord = Record<string, unknown>
export type DeadlineType = 'hard' | 'soft'
export type PhysicalDeadline = { at: number; type: DeadlineType; reason: string }
export type PhysicalCell = UnknownRecord & {
  module?: unknown
  col?: unknown
  row?: unknown
  colSpan?: unknown
  rowSpan?: unknown
  w?: unknown
  h?: unknown
}
export type PhysicalSettings = UnknownRecord & {
  layout?: unknown
  theme?: unknown
  language?: unknown
  locale?: unknown
  timeZone?: unknown
  timezone?: unknown
  cells: PhysicalCell[]
  modules?: UnknownRecord
}
export type PhysicalModuleManifest = {
  key: string
  render_hash: string
  bounds: { x: number; y: number; w: number; h: number }
  partial_safe: boolean
  deadlines: PhysicalDeadline[]
}
export type VisibleContent = {
  config: unknown
  active: string[]
  time: UnknownRecord
  sources: UnknownRecord
}

export function canonicalVisible(value: unknown): unknown
export function contentDigest(value: unknown): string
export function physicalRenderDigest(moduleKey: string, visibleValue: unknown, cell?: PhysicalCell, renderConfig?: UnknownRecord): string
export function physicalModuleDeadlines(args: { settings: PhysicalSettings; sources: UnknownRecord; now?: number }): Record<string, PhysicalDeadline[]>
export function physicalRenderManifest(args: { settings: PhysicalSettings; sources: UnknownRecord; now?: number }): PhysicalModuleManifest[]
export function withPhysicalCellGeometry(settings: UnknownRecord, layouts: UnknownRecord): PhysicalSettings
export function activePhysicalReferences(settings: UnknownRecord): Map<string, { key: string; base: string; id: number | null; cell: PhysicalCell }>
export function buildContentRequestPlan(args: { settings: UnknownRecord; deviceId: string; origin: string; now?: number }): {
  refs: Map<string, { key: string; base: string; id: number | null; cell: PhysicalCell }>
  requests: Array<{ key: string; url: URL; surf?: unknown }>
  timeInputs: UnknownRecord
}
export function collectVisibleContent(args: {
  settings: UnknownRecord
  deviceId: string
  origin: string
  authorization: string
  now?: number
  fetchImpl?: typeof fetch
}): Promise<VisibleContent>
