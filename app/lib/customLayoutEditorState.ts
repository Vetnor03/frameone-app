import { sortCells, type EditorCell } from './frameLayoutEditor.mjs'
import type { CustomLayoutCell } from './customLayouts'

// Keep pure layout geometry helpers in the initial bundle. The interactive
// editor component can then be loaded only when the user needs it.
export const initialEditorCells = (): EditorCell[] => [{ id:'whole', col:0, row:0, colSpan:4, rowSpan:4, moduleId:'empty' }]
export const withSlots = (cells: EditorCell[]): CustomLayoutCell[] => sortCells(cells).map((cell, slot) => ({slot,col:cell.col,row:cell.row,colSpan:cell.colSpan,rowSpan:cell.rowSpan}))
export const editorCells = (cells: CustomLayoutCell[]): EditorCell[] => cells.map(({slot,col,row,colSpan,rowSpan})=>({id:`saved:${slot}`,col,row,colSpan,rowSpan,moduleId:'empty'}))
