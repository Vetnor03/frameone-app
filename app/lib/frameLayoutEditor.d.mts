export type EditorModuleId = 'empty' | 'date' | 'weather' | 'surf' | 'reminders' | 'countdown' | 'soccer' | 'stocks' | 'groceries' | 'ai-follow'
export type EditorCell = {id:string; col:number; row:number; colSpan:number; rowSpan:number; moduleId:EditorModuleId}
export type Point = {x:number;y:number}
export type Stroke = {start:Point;end:Point}
export type NormalizedStroke = {orientation:'vertical'|'horizontal';boundary:number;rangeStart:number;rangeEnd:number;nearestEdge:'left'|'right'|'top'|'bottom'}
export type DividerSegment = {axis:'vertical'|'horizontal';boundary:number;from:number;to:number}
export type RemovableDividerSegment = DividerSegment & {cellIds:[string,string]}
export type DividerHit = RemovableDividerSegment & {distance:number}
export type MergeResult = {valid:boolean;reason?:string;cells:EditorCell[];mergedId?:string}
export type SplitGuide = {axis:'vertical'|'horizontal';boundary:number;distance:number}
export type GridSelection = {col:number;row:number;colSpan:number;rowSpan:number}
export type StrokePreview = {valid:boolean;reason?:string;cells:EditorCell[];parentId?:string;intendedId?:string;normalized?:NormalizedStroke}
export type DividerStrokePreview = {valid:boolean;reason?:string;cells:EditorCell[];normalized?:Pick<NormalizedStroke,'orientation'|'boundary'|'rangeStart'|'rangeEnd'>;intent?:'draw'|'erase'}
export type EditorHistory = {past:EditorCell[][];present:EditorCell[];future:EditorCell[][]}
export const GRID_SIZE:number
export const MIN_STROKE_PX:number
export function cellArea(cell:EditorCell):number
export function sortCells(cells:EditorCell[]):EditorCell[]
export function detectOrientation(stroke:Stroke):'vertical'|'horizontal'
export function snapBoundary(value:number,extent:number):number
export function hasOverlap(a:EditorCell,b:EditorCell):boolean
export function validateLayout(cells:EditorCell[]):boolean
export function internalDividerSegments(cells:EditorCell[]):DividerSegment[]
export function removableDividerSegments(cells:EditorCell[]):RemovableDividerSegment[]
export function findDividerNearPointer(cells:EditorCell[],point:Point,viewport?:{width:number;height:number},tolerance?:number):DividerHit|undefined
export function nearestValidSplitGuide(cell:EditorCell|undefined,point:Point,viewport?:{width:number;height:number}):SplitGuide|undefined
export function findSplitGuideNearPointer(cell:EditorCell|undefined,point:Point,viewport?:{width:number;height:number},tolerance?:number):SplitGuide|undefined
export function resolveShortTap(cells:EditorCell[],point:Point,viewport?:{width:number;height:number}):{kind:'merge';divider:DividerHit}|{kind:'split';cell:EditorCell;guide:SplitGuide}|{kind:'select';cell:EditorCell|undefined}
export function splitCellAtBoundary(cells:EditorCell[],cellId:string|undefined,guide:Pick<SplitGuide,'axis'|'boundary'>|undefined):StrokePreview
export function splitCellNearPointer(cells:EditorCell[],point:Point,viewport?:{width:number;height:number},tolerance?:number):StrokePreview&{guide?:SplitGuide}
export function gridCellAtPointer(point:Point,viewport?:{width:number;height:number}):{col:number;row:number}
export function selectionBetweenGridCells(start:{col:number;row:number},end:{col:number;row:number}):GridSelection
export function dragSelectionFromPointers(start:Point,end:Point,viewport?:{width:number;height:number}):GridSelection
export function snapDragSelection(start:Point,end:Point,viewport?:{width:number;height:number}):GridSelection
export function cellsFullyContainedInSelection(cells:EditorCell[],selection:GridSelection):EditorCell[]
export function selectionIsExactlyTiled(cells:EditorCell[],selection:GridSelection):boolean
export function mergeCellsInSelection(cells:EditorCell[],selection:GridSelection):MergeResult
export function subtractRectangle(cell:EditorCell,cut:GridSelection):EditorCell[]
export function overwriteWithSelection(cells:EditorCell[],selection:GridSelection):MergeResult
export function mergeCells(cells:EditorCell[],firstId:string,secondId:string):MergeResult
export function mergeDivider(cells:EditorCell[],divider:RemovableDividerSegment|DividerHit|undefined):MergeResult
export function findContainingCell(cells:EditorCell[],point:Point):EditorCell|undefined
export function chooseNearestEdge(cell:EditorCell,orientation:'vertical'|'horizontal',boundary:number):'left'|'right'|'top'|'bottom'
export function partitionCell(parent:EditorCell,normalized:NormalizedStroke):{pieces:EditorCell[];intendedId:string}
export function previewStroke(cells:EditorCell[],stroke:Stroke,viewport?:{width:number;height:number}):StrokePreview
export function finalizeStroke(cells:EditorCell[],start:Point,end:Point,viewport?:{width:number;height:number}):StrokePreview
export function previewDividerStroke(cells:EditorCell[],stroke:Stroke,viewport?:{width:number;height:number}):DividerStrokePreview
export function finalizeDividerStroke(cells:EditorCell[],start:Point,end:Point,viewport?:{width:number;height:number}):DividerStrokePreview
export function commitPreview(cells:EditorCell[],preview:StrokePreview):EditorCell[]
export function initialLayout():EditorCell[]
export function createHistory(initial?:EditorCell[]):EditorHistory
export function pushHistory(history:EditorHistory,next:EditorCell[]):EditorHistory
export function undoHistory(history:EditorHistory):EditorHistory
export function redoHistory(history:EditorHistory):EditorHistory
