import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {EDITORIAL_TYPEFACES,EDITORIAL_NORWEGIAN_SPECIMEN,
  editorialFaceForBlock} from '../app/lib/editorialIdentity.mjs'
import {buildEditorialReviewPdf} from '../app/lib/editorialPdfExport.mjs'
import {composeEditorialModule,auditEditorialComposition} from '../app/lib/editorialComposition.mjs'

const source=path=>readFile(new URL('../'+path,import.meta.url),'utf8')
test('Gallery, Warm and Original maintain Norwegian-capable self-hosted web font shortlist',async()=>{
  const p=JSON.parse(await source('package.json'))
  const page=await source('app/editorial-lab/page.tsx')
  for(const name of ['instrument-serif','fraunces','dm-sans']){
    assert.ok(p.dependencies['@fontsource/'+name],
      'Missing self-hosted font '+name)
    assert.match(page,new RegExp('@fontsource/'+name))
  }
  assert.equal(Object.keys(EDITORIAL_TYPEFACES).length,3)
  assert.match(EDITORIAL_NORWEGIAN_SPECIMEN,/Æ|æ/)
  assert.match(EDITORIAL_NORWEGIAN_SPECIMEN,/ø/)
  assert.match(EDITORIAL_NORWEGIAN_SPECIMEN,/å/)
  assert.match(page,/data-testid=\{'typeface-'\+key\}/)
})

test('display values get fine serif faces, while headlines and lists remain readable sans',()=>{
  for(const style of ['gallery','warm']){
    for(const module of ['news','reminders','groceries','assistant']){
      const face=editorialFaceForBlock(module,
        {id:'primary',role:'hero',serif:true},style)
      // Text-led modules should not receive decorative numerals just because
      // the composition assigned a hero role.
      assert.match(face.fontFamily,/DM Sans/)
    }
    for(const module of ['weather','date','countdown','stocks']){
      const face=editorialFaceForBlock(module,
        {id:'primary',role:'primary',serif:true},style)
      assert.match(face.fontFamily,/Serif|Fraunces/)
    }
    const list=editorialFaceForBlock('news',
      {id:'extra-1',role:'list',serif:true},style)
    assert.match(list.fontFamily,/DM Sans/)
  }
})

test('Approved Surf Medium retains original face selection at all typography settings',()=>{
  const block={id:'primary',role:'primary',serif:true}
  const baseline=editorialFaceForBlock('surf',block,'original','surf-medium-reference')
  for(const style of Object.keys(EDITORIAL_TYPEFACES)){
    assert.deepEqual(editorialFaceForBlock('surf',block,style,'surf-medium-reference'),
      baseline)
  }
  const surf=composeEditorialModule('surf',400,240)
  assert.equal(surf.mode,'surf-medium-reference')
  assert.deepEqual(auditEditorialComposition(surf),[])
})

test('Typeface styling does not change tile geometry or content fitting',()=>{
  for(const module of ['date','reminders','weather','news','countdown','surf']){
    for(const size of [[200,120],[400,240],[800,480]]){
      const design=composeEditorialModule(module,...size)
      assert.deepEqual(auditEditorialComposition(design),[])
      for(const block of design.blocks)
        if(block.type==='text')
          for(const style of Object.keys(EDITORIAL_TYPEFACES))
            assert.ok(editorialFaceForBlock(module,block,style,design.mode).fontFamily)
    }
  }
})

test('PDF metadata distinguishes the chosen font pairing',()=>{
  const dummy={jpeg:Uint8Array.from([255,216,255,217]),width:1600,height:960,
    seed:321,modules:['date','news'],presetId:'quarters'}
  const data=buildEditorialReviewPdf([dummy],{typography:'gallery'})
  assert.match(Buffer.from(data).toString('latin1'),/Typography: gallery/)
})
