import test from 'node:test'
import assert from 'node:assert/strict'
import {EDITORIAL_MODULES,composeEditorialModule,auditEditorialComposition} from
  '../app/lib/editorialComposition.mjs'
import {EDITORIAL_GRID_PRESETS,GRID_WIDTH,GRID_HEIGHT,
  makeEditorialGrid,randomEditorialGrid,randomEditorialModules,validateEditorialGrid
} from '../app/lib/editorialGridLab.mjs'

test('all named 4x4 layouts completely cover the frame without collisions',()=>{
  assert.ok(EDITORIAL_GRID_PRESETS.length>=16)
  for(const preset of EDITORIAL_GRID_PRESETS){
    const cells=makeEditorialGrid(preset.id)
    assert.deepEqual(validateEditorialGrid(cells),[],preset.id)
    assert.equal(cells.length,preset.rects.length,preset.id)
    let area=0
    for(const tile of cells){
      area+=tile.cols*200*tile.rows*120
      const c=composeEditorialModule(tile.module,tile.cols*200,tile.rows*120)
      assert.deepEqual(auditEditorialComposition(c),[],preset.id+': '+tile.id)
    }
    assert.equal(area,GRID_WIDTH*GRID_HEIGHT,preset.id)
  }
})

test('seeded randomized 4x4 mosaics are reproducible and correctly tiled',()=>{
  const different=new Set()
  let procedural=0,curated=0
  for(let seed=0;seed<600;seed++){
    const value=randomEditorialGrid(seed)
    assert.deepEqual(randomEditorialGrid(seed),value,'not reproducible: '+seed)
    assert.deepEqual(validateEditorialGrid(value.tiles),[],seed)
    assert.ok(value.tiles.length>=1&&value.tiles.length<=16)
    for(const tile of value.tiles){
      assert.ok(EDITORIAL_MODULES.includes(tile.module))
      assert.deepEqual(auditEditorialComposition(
        composeEditorialModule(tile.module,tile.cols*200,tile.rows*120)),
        [],seed+' '+tile.module)
    }
    different.add(value.presetId+JSON.stringify(
      value.tiles.map(({x,y,cols,rows,module})=>({x,y,cols,rows,module}))))
    if(value.presetId==='random')procedural++
    else curated++
  }
  assert.ok(procedural>150)
  assert.ok(curated>120)
  assert.ok(different.size>560)
})

test('individual shuffles avoid repeats until all eleven modules are used',()=>{
  for(const count of [1,4,8,11,16]){
    const modules=randomEditorialModules(17429,count)
    assert.equal(modules.length,count)
    assert.deepEqual(modules,randomEditorialModules(17429,count))
    assert.equal(new Set(modules.slice(0,Math.min(11,count))).size,
      Math.min(11,count))
  }
})

test('grid validation rejects collisions, gaps, illegal bounds and unknown modules',()=>{
  const tiles=makeEditorialGrid('quarters')
  assert.deepEqual(validateEditorialGrid(tiles),[])
  assert.ok(validateEditorialGrid(tiles.slice(1)).some(x=>x.startsWith('Uncovered')))
  const overlap=[...tiles,{...tiles[0],id:'duplicate'}]
  assert.ok(validateEditorialGrid(overlap).some(x=>x.startsWith('Tile overlap')))
  const invalid=tiles.map((x,i)=>i===0?{...x,x:3,cols:2}:x)
  assert.ok(validateEditorialGrid(invalid).some(x=>x.startsWith('Invalid tile bounds')))
  const unknown=tiles.map((x,i)=>i===0?{...x,module:'fictional'}:x)
  assert.ok(validateEditorialGrid(unknown).some(x=>x.startsWith('Unknown module')))
})

test('a mixed frame uses its original Surf Medium reference in any 2x2 tile',()=>{
  const grid=makeEditorialGrid('quarters').map((t,i)=>({...t,
    module:['surf','weather','date','reminders'][i],
  }))
  assert.deepEqual(validateEditorialGrid(grid),[])
  const surf=composeEditorialModule(grid[0].module,grid[0].cols*200,grid[0].rows*120)
  assert.equal(surf.mode,'surf-medium-reference')
})
