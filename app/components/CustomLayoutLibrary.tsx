'use client'
import React, { useRef } from 'react'
import { dragSelectionFromPointers, internalDividerSegments, overwriteWithSelection, resolveShortTap, splitCellAtBoundary, mergeDivider, sortCells, type EditorCell } from '../lib/frameLayoutEditor.mjs'
import { type CustomLayoutCell } from '../lib/customLayouts'

export const initialEditorCells = (): EditorCell[] => [{ id:'whole', col:0, row:0, colSpan:4, rowSpan:4, moduleId:'empty' }]
export const withSlots = (cells: EditorCell[]): CustomLayoutCell[] => sortCells(cells).map((cell, slot) => ({slot,col:cell.col,row:cell.row,colSpan:cell.colSpan,rowSpan:cell.rowSpan}))
export const editorCells = (cells: CustomLayoutCell[]): EditorCell[] => cells.map(({slot,col,row,colSpan,rowSpan})=>({id:`saved:${slot}`,col,row,colSpan,rowSpan,moduleId:'empty'}))

export function CustomLayoutPreview({ cells, onCellTap, assignments = {}, unsupportedSlots = [], editorGuide = false, renderCellLabel }: {cells:CustomLayoutCell[]; onCellTap?:(slot:number)=>void; assignments?:Record<number,string|null>; unsupportedSlots?:number[];editorGuide?:boolean;renderCellLabel?:(assignment:string|null)=>React.ReactNode}) {
  const dividers=internalDividerSegments(cells.map(cell=>({...cell,id:`preview:${cell.slot}`,moduleId:'empty'})))
  return <div className="relative h-full w-full overflow-hidden bg-transparent" aria-label="Custom layout preview" data-layout-surface="open">
    {editorGuide&&<div aria-label="4 by 4 dotted guide" className="pointer-events-none absolute inset-0 z-0">
      {[1,2,3].map(boundary=><React.Fragment key={boundary}><span data-layout-guide="vertical" className="absolute top-0 h-full border-l border-dotted border-[color:var(--fg-25)]" style={{left:`${boundary*25}%`}}/><span data-layout-guide="horizontal" className="absolute left-0 w-full border-t border-dotted border-[color:var(--fg-25)]" style={{top:`${boundary*25}%`}}/></React.Fragment>)}
    </div>}
    {cells.map(cell=><button type="button" key={cell.slot} onClick={()=>onCellTap?.(cell.slot)} disabled={!onCellTap}
      data-layout-cell={`${cell.col},${cell.row},${cell.colSpan},${cell.rowSpan}`}
      className={`absolute z-10 flex items-center justify-center text-2xl ${unsupportedSlots.includes(cell.slot)?'bg-red-500/15 ring-2 ring-inset ring-red-400':'bg-transparent'}`}
      style={{left:`${cell.col*25}%`,top:`${cell.row*25}%`,width:`${cell.colSpan*25}%`,height:`${cell.rowSpan*25}%`}}>
      {renderCellLabel ? renderCellLabel(assignments[cell.slot]??null) : null}
    </button>)}
    {dividers.map(divider=><span key={`${divider.axis}:${divider.boundary}:${divider.from}:${divider.to}`} data-layout-divider={divider.axis} className={`pointer-events-none absolute z-20 ${editorGuide?'bg-[color:var(--fg-60)]':'bg-[color:var(--bd-20)]'} ${divider.axis==='vertical'?(editorGuide?'w-0.5 -translate-x-1/2':'w-px'):(editorGuide?'h-0.5 -translate-y-1/2':'h-px')}`} style={divider.axis==='vertical'?{left:`${divider.boundary*25}%`,top:`${divider.from*25}%`,height:`${(divider.to-divider.from)*25}%`}:{top:`${divider.boundary*25}%`,left:`${divider.from*25}%`,width:`${(divider.to-divider.from)*25}%`}} aria-hidden="true"/>) }
  </div>
}

export function AddLayoutCard({onClick}:{onClick:()=>void}) { return <button type="button" onClick={onClick} className="h-full w-full text-[color:var(--fg-60)]">
  <span className="block text-5xl font-light">+</span><span className="mt-3 block text-sm tracking-[.16em] uppercase">Add layout</span>
</button> }

export function InlineCustomLayoutEditor({cells,onChange,unsupportedSlots=[]}:{cells:EditorCell[];onChange:(cells:EditorCell[])=>void;unsupportedSlots?:number[]}) {
  const drag=useRef<{id:number;start:{x:number;y:number}}|null>(null)
  const point=(event:React.PointerEvent<HTMLDivElement>)=>{const r=event.currentTarget.getBoundingClientRect();return{x:event.clientX-r.left,y:event.clientY-r.top}}
  const down=(e:React.PointerEvent<HTMLDivElement>)=>{e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,start:point(e)}}
  const up=(e:React.PointerEvent<HTMLDivElement>)=>{if(!drag.current||drag.current.id!==e.pointerId)return;const end=point(e),start=drag.current.start;drag.current=null;const moved=Math.hypot(end.x-start.x,end.y-start.y)>=8
    if(moved){const result=overwriteWithSelection(cells,dragSelectionFromPointers(start,end,{width:e.currentTarget.clientWidth,height:e.currentTarget.clientHeight}));if(result.valid)onChange(result.cells)}
    else {const intent=resolveShortTap(cells,end,{width:e.currentTarget.clientWidth,height:e.currentTarget.clientHeight});if(intent.kind==='merge'){const result=mergeDivider(cells,intent.divider);if(result.valid)onChange(result.cells)}else if(intent.kind==='split'&&intent.cell){const result=splitCellAtBoundary(cells,intent.cell.id,intent.guide);if(result.valid)onChange(result.cells)}}}
  return <div aria-label="4 by 4 custom layout editor" onPointerDown={down} onPointerUp={up} className="relative h-full w-full touch-none overflow-hidden">
    <CustomLayoutPreview cells={withSlots(cells)} unsupportedSlots={unsupportedSlots} editorGuide/>
  </div>
}
