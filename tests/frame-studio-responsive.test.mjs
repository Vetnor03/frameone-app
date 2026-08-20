import test from 'node:test'
import assert from 'node:assert/strict'
import { legacyStudioVariant, responsiveCellProfile, STUDIO_MODULES, studioRenderStrategy } from '../app/lib/responsiveCellProfile.mjs'

test('all 16 rectangular geometries produce responsive profiles', () => {
  for (let colSpan=1;colSpan<=4;colSpan++) for (let rowSpan=1;rowSpan<=4;rowSpan++) {
    const profile=responsiveCellProfile(colSpan,rowSpan,colSpan*196,rowSpan*114)
    assert.equal(profile.colSpan,colSpan);assert.equal(profile.rowSpan,rowSpan)
    assert.equal(profile.area,colSpan*rowSpan);assert.ok(profile.width>0);assert.ok(profile.height>0)
  }
})

test('orientation uses the actual pixel rectangle rather than equal logical spans', () => {
  assert.equal(responsiveCellProfile(1,3,196,343).orientation,'portrait')
  assert.equal(responsiveCellProfile(3,1,589,114).orientation,'landscape')
  assert.equal(responsiveCellProfile(2,2,392,229).orientation,'landscape')
  assert.equal(responsiveCellProfile(4,4,785,458).orientation,'landscape')
  assert.equal(responsiveCellProfile(2,2,200,200).orientation,'square')
  assert.equal(responsiveCellProfile(1,1,106,100).orientation,'square')
})

test('four production geometries retain their legacy Studio variants', () => {
  assert.equal(legacyStudioVariant(4,1),'SMALL');assert.equal(legacyStudioVariant(2,2),'MEDIUM')
  assert.equal(legacyStudioVariant(4,2),'LARGE');assert.equal(legacyStudioVariant(4,4),'XL')
})

test('the other 12 geometries use the responsive renderer', () => {
  let responsive=0,legacy=0
  for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    const strategy=studioRenderStrategy('date',colSpan,rowSpan,colSpan*196,rowSpan*114)
    strategy.path==='responsive'?responsive++:legacy++
  }
  assert.equal(responsive,12);assert.equal(legacy,4)
})

test('all 128 module and geometry combinations have a render strategy', () => {
  assert.equal(STUDIO_MODULES.length,8);let covered=0
  for(const module of STUDIO_MODULES)for(let colSpan=1;colSpan<=4;colSpan++)for(let rowSpan=1;rowSpan<=4;rowSpan++){
    assert.ok(studioRenderStrategy(module,colSpan,rowSpan,colSpan*196,rowSpan*114).path);covered++
  }
  assert.equal(covered,128)
})
