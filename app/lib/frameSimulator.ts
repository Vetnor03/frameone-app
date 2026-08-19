import spec from '../../shared/frame-layouts.json'
import profiles from '../../shared/module-layout-profiles.json'

export const PANEL = spec.panel
export const VIEWPORT = spec.viewport
export const GRID_SIZE = spec.gridSize
export type CellSize = 'SMALL' | 'MEDIUM' | 'LARGE' | 'XL'
export type GridCell = { col:number; row:number; colSpan:number; rowSpan:number; slot:number; size:CellSize }
export type PixelCell = GridCell & { x:number; y:number; w:number; h:number }
export type LayoutName = keyof typeof spec.layouts
export type ModuleName = keyof typeof profiles
export { spec as frameLayouts, profiles as moduleProfiles }
export const gridX = (col:number) => VIEWPORT.x + Math.trunc(VIEWPORT.width * col / GRID_SIZE)
export const gridY = (row:number) => VIEWPORT.y + Math.trunc(VIEWPORT.height * row / GRID_SIZE)
export function validGridCell(c: GridCell) {
  return Number.isInteger(c.col) && Number.isInteger(c.row) && Number.isInteger(c.colSpan) && Number.isInteger(c.rowSpan) && c.col >= 0 && c.row >= 0 && c.col < 4 && c.row < 4 && c.colSpan >= 1 && c.rowSpan >= 1 && c.col + c.colSpan <= 4 && c.row + c.rowSpan <= 4
}
export function resolveGridCell(c: GridCell): PixelCell {
  if (!validGridCell(c)) throw new RangeError('GridCell escapes the 4×4 viewport')
  return {...c, x:gridX(c.col), y:gridY(c.row), w:gridX(c.col+c.colSpan)-gridX(c.col), h:gridY(c.row+c.rowSpan)-gridY(c.row)}
}
export function cellsForLayout(name: LayoutName) { return frameLayouts.layouts[name].map(c => resolveGridCell(c as GridCell)) }
export const supportedGeometry: Record<ModuleName, string[]> = {
  date:['4x1','2x2','4x2','4x4'], reminders:['4x1','2x2','4x2','4x4'], weather:['4x1','2x2','4x2','4x4'], countdown:['4x1','2x2','4x2','4x4']
}
export const isSupported = (module:ModuleName, colSpan:number, rowSpan:number) => supportedGeometry[module].includes(`${colSpan}x${rowSpan}`)
