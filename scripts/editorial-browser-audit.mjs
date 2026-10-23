import assert from 'node:assert/strict'
import {mkdirSync,readFileSync} from 'node:fs'
import {chromium} from 'playwright'

const base=process.env.EDITORIAL_BASE_URL||'http://127.0.0.1:3000'
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
try {
  const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1,acceptDownloads:true})
  await page.goto(base+'/editorial-lab',{waitUntil:'domcontentloaded',timeout:120000})
  await page.waitForFunction(()=>{
    const element=document.querySelector('[data-testid="editorial-browser-audit"]')
    return element?.getAttribute('data-checked')==='352'
  },null,{timeout:120000})
  const read=async name=>{
    const element=page.getByTestId(name)
    return {
      checked:Number(await element.getAttribute('data-checked')),
      issues:Number(await element.getAttribute('data-issues')),
    }
  }
  const geometry=await read('editorial-geometry-audit')
  const ink=await read('editorial-browser-audit')
  console.log('RE:MIND editorial geometry:',JSON.stringify(geometry))
  console.log('RE:MIND rendered glyphs:',JSON.stringify(ink))
  assert.equal(geometry.checked,352)
  assert.equal(geometry.issues,0,'Geometry regression in editorial compositions')
  assert.equal(ink.checked,352)
  assert.equal(ink.issues,0,'Rendered browser glyphs overlap or exceed the cell')

  // The parent controller intentionally locks body scrolling. The independent
  // Lab must scroll inside its own viewport, including on a small phone.
  const checkScroll=async ()=>{
    return page.evaluate(()=>{
      const el=document.querySelector('[data-editorial-scroll]')
      if(!(el instanceof HTMLElement))return {found:false,scrollable:false,moved:false}
      const old=el.scrollTop
      const scrollable=el.scrollHeight>el.clientHeight+24&&
        ['auto','scroll'].includes(getComputedStyle(el).overflowY)
      const available=el.scrollHeight-el.clientHeight
      const target=Math.min(140,Math.max(0,available))
      el.scrollTop=target
      const moved=el.scrollTop>=Math.min(16,Math.max(1,target))
      el.scrollTop=old
      return {found:true,scrollable,moved}
    })
  }
  let scrolling=await checkScroll()
  console.log('RE:MIND scroll viewport desktop:',JSON.stringify(scrolling))
  assert.deepEqual(scrolling,{found:true,scrollable:true,moved:true})
  await page.setViewportSize({width:390,height:700})
  scrolling=await checkScroll()
  console.log('RE:MIND scroll viewport mobile:',JSON.stringify(scrolling))
  assert.deepEqual(scrolling,{found:true,scrollable:true,moved:true})
  await page.setViewportSize({width:1440,height:960})

  mkdirSync('artifacts/editorial',{recursive:true})
  const grid=page.locator('label').filter({hasText:'Custom grid'}).locator('select')
  const moduleControl=page.locator('label').filter({hasText:'Module'}).locator('select')
  for(const size of ['2x1','1x3','1x4','2x3','4x4']){
    await grid.selectOption(size)
    await page.screenshot({path:'artifacts/editorial/date-'+size+'.png'})
  }
  await moduleControl.selectOption('surf')
  await grid.selectOption('2x2')
  await page.screenshot({path:'artifacts/editorial/surf-medium-reference-light.png'})
  await page.getByRole('button',{name:'Dark',exact:true}).click()
  await page.screenshot({path:'artifacts/editorial/surf-medium-reference-dark.png'})
  await page.getByRole('button',{name:'Light',exact:true}).click()
  await grid.selectOption('2x1')
  await page.screenshot({path:'artifacts/editorial/surf-2x1.png'})
  await grid.selectOption('4x4')
  await page.screenshot({path:'artifacts/editorial/surf-4x4.png'})

  // One complete contact sheet per module and theme: no manual clicking
  // through 16 individual shapes to review the composition direction.
  await moduleControl.selectOption('weather')
  await grid.selectOption('4x4')
  // Weather v2 acceptance: all six visual states must be distinct, visible
  // and monochrome in *both* frame themes, without altering their geometry.
  const sceneNames=['clear','partly','overcast','windy','rainy','snowy']
  const lightScenes=new Map()
  for(const mode of ['Light','Dark']){
    await page.getByRole('button',{name:mode,exact:true}).click()
    const seen=new Set()
    for(const scene of sceneNames){
      await page.getByTestId('weather-sky-selector').selectOption(scene)
      const drawing=await page.evaluate(()=>{
        const frame=document.querySelector(
          'svg[data-editorial-probe][data-module="weather"][data-width="800"][data-height="480"]')
        const coast=frame?.querySelector('svg[aria-label="Coastal weather field-guide engraving"]')
        if(!(coast instanceof SVGSVGElement)||!frame)return null
        const paths=[...coast.querySelectorAll('path')].map(p=>p.getAttribute('d'))
        const stroke=coast.getAttribute('stroke')
        const background=frame.querySelector('rect')?.getAttribute('fill')
        const box=coast.getBoundingClientRect(), parent=frame.getBoundingClientRect()
        return {paths,stroke,background,
          inside:box.left>=parent.left-1&&box.top>=parent.top-1&&
            box.right<=parent.right+1&&box.bottom<=parent.bottom+1}
      })
      assert.ok(drawing,'Missing Weather engraving: '+mode+' '+scene)
      assert.equal(drawing.background,mode==='Light'?'#FFFFFF':'#000000')
      assert.equal(drawing.stroke,mode==='Light'?'#000000':'#FFFFFF')
      assert.ok(drawing.paths.length>=16,'Weather engraving lost its fine contours')
      assert.equal(drawing.inside,true,'Weather art escapes its content cell')
      const shape=drawing.paths.join('|')
      assert.ok(!seen.has(shape),'Duplicate Weather sky artwork: '+mode+' '+scene)
      seen.add(shape)
      if(mode==='Light')lightScenes.set(scene,shape)
      else assert.equal(shape,lightScenes.get(scene),'Weather light/dark structure changed')
      await page.screenshot({
        path:'artifacts/editorial/weather-coast-'+scene+(mode==='Dark'?'-dark':'')+'.png',
      })
    }
    assert.equal(seen.size,6)
  }
  console.log('RE:MIND coastal illustrations: 12/12 state/theme reviews, all distinct, visible and in bounds')
  await page.getByRole('button',{name:'Light',exact:true}).click()
  await page.getByRole('button',{name:'View all 16 shapes'}).click()
  // The gallery itself is subject to overflow auditing. The first contact
  // sheet revealed tall thumbnails bleeding into adjacent rows.
  const cardIssues=await page.evaluate(()=>{
    const issues=[]
    for(const card of document.querySelectorAll('[data-editorial-cell]')){
      const preview=card.querySelector('svg')
      if(!preview)continue
      const frame=card.querySelector('[data-editorial-thumbnail]')
      const container=frame?.parentElement
      if(!container)continue
      const outer=container.getBoundingClientRect()
      const inner=frame.getBoundingClientRect()
      if(inner.left<outer.left+2||inner.right>outer.right-2||
         inner.top<outer.top+2||inner.bottom>outer.bottom-2)
        issues.push(card.getAttribute('data-editorial-cell'))
    }
    return issues
  })
  console.log('RE:MIND gallery thumbnail overflows:',JSON.stringify(cardIssues))
  assert.deepEqual(cardIssues,[],'Some custom-grid previews escape their gallery cards')
  mkdirSync('artifacts/editorial/matrix',{recursive:true})
  const moduleNames=['date','reminders','weather','news','surf','ski',
    'countdown','soccer','stocks','groceries','assistant']
  // Mixed full-frame composition audit. Test the *actual* rendered 800×480
  // canvas and cell selection controls, not just the individual SVG modules.
  await page.getByTestId('full-frame-tab').click()
  const frame=page.getByTestId('editorial-full-frame')
  const assertFrameCoverage=async()=>{
    const data=await page.evaluate(()=>{
      const frame=document.querySelector('[data-testid="editorial-full-frame"]')
      if(!(frame instanceof HTMLElement))return {found:false,issues:['missing frame'],count:0}
      const outer=frame.getBoundingClientRect()
      const cells=[...frame.querySelectorAll('[data-frame-tile]')]
      const issues=[]
      let area=0
      for(const cell of cells){
        const b=cell.getBoundingClientRect()
        if(b.left<outer.left-1||b.top<outer.top-1||
           b.right>outer.right+1||b.bottom>outer.bottom+1)
          issues.push('tile outside frame')
        area+=b.width*b.height
        const svg=cell.querySelector('svg[data-editorial-probe]')
        if(!svg)issues.push('missing module canvas')
        const expectedW=Number(cell.getAttribute('data-columns'))*200
        const expectedH=Number(cell.getAttribute('data-rows'))*120
        if(svg?.getAttribute('data-width')!==String(expectedW)||
           svg?.getAttribute('data-height')!==String(expectedH))
          issues.push('module geometry mismatch')
      }
      for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){
        const a=cells[i].getBoundingClientRect(),b=cells[j].getBoundingClientRect()
        const ix=Math.min(a.right,b.right)-Math.max(a.left,b.left)
        const iy=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)
        if(ix>1&&iy>1)issues.push('neighboring modules overlap')
      }
      // Subpixel % sizing on non-integer responsive widths can differ by a
      // fraction of a pixel per edge; integer grid coverage is also audited.
      const expected=outer.width*outer.height
      if(Math.abs(area-expected)>Math.max(8,expected*.004))
        issues.push('incomplete frame coverage: '+area+' / '+expected)
      return {found:true,issues,count:cells.length}
    })
    assert.equal(data.found,true)
    assert.deepEqual(data.issues,[])
    assert.equal(Number(await page.getByTestId('frame-layout-audit').getAttribute('data-issues')),0)
    return data.count
  }
  assert.equal(await assertFrameCoverage(),4)
  await page.getByTestId('frame-preset').selectOption('sixteen')
  assert.equal(await assertFrameCoverage(),16)
  assert.equal(await frame.locator('[data-editorial-density="fine-grid"]').count(),16,
    'All 16 customer-selected modules must use fine-grid separators')
  assert.equal(await frame.locator('[data-editorial-center-accent="true"]').count(),1,
    'Dense frame should have one editorial junction, not a dot at each crossing')
  await page.screenshot({path:'artifacts/editorial/full-frame-sixteen-light.png'})
  await page.getByTestId('frame-module-cell-1').selectOption('weather')
  await page.getByTestId('frame-module-cell-2').selectOption('date')
  await page.getByTestId('frame-module-cell-3').selectOption('surf')
  const surfSpacing=await frame.locator('[data-frame-tile="cell-3"] svg').evaluate(svg=>{
    const rects=[...svg.querySelectorAll('g[aria-label*="Surf rating"] rect')]
    const wave=svg.querySelector('text[data-audit-block="detail"]')
    if(!rects.length||!wave)return {missing:true}
    const bottom=Math.max(...rects.map(rect=>rect.getBBox().y+rect.getBBox().height))
    return {missing:false,gap:wave.getBBox().y-bottom}
  })
  assert.equal(surfSpacing.missing,false)
  assert.ok(surfSpacing.gap>=3,'1x1 Surf wave caption collides with rating bars: '+
    JSON.stringify(surfSpacing))
  assert.equal(await frame.locator('[data-frame-tile="cell-1"]').getAttribute('data-module'),'weather')
  assert.equal(await frame.locator('[data-frame-tile="cell-2"]').getAttribute('data-module'),'date')
  assert.equal(await frame.locator('[data-frame-tile="cell-3"]').getAttribute('data-module'),'surf')
  await page.getByTestId('frame-preset').selectOption('quarters')
  await page.getByTestId('frame-module-cell-1').selectOption('surf')
  await page.getByTestId('frame-module-cell-2').selectOption('weather')
  await page.getByTestId('frame-module-cell-3').selectOption('date')
  await page.screenshot({path:'artifacts/editorial/full-frame-quarters-light.png'})
  await page.getByRole('button',{name:'Dark',exact:true}).click()
  await page.screenshot({path:'artifacts/editorial/full-frame-quarters-dark.png'})
  await page.getByRole('button',{name:'Light',exact:true}).click()
  await page.getByTestId('frame-preset').selectOption('feature-left')
  assert.equal(await assertFrameCoverage(),3)
  await page.screenshot({path:'artifacts/editorial/full-frame-feature-left.png'})
  const randomized=new Set()
  for(let iteration=0;iteration<16;iteration++){
    await page.getByTestId('frame-randomize').click()
    const count=await assertFrameCoverage()
    assert.ok(count>=1&&count<=16)
    const signature=await frame.evaluate(node=>[
      node.getAttribute('data-preset'),
      ...[...node.querySelectorAll('[data-frame-tile]')].map(c=>[
        c.getAttribute('data-columns'),c.getAttribute('data-rows'),
        c.getAttribute('data-module'),c.getAttribute('style'),
      ].join(':')),
    ].join('|'))
    randomized.add(signature)
    if(iteration<4)
      await page.screenshot({path:'artifacts/editorial/full-frame-random-'+iteration+'.png'})
  }
  assert.ok(randomized.size>=12,'Randomize repeated too many identical frames')
  // Reviewer-facing contact sheet must show ten *real* mixed compositions
  // and allow any selection to be inspected in the same full-size frame.
  await page.getByTestId('frame-batch').click()
  const sheet=page.getByTestId('frame-batch-results')
  assert.equal(await sheet.getByRole('button',{name:/Inspect random design/}).count(),10)
  assert.ok(await sheet.locator('svg[data-editorial-probe]').count()>=20)
  await assertFrameCoverage()
  const downloadPromise=page.waitForEvent('download',{timeout:90000})
  await page.getByTestId('frame-export-pdf').click()
  const pdfDownload=await downloadPromise
  assert.equal(pdfDownload.suggestedFilename(),'RE-MIND-layout-review-10.pdf')
  const pdfPath='artifacts/editorial/ten-preview-review.pdf'
  await pdfDownload.saveAs(pdfPath)
  const pdf=readFileSync(pdfPath)
  const pdfString=pdf.toString('latin1')
  assert.ok(pdfString.startsWith('%PDF-1.4'),'PDF header missing')
  assert.equal((pdfString.match(/\/Type \/Page \/Parent /g)||[]).length,10,
    'Expected one full-size frame per PDF page')
  assert.equal((pdfString.match(/\/Filter \/DCTDecode /g)||[]).length,10,
    'Expected one high-resolution embedded JPEG per PDF page')
  assert.ok(pdf.length>60000,'PDF unexpectedly small')
  console.log('RE:MIND contact sheet PDF:',pdf.length,'bytes, 10 pages')
  await page.screenshot({path:'artifacts/editorial/full-frame-ten-preview-sheet.png',fullPage:true})
  await sheet.getByRole('button',{name:'Inspect random design 6'}).click()
  await assertFrameCoverage()
  await page.getByTestId('frame-preset').selectOption('sixteen')
  await page.getByTestId('frame-shuffle').click()
  const palette=await frame.locator('[data-frame-tile]').evaluateAll(nodes=>
    nodes.map(node=>node.getAttribute('data-module')))
  assert.equal(new Set(palette.slice(0,11)).size,11,'shuffle should not repeat early')
  await page.getByTestId('frame-clean').click()
  assert.equal(await frame.locator('button').count(),0)
  await page.getByTestId('frame-clean').click()
  assert.equal(await frame.locator('button').count(),16)
  await assertFrameCoverage()
  console.log('RE:MIND mixed 4x4 frames: presets, selection, 16 randomizations, no overlap/gaps')
  await page.getByTestId('single-module-tab').click()

  for(const theme of ['light','dark']){
    await page.getByRole('button',{name:theme==='light'?'Light':'Dark',exact:true}).click()
    for(const name of moduleNames){
      await moduleControl.selectOption(name)
      await page.screenshot({
        path:'artifacts/editorial/matrix/'+name+'-'+theme+'.png',
        fullPage:true,
      })
    }
  }
} finally {
  await browser.close()
}
