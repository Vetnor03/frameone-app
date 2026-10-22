import assert from 'node:assert/strict'
import {mkdirSync} from 'node:fs'
import {chromium} from 'playwright'

const base=process.env.EDITORIAL_BASE_URL||'http://127.0.0.1:3000'
const browser=await chromium.launch({headless:true,args:['--no-sandbox']})
try {
  const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1})
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
      assert.ok(drawing.paths.length>=17,'Weather engraving lost its fine contours')
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
