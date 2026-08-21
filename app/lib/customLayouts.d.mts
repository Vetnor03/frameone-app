export type CustomLayoutCell = { slot: number; col: number; row: number; colSpan: number; rowSpan: number }
export type CustomLayout = { id: string; deviceId: string; ownerUserId: string; name: string; cells: CustomLayoutCell[]; sortOrder: number; createdAt: string; updatedAt: string }
export const BUILT_IN_LAYOUT_KEYS: readonly ['default', 'pyramid', 'square', 'full']
export const CUSTOM_LAYOUT_NAME_MAX: number
export const SUPPORTED_PHYSICAL_GEOMETRIES: Set<string>
export function normalizeLayoutName(value: unknown): string
export function orderedLayoutItems(customLayouts: CustomLayout[]): Array<{type: string; key: string; id: string; layout?: CustomLayout}>
export function validateCustomGeometry(cells: unknown, options?: {requirePhysical?: boolean; requireModules?: boolean}): {valid: boolean; errors: string[]; unsupportedSlots: number[]}
export function geometryWithAssignments(cells: CustomLayoutCell[], assignments: Record<number, string | null>): Array<CustomLayoutCell & {module: string}>
export function customPhysicalPayload(layout: CustomLayout, assignments: Record<number, string | null>): {layout: 'custom'; custom_layout_id: string; cells: Array<CustomLayoutCell & {module: string}>} | null
export function remapAssignmentsAfterGeometryEdit(previousCells: CustomLayoutCell[], nextCells: CustomLayoutCell[], assignments: Record<number, string | null>): Record<number, string | null>
export function duplicateLayout(layout: CustomLayout, id: string, now?: string): CustomLayout
