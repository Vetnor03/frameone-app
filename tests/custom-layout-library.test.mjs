import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { customPhysicalPayload, duplicateLayout, normalizeLayoutName, orderedLayoutItems, remapAssignmentsAfterGeometryEdit, validateCustomGeometry } from '../app/lib/customLayouts.mjs'
import { sortCells } from '../app/lib/frameLayoutEditor.mjs'

const cell=(slot,col,row,colSpan,rowSpan)=>({slot,col,row,colSpan,rowSpan})
const rows=[0,1,2,3].map(row=>cell(row,0,row,4,1))
const large=[cell(0,0,0,4,2),cell(1,0,2,4,2)]
const medium=[cell(0,0,0,2,2),cell(1,2,0,2,2),cell(2,0,2,2,2),cell(3,2,2,2,2)]
const full=[cell(0,0,0,4,4)]
const layout=(id,name,sortOrder,createdAt='2026-01-01T00:00:00Z')=>({id,deviceId:'frame',ownerUserId:'user',name,cells:rows,sortOrder,createdAt,updatedAt:createdAt})

test('four immutable built-ins lead and Add layout is permanent last',()=>{
  assert.deepEqual(orderedLayoutItems([]).map(x=>x.key),['default','pyramid','square','full','add-layout'])
  const items=orderedLayoutItems([layout('uuid-b','B',2),layout('uuid-a','A',1)])
  assert.deepEqual(items.map(x=>x.key),['default','pyramid','square','full','uuid-a','uuid-b','add-layout'])
  assert.equal(items[4].id,'uuid-a');assert.equal(items.at(-1).type,'add')
})
test('name is presentation, UUID remains identity through rename/edit',()=>{assert.equal(normalizeLayoutName('  Morning   room  '),'Morning room');const original=layout('stable-uuid','Morning',0),renamed={...original,name:'Kitchen'},edited={...renamed,cells:large};assert.equal(edited.id,original.id)})
test('duplicate gets new UUID, copied geometry, derived name and following order',()=>{const copy=duplicateLayout(layout('a','Morning',4),'b');assert.equal(copy.id,'b');assert.equal(copy.name,'Morning copy');assert.equal(copy.sortOrder,5);assert.deepEqual(copy.cells,rows)})
test('all currently supported physical compositions pass',()=>{for(const cells of [rows,large,medium,full])assert.deepEqual(validateCustomGeometry(cells),{valid:true,errors:[],unsupportedSlots:[]})})
test('unsupported cells and malformed geometry are rejected centrally',()=>{
  assert.equal(validateCustomGeometry(Array.from({length:16},(_,i)=>cell(i,i%4,Math.floor(i/4),1,1))).errors.includes('unsupported_geometry'),true)
  assert.equal(validateCustomGeometry([cell(0,0,0,4,2),cell(0,0,2,4,2)]).errors.includes('duplicate_slot'),true)
  assert.equal(validateCustomGeometry([cell(0,0,0,4,2),cell(1,0,1,4,2)]).errors.includes('overlap'),true)
  assert.equal(validateCustomGeometry([cell(0,0,0,4,1)]).errors.includes('holes'),true)
  assert.equal(validateCustomGeometry([cell(0,0,0,5,4)]).errors.includes('out_of_bounds'),true)
  assert.equal(validateCustomGeometry([{slot:0,col:'0',row:0,colSpan:4,rowSpan:4}]).errors.includes('non_integer'),true)
})
test('physical contract contains geometry and modules but never CellSize',()=>{const source=layout('layout-uuid','Four rows',0),payload=customPhysicalPayload(source,{0:'date',1:'weather',2:'reminders',3:'groceries'});assert.equal(payload.layout,'custom');assert.equal(payload.custom_layout_id,'layout-uuid');assert.deepEqual(payload.cells[0],{...rows[0],module:'date'});assert.equal(JSON.stringify(payload).includes('CellSize'),false);assert.equal(customPhysicalPayload(source,{0:'date'}),null)})
test('editor geometry assigns deterministic slots only at serialization',()=>{const editor=rows.toReversed().map(({slot:ignored,...geometry})=>({...geometry,id:`saved:${ignored}`,moduleId:'empty'}));assert.equal(editor.some(value=>'slot' in value),false);const serialized=sortCells(editor).map((value,slot)=>({slot,col:value.col,row:value.row,colSpan:value.colSpan,rowSpan:value.rowSpan}));assert.deepEqual(serialized,rows)})
test('no-op edit keeps slot assignments while changed geometry clears ambiguous cells',()=>{const assignments={0:'date',1:'weather',2:'reminders',3:'groceries'};assert.deepEqual(remapAssignmentsAfterGeometryEdit(rows,rows,assignments),assignments);assert.deepEqual(remapAssignmentsAfterGeometryEdit(rows,large,assignments),{0:null,1:null});const reordered=rows.toReversed().map((value,index)=>({...value,slot:index}));assert.deepEqual(remapAssignmentsAfterGeometryEdit(rows,reordered,assignments),{0:'groceries',1:'reminders',2:'weather',3:'date'})})
test('schema and routes enforce owner plus frame membership',async()=>{const sql=await readFile(new URL('../supabase/migrations/20260821120000_add_custom_layout_library.sql',import.meta.url),'utf8');assert.match(sql,/owner_user_id = auth\.uid\(\)/);assert.match(sql,/device_members/);assert.match(sql,/enable row level security/);const builder=await readFile(new URL('../app/api/device/frame-config/builder.ts',import.meta.url),'utf8');assert.match(builder,/requirePhysical: true, requireModules: true/);assert.match(builder,/layout: 'default'/)})
