'use client'
import React, { useRef, useState } from 'react'
import { dragSelectionFromPointers, mergeCellsInSelection, resolveShortTap, splitCellAtBoundary, mergeDivider, sortCells, type EditorCell } from '../lib/frameLayoutEditor.mjs'
import { normalizeLayoutName, validateCustomGeometry, type CustomLayout, type CustomLayoutCell } from '../lib/customLayouts'

const initialCells = (): EditorCell[] => [{ id:'whole', col:0, row:0, colSpan:4, rowSpan:4, moduleId:'empty' }]
export const withSlots = (cells: EditorCell[]): CustomLayoutCell[] => sortCells(cells).map((cell, slot) => ({slot,col:cell.col,row:cell.row,colSpan:cell.colSpan,rowSpan:cell.rowSpan}))
export const editorCells = (cells: CustomLayoutCell[]): EditorCell[] => cells.map(({slot,col,row,colSpan,rowSpan})=>({id:`saved:${slot}`,col,row,colSpan,rowSpan,moduleId:'empty'}))

export function CustomLayoutPreview({ cells, onCellTap, assignments = {}, unsupportedSlots = [] }: {cells:CustomLayoutCell[]; onCellTap?:(slot:number)=>void; assignments?:Record<number,string|null>; unsupportedSlots?:number[]}) {
  return <div className="relative h-full w-full overflow-hidden rounded-[22px] bg-[color:var(--card-bg)]" aria-label="Custom layout preview">
    {cells.map(cell=><button type="button" key={cell.slot} onClick={()=>onCellTap?.(cell.slot)} disabled={!onCellTap}
      className={`absolute flex items-center justify-center border border-[color:var(--bd-15)] text-2xl ${unsupportedSlots.includes(cell.slot)?'bg-red-500/15 ring-2 ring-red-400':'bg-transparent'}`}
      style={{left:`${cell.col*25}%`,top:`${cell.row*25}%`,width:`${cell.colSpan*25}%`,height:`${cell.rowSpan*25}%`}}>
      {assignments[cell.slot] ? <span className="text-xs uppercase tracking-wider text-[color:var(--fg-60)]">{assignments[cell.slot]}</span> : onCellTap ? <span className="text-[color:var(--fg-35)]">+</span> : null}
    </button>)}
  </div>
}

export function AddLayoutCard({onClick}:{onClick:()=>void}) { return <button type="button" onClick={onClick} className="h-full w-full rounded-[22px] border border-dashed border-[color:var(--bd-25)] bg-[color:var(--card-bg)] text-[color:var(--fg-60)]">
  <span className="block text-5xl font-light">+</span><span className="mt-3 block text-sm tracking-[.16em] uppercase">Add layout</span>
</button> }

export function CustomLayoutFlow({layout,onClose,onSave}:{layout?:CustomLayout;onClose:()=>void;onSave:(name:string,cells:CustomLayoutCell[])=>Promise<void>}) {
  const [step,setStep]=useState<'name'|'editor'>(layout?'editor':'name'),[name,setName]=useState(layout?.name??''),[cells,setCells]=useState<EditorCell[]>(layout?editorCells(layout.cells):initialCells()),[error,setError]=useState(''),[unsupported,setUnsupported]=useState<number[]>([]),[saving,setSaving]=useState(false)
  const drag=useRef<{start:{x:number;y:number}}|null>(null)
  const point=(event:React.PointerEvent<HTMLDivElement>)=>{const r=event.currentTarget.getBoundingClientRect();return{x:event.clientX-r.left,y:event.clientY-r.top}}
  const begin=()=>{const clean=normalizeLayoutName(name);if(!clean){setError('Enter a name for your layout.');return}setName(clean);setError('');setStep('editor')}
  const down=(e:React.PointerEvent<HTMLDivElement>)=>{e.currentTarget.setPointerCapture(e.pointerId);drag.current={start:point(e)}}
  const up=(e:React.PointerEvent<HTMLDivElement>)=>{if(!drag.current)return;const end=point(e),start=drag.current.start;drag.current=null;const moved=Math.hypot(end.x-start.x,end.y-start.y)>8
    if(moved){const result=mergeCellsInSelection(cells,dragSelectionFromPointers(start,end,{width:e.currentTarget.clientWidth,height:e.currentTarget.clientHeight}));if(result.valid)setCells(result.cells)}
    else {const intent=resolveShortTap(cells,end,{width:e.currentTarget.clientWidth,height:e.currentTarget.clientHeight});if(intent.kind==='merge'){const result=mergeDivider(cells,intent.divider);if(result.valid)setCells(result.cells)}else if(intent.kind==='split'&&intent.cell){const result=splitCellAtBoundary(cells,intent.cell.id,intent.guide);if(result.valid)setCells(result.cells)}}}
  const save=async()=>{const geometry=withSlots(cells),validation=validateCustomGeometry(geometry,{requirePhysical:true});if(!validation.valid){setUnsupported(validation.unsupportedSlots);setError(validation.errors.includes('unsupported_geometry')?'This shape isn’t supported on the frame yet.':'The layout must cover the whole frame without overlapping.');return}setSaving(true);setError('');try{await onSave(normalizeLayoutName(name),geometry)}catch(e){setError(e instanceof Error?e.message:'Unable to save layout.')}finally{setSaving(false)}}
  return <div className="fixed inset-0 z-[90] flex justify-center bg-[color:var(--app-bg)] p-5"><div className="flex h-full w-full max-w-[420px] flex-col pt-8">
    <div className="flex items-center justify-between"><button onClick={onClose} className="p-2 text-[color:var(--fg-60)]">Cancel</button><h2 className="text-lg font-semibold">{layout?'Edit layout':'New layout'}</h2><span className="w-14"/></div>
    {step==='name'?<div className="mt-16"><label className="text-xs uppercase tracking-[.18em] text-[color:var(--fg-55)]">Layout name</label><input autoFocus maxLength={40} value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&begin()} placeholder="Morning" className="mt-3 h-14 w-full rounded-2xl border border-[color:var(--bd-15)] bg-[color:var(--card-bg)] px-4 text-lg outline-none focus:border-[#2aa3ff]"/><button onClick={begin} className="mt-5 h-12 w-full rounded-2xl bg-[#2aa3ff] text-white">Continue</button></div>:
    <><p className="mt-5 text-center text-sm text-[color:var(--fg-60)]">Tap a dotted guide to split, tap a divider to merge, or drag across cells.</p><div onPointerDown={down} onPointerUp={up} className="relative mt-6 aspect-[785/458] touch-none overflow-hidden rounded-[22px] bg-[color:var(--card-bg)]" style={{backgroundImage:'radial-gradient(var(--fg-25) 1px,transparent 1px)',backgroundSize:'25% 25%'}}><CustomLayoutPreview cells={withSlots(cells)} unsupportedSlots={unsupported}/></div><div className="mt-5"><label className="text-xs uppercase tracking-[.18em] text-[color:var(--fg-55)]">Name</label><input maxLength={40} value={name} onChange={e=>setName(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[color:var(--bd-15)] bg-transparent px-3"/></div><button disabled={saving} onClick={save} className="mt-auto h-14 w-full rounded-2xl bg-[#2aa3ff] font-medium text-white disabled:opacity-50">{saving?'Saving…':'Save layout'}</button></>}
    {error&&<p role="alert" className="mt-3 text-center text-sm text-red-400">{error}</p>}
  </div></div>
}
