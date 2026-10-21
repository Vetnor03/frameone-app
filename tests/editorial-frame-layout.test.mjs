import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EditorialRole, editorialPlan, editorialRole, editorialContentBudget,
  showEditorialRole, editorialListCapacity, editorialModuleKind,
} from '../app/lib/editorialFrameLayout.mjs'

test('frame mirror matches firmware editorial geometry profiles', () => {
  for (const [w, h, shape] of [
    [200, 120, 'compact'], [800, 120, 'ribbon'],
    [200, 480, 'column'], [400, 240, 'card'], [800, 480, 'spread'],
  ]) assert.equal(editorialPlan(w, h).shape, shape)
  assert.equal(editorialPlan(800, 480).columns, 2)
  assert.equal(editorialPlan(200, 120).columns, 1)
  assert.equal(editorialPlan(0, 0).safeWidth, 0)
})

test('primary facts win and figures yield on small frame cells', () => {
  const small = editorialPlan(200, 120)
  const large = editorialPlan(800, 480)
  assert.equal(editorialRole(small, EditorialRole.PRIMARY).visible, true)
  assert.equal(editorialRole(large, EditorialRole.HERO).font, 'bold18')
  assert.equal(showEditorialRole(small, EditorialRole.FIGURE, 'decorative'), false)
  assert.equal(showEditorialRole(large, EditorialRole.FIGURE, 'decorative'), true)
  assert.equal(showEditorialRole(small, EditorialRole.SECONDARY, 'optional'), false)
  assert.equal(editorialListCapacity(small, 0), 0)
  assert.ok(editorialListCapacity(large, 90) > 0)
})

test('all shipped modules have editorial content kinds and reject near matches', () => {
  const modules = ['date', 'reminders', 'weather:2', 'news', 'surf:1', 'ski:1',
    'countdown', 'soccer:1', 'stocks:1', 'groceries', 'assistant']
  for (const name of modules) assert.notEqual(editorialModuleKind(name), 'unknown', name)
  assert.equal(editorialModuleKind('weatherwolf'), 'unknown')
})

test('every custom 4x4 rectangle has safe adaptive bounds', () => {
  for (let cols = 1; cols <= 4; cols++) {
    for (let rows = 1; rows <= 4; rows++) {
      const plan = editorialPlan(cols * 200, rows * 120)
      assert.ok(plan.inset >= 0)
      assert.equal(plan.safeWidth, plan.width - plan.inset * 2)
      assert.equal(plan.safeHeight, plan.height - plan.inset * 2)
      assert.ok(plan.columns >= 1 && plan.columns <= 2)
      assert.ok(editorialRole(plan, EditorialRole.PRIMARY).visible)
      if (plan.shape !== 'spread')
        assert.equal(showEditorialRole(plan, EditorialRole.FIGURE, 'decorative'), false)
    }
  }
})

test('module content disclosure protects reading density and reserves figures only where allowed',()=>{
  const micro=editorialPlan(200,120)
  const spread=editorialPlan(800,480)
  assert.equal(editorialContentBudget(micro,'dateFacts').illustration,false)
  assert.equal(editorialContentBudget(spread,'dateFacts').illustration,true)
  assert.equal(editorialContentBudget(spread,'weatherFacts').illustration,true)
  assert.equal(editorialContentBudget(spread,'newsList').illustration,false)
  assert.equal(editorialContentBudget(spread,'newsList').heading,true)
  assert.equal(editorialContentBudget(micro,'newsList').heading,false)
  assert.ok(editorialContentBudget(spread,'reminderList').listItems>=
            editorialContentBudget(micro,'reminderList').listItems)
  for(const kind of ['dateFacts','reminderList','weatherFacts','newsList',
    'surfFacts','skiFacts','countdownFacts','soccerList','stocksFacts','groceryList','assistantText']){
    for(let cw=1;cw<=4;cw++)for(let rh=1;rh<=4;rh++){
      const b=editorialContentBudget(editorialPlan(cw*200,rh*120),kind)
      assert.ok(b.listItems>=0&&b.listItems<=8)
      assert.ok(!b.illustration||['dateFacts','weatherFacts'].includes(kind))
    }
  }
})

test('JS and physical C++ agree on module disclosure for all custom-grid dimensions', async () => {
  const {execFileSync} = await import('node:child_process')
  const {mkdtempSync,writeFileSync,rmSync} = await import('node:fs')
  const {tmpdir} = await import('node:os')
  const {join} = await import('node:path')
  const directory=mkdtempSync(join(tmpdir(),'editorial-budget-parity-'))
  try {
    const source=join(directory,'budget.cpp'), exe=join(directory,'budget')
    writeFileSync(source,`#include "EditorialDesign.h"
#include <cstdio>
int main() {
 for(int k=0;k<11;k++) for(int c=1;c<=4;c++) for(int r=1;r<=4;r++) {
   auto p=EditorialDesign::planFor(c*200,r*120);
   auto b=EditorialDesign::budgetFor(p,(EditorialDesign::ContentKind)k);
   std::printf("%d,%d,%d,%d,%d,%d,%d,%d\\n",k,c,r,b.heading,b.secondary,b.illustration,b.splitColumns,b.listItems);
 }
 return 0;
}
`)
    execFileSync('g++',['-std=c++11','-Wall','-Wextra','-Werror',
      '-I',new URL('../frame/src/display/',import.meta.url).pathname,
      source,'-o',exe])
    const lines=execFileSync(exe,{encoding:'utf8'}).trim().split('\n')
    const kinds=['dateFacts','reminderList','weatherFacts','newsList','surfFacts',
      'skiFacts','countdownFacts','soccerList','stocksFacts','groceryList','assistantText']
    assert.equal(lines.length,11*16)
    for(const line of lines){
      const [k,c,r,heading,secondary,illustration,splitColumns,listItems]=line.split(',').map(Number)
      const b=editorialContentBudget(editorialPlan(c*200,r*120),kinds[k])
      assert.deepEqual([Number(b.heading),Number(b.secondary),Number(b.illustration),
        Number(b.splitColumns),b.listItems],
        [heading,secondary,illustration,splitColumns,listItems],line)
    }
  }finally {rmSync(directory,{recursive:true,force:true})}
})
