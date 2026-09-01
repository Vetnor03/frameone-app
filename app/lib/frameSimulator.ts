import spec from '../../shared/frame-layouts.json'
import profiles from '../../shared/module-layout-profiles.json'
import registry from '../../shared/frame-modules.json'

export const PANEL = spec.panel
export const VIEWPORT = spec.viewport
export const GRID_SIZE = spec.gridSize
export type CellSize = 'SMALL' | 'MEDIUM' | 'LARGE' | 'XL'
export type GridCell = { col:number; row:number; colSpan:number; rowSpan:number; slot:number; size:CellSize }
export type PixelCell = GridCell & { x:number; y:number; w:number; h:number }
export type LayoutName = keyof typeof spec.layouts
export type ModuleName = 'date'|'weather'|'surf'|'reminders'|'countdown'|'soccer'|'stocks'|'groceries'|'assistant'
export type StudioModuleName = ModuleName
export type DividerLine = { x1:number; y1:number; x2:number; y2:number }
export type CalendarRowMode = 'date' | 'dateLarge' | 'remindersLarge' | 'remindersXL' | 'countdown'
export const frameLayouts = spec
export { profiles as moduleProfiles }
export function visualContractFor(module: ModuleName, size: CellSize) {
  return profiles[module][size.toLowerCase() as 'small'|'medium'|'large'|'xl']
}
export const frameModuleRegistry = registry as {id:ModuleName;label:string}[]
export const studioModuleRegistry:readonly {id:StudioModuleName;label:string}[] = frameModuleRegistry
export const responsiveShowcaseRegistry:readonly {id:StudioModuleName;label:string}[] = studioModuleRegistry
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
const span95 = (start:number, length:number) => {
  const margin = Math.trunc(length * 0.025)
  return [start + margin, start + length - margin] as const
}
export function dividersForLayout(name: LayoutName): DividerLine[] {
  return frameLayouts.dividers[name].map(div => {
    if (div.axis === 'y') {
      const [x1,x2] = span95(VIEWPORT.x, VIEWPORT.width)
      return {x1,y1:gridY(div.boundary),x2,y2:gridY(div.boundary)}
    }
    const fromBoundary = 'fromBoundary' in div && typeof div.fromBoundary === 'number' ? div.fromBoundary : 0
    const toBoundary = 'toBoundary' in div && typeof div.toBoundary === 'number' ? div.toBoundary : GRID_SIZE
    const start = gridY(fromBoundary)
    const length = gridY(toBoundary) - start
    const [y1,y2] = div.span === 'region95' ? span95(start,length) : span95(VIEWPORT.y,VIEWPORT.height)
    return {x1:gridX(div.boundary),y1,x2:gridX(div.boundary),y2}
  })
}
export function quantizeOneBit(ctx: CanvasRenderingContext2D, paperDark:boolean) {
  const image = ctx.getImageData(0,0,PANEL.width,PANEL.height)
  for (let i=0;i<image.data.length;i+=4) {
    const luminance = image.data[i]*0.2126 + image.data[i+1]*0.7152 + image.data[i+2]*0.0722
    const inkPixel = paperDark ? luminance >= 128 : luminance < 128
    const value = inkPixel ? (paperDark ? 255 : 0) : (paperDark ? 0 : 255)
    image.data[i]=value; image.data[i+1]=value; image.data[i+2]=value; image.data[i+3]=255
  }
  ctx.putImageData(image,0,0)
}
export function daysInMonth(year:number, month0:number) {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
}
export function mondayFirstWeekday(year:number, month0:number) {
  const sundayFirst = new Date(Date.UTC(year, month0, 1)).getUTCDay()
  return sundayFirst === 0 ? 6 : sundayFirst - 1
}
export function calendarGeometry(year:number, month0:number, mode:CalendarRowMode) {
  const firstWeekday = mondayFirstWeekday(year, month0)
  const dayCount = daysInMonth(year, month0)
  const calculatedRows = Math.max(4, Math.min(6, Math.ceil((firstWeekday + dayCount) / 7)))
  const rows = mode === 'remindersXL' ? 6 :
    mode === 'dateLarge' || mode === 'remindersLarge' ? Math.min(calculatedRows, 5) : calculatedRows
  return { firstWeekday, dayCount, rows }
}
export function isoWeekNumber(year:number, month0:number, day:number) {
  const date = new Date(Date.UTC(year, month0, day))
  const weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - weekday)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}
export const supportedGeometry: Record<ModuleName, string[]> = {
  date:['4x1','2x2','4x2','4x4'], reminders:['4x1','2x2','4x2','4x4'], weather:['4x1','2x2','4x2','4x4'], countdown:['4x1','2x2','4x2','4x4'],
  surf:['4x1','2x2','4x2','4x4'], soccer:['4x1','2x2','4x2','4x4'], stocks:['4x1','2x2','4x2','4x4'], groceries:['4x1','2x2','4x2','4x4'], assistant:['4x1','2x2','4x2','4x4']
}
export const isSupported = (module:ModuleName, colSpan:number, rowSpan:number) => supportedGeometry[module].includes(`${colSpan}x${rowSpan}`)
