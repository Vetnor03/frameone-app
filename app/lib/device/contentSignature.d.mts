export function canonicalVisible(value: unknown): unknown
export function contentDigest(value: unknown): string
export function withPhysicalCellGeometry(settings: Record<string, unknown>, layouts: Record<string, unknown>): Record<string, unknown>
export function activePhysicalReferences(settings: Record<string, unknown>): Map<string, { key: string; base: string; id: number | null; cell: Record<string, unknown> }>
export function buildContentRequestPlan(args: { settings: Record<string, unknown>; deviceId: string; origin: string; now?: number }): { refs: Map<string, unknown>; requests: Array<{ key: string; url: URL; surf?: unknown }>; timeInputs: Record<string, unknown> }
export function collectVisibleContent(args: { settings: Record<string, unknown>; deviceId: string; origin: string; authorization: string; now?: number; fetchImpl?: typeof fetch }): Promise<unknown>
