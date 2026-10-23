import test from 'node:test'
import assert from 'node:assert/strict'
import {buildEditorialReviewPdf} from '../app/lib/editorialPdfExport.mjs'

test('native PDF export embeds ten numbered, individually seeded landscape frames',()=>{
  const jpg=Uint8Array.from([0xff,0xd8,0xff,0xd9])
  const pages=Array.from({length:10},(_,index)=>({
    jpeg:jpg,width:2400,height:1440,seed:10000+index,
    presetId:index%2?'random':'quarters',
    modules:['date','weather','reminders'],
  }))
  const buffer=buildEditorialReviewPdf(pages,{theme:'light',weatherScene:'partly'})
  const text=Buffer.from(buffer).toString('latin1')
  assert.ok(text.startsWith('%PDF-1.4\n'))
  assert.match(text,/\/Count 10 /)
  assert.equal((text.match(/\/Type \/Page \/Parent /g)||[]).length,10)
  assert.equal((text.match(/\/Subtype \/Image /g)||[]).length,10)
  assert.equal((text.match(/\/Filter \/DCTDecode /g)||[]).length,10)
  assert.equal((text.match(/2400 \/Height 1440/g)||[]).length,10)
  for(let i=0;i<10;i++){
    assert.ok(text.includes('Seed '+(10000+i)),'Seed lost: '+i)
    assert.ok(text.includes('Layout review '+(i+1)+' of 10'))
  }
  const xrefMatch=/xref\n0 (\d+)\n([\s\S]*?)trailer/.exec(text)
  assert.ok(xrefMatch,'PDF xref missing')
  const entries=xrefMatch[2].trim().split('\n')
  assert.equal(Number(xrefMatch[1]),33)
  assert.equal(entries.length,33)
  for(let i=1;i<entries.length;i++){
    const position=Number(entries[i].slice(0,10))
    assert.ok(text.slice(position).startsWith(i+' 0 obj\n'),'Bad object offset '+i)
  }
  const trailer=/startxref\n(\d+)\n%%EOF/.exec(text)
  assert.ok(trailer)
  assert.equal(text.slice(Number(trailer[1]),Number(trailer[1])+4),'xref')
})

test('PDF export rejects missing or invalid preview images',()=>{
  assert.throws(()=>buildEditorialReviewPdf([]),RangeError)
  assert.throws(()=>buildEditorialReviewPdf([{jpeg:new Uint8Array(0)}]),TypeError)
})

test('native PDF builder keeps all 100 pages distinct and reproducible',()=>{
  const jpeg=Uint8Array.from([0xff,0xd8,0xff,0xd9])
  const pages=Array.from({length:100},(_,index)=>({
    jpeg,width:1600,height:960,seed:3000000000+index,
    presetId:index%3===0?'random':'editorial-four',
    modules:index%2?['surf','reminders']:['date','news','weather'],
  }))
  const data=buildEditorialReviewPdf(pages,{theme:'dark',weatherScene:'partly'})
  const pdf=Buffer.from(data).toString('latin1')
  assert.match(pdf,/\/Count 100 /)
  assert.equal((pdf.match(/\/Type \/Page \/Parent /g)||[]).length,100)
  assert.equal((pdf.match(/\/Subtype \/Image /g)||[]).length,100)
  assert.ok(pdf.includes('Layout review 100 of 100'))
  for(let i=0;i<100;i++)
    assert.ok(pdf.includes('Seed '+(3000000000+i)),'Lost seed on page '+(i+1))
  const xref=/xref\n0 (\d+)\n([\s\S]*?)trailer/.exec(pdf)
  assert.ok(xref)
  assert.equal(Number(xref[1]),303)
  assert.equal(xref[2].trim().split('\n').length,303)
  assert.throws(()=>buildEditorialReviewPdf([...pages,pages[0]]),RangeError)
})
