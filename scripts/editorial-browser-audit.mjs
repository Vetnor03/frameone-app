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

  mkdirSync('artifacts/editorial',{recursive:true})
  const grid=page.locator('label').filter({hasText:'Custom grid'}).locator('select')
  const moduleControl=page.locator('label').filter({hasText:'Module'}).locator('select')
  for(const size of ['2x1','1x3','1x4','2x3','4x4']){
    await grid.selectOption(size)
    await page.screenshot({path:'artifacts/editorial/date-'+size+'.png'})
  }
  await moduleControl.selectOption('surf')
  await grid.selectOption('2x1')
  await page.screenshot({path:'artifacts/editorial/surf-2x1.png'})
  await grid.selectOption('4x4')
  await page.screenshot({path:'artifacts/editorial/surf-4x4.png'})

  // One complete contact sheet per module and theme: no manual clicking
  // through 16 individual shapes to review the composition direction.
  await page.getByRole('button',{name:'View all 16 shapes'}).click()
  // The gallery itself is subject to overflow auditing. The first contact
  // sheet revealed tall thumbnails bleeding into adjacent rows.
  const cardIssues=await page.evaluate(()=>{
    const issues=[]
    for(const card of document.querySelectorAll('[data-editorial-cell]')){
      const preview=card.querySelector('svg')
      if(!preview)continue
      const outer=card.getBoundingClientRect()
      const inner=preview.getBoundingClientRect()
      if(inner.left<outer.left-1||inner.right>outer.right+1||
         inner.top<outer.top-1||inner.bottom>outer.bottom+1)
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
