import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {WEATHER_VIGNETTE_SCENES,weatherCoastalCurves,weatherCoastalSkyFor} from
  '../app/lib/editorialWeatherVignette.mjs'

test('coastal weather scene priority matches firmware rain, snow, wind and overcast rules',()=>{
  assert.equal(weatherCoastalSkyFor(0,3),'fair')
  assert.equal(weatherCoastalSkyFor(2,3),'fair')
  assert.equal(weatherCoastalSkyFor(3,3),'overcast')
  assert.equal(weatherCoastalSkyFor(2,10),'wind')
  assert.equal(weatherCoastalSkyFor(61,12),'rain')
  assert.equal(weatherCoastalSkyFor(73,12),'snow')
  assert.equal(weatherCoastalSkyFor(85,1),'snow')
})
test('all six scenes use hand-composed Bézier handles inside the 140x96 plate',()=>{
  for(const [name,sample] of Object.entries(WEATHER_VIGNETTE_SCENES)){
    const lines=weatherCoastalCurves(sample.wmo,sample.windMs)
    assert.ok(lines.length>=17,name)
    for(const line of lines){
      assert.equal(line.length,8)
      assert.ok(line.every((value,index)=>Number.isFinite(value) &&
        value>=0 && value <= (index%2===0?140:96)),name+':'+line)
    }
  }
})
test('same coastal contour coordinates are used in both JS and firmware',()=>{
  const cpp=readFileSync(new URL('../frame/src/display/EditorialFigures.h',import.meta.url),'utf8')
  assert.match(cpp,/weatherCoastalVignette/)
  assert.match(cpp,/coastalSkyFor/)

  // Prove every base and weather-variant curve matches the hardware control points.
  const names=['shore','windPlant','cloud','partlyCloud','overcastCloud','snowCloud',
    'windCloud','fair','wind','rain','snow']
  const expected=[
    weatherCoastalCurves(0,2),
    weatherCoastalCurves(2,2),
    weatherCoastalCurves(3,2),
    weatherCoastalCurves(2,9),
    weatherCoastalCurves(61,2),
    weatherCoastalCurves(73,2),
  ]
  for(const name of names) {
    const needle='static const uint8_t '+name+'[][8] = {'
    const start=cpp.indexOf(needle)
    assert.ok(start>=0,'C++ array '+name)
    const block=cpp.slice(start+needle.length,cpp.indexOf('\n  };',start))
    const points=[...block.matchAll(/\{([\d,]+)\}/g)]
      .map(m=>m[1].split(',').map(Number))
    assert.ok(points.length>=2,name)
    const jsFamily=expected.find(scene=>scene.some(curve=>
      points.some(point=>point.every((n,index)=>n===curve[index]))))
    assert.ok(jsFamily,'missing JS counterpart '+name)
    // Compare every control point with at least one weather scene.
    for(const point of points)assert.ok(expected.some(scene=>
      scene.some(curve=>curve.every((n,index)=>n===point[index]))),
      name+':'+point.join(','))
  }
  assert.ok(cpp.includes('if(sky==COAST_RAIN)'))
  assert.ok(cpp.includes('else if(sky==COAST_SNOW)'))
})

test('six hand-composed Weather variants are visually distinct while retaining shared shore',()=>{
  const scenes=Object.entries(WEATHER_VIGNETTE_SCENES).map(([name,s])=>({
    name,curves:weatherCoastalCurves(s.wmo,s.windMs)
  }))
  // The dune and sea stay constant; only Wind has a leaning plant.
  const core=scenes[0].curves.slice(0,6)
  const unique=new Set()
  for(const {name,curves} of scenes){
    assert.deepEqual(curves.slice(0,core.length),core,name+' should preserve the engraved coastline')
    const key=JSON.stringify(curves)
    assert.ok(!unique.has(key),name+' should have a distinct sky illustration')
    unique.add(key)
  }
  assert.equal(unique.size,6)
})

test('wind bends coastal grass and stretches cloud without changing approved rain',()=>{
  const windy=weatherCoastalCurves(2,10)
  const breezy=weatherCoastalCurves(2,4)
  const rainy=weatherCoastalCurves(61,4)
  // Six unchanged water/dune curves, but a different plant and cloud contour.
  assert.deepEqual(windy.slice(0,6),breezy.slice(0,6))
  assert.notDeepEqual(windy.slice(6,13),breezy.slice(6,13))
  assert.notDeepEqual(windy.slice(13,15),breezy.slice(16,18))
  // Approved rainy control points are strictly unchanged.
  assert.deepEqual(rainy.slice(-3),[
    [79,53,78,56,76,60,74,64],
    [95,52,93,55,90,59,89,63],
    [111,54,110,56,108,59,107,62],
  ])
  // No use of the Snow X-mark glyphs in the Windy plate.
  assert.equal(windy.length,6+7+2+2)
})
test('Snow has three fine floating flecks and no rain-slash marks',()=>{
  const snowy=weatherCoastalCurves(73,3)
  const rain=weatherCoastalCurves(61,3)
  const flecks=snowy.slice(-6)
  assert.equal(flecks.length,6)
  // Each flake uses two mirrored organic arcs, rather than two crossing X
  // strokes or a straight rain dash.
  for(let i=0;i<6;i+=2){
    const upper=flecks[i],lower=flecks[i+1]
    assert.equal(upper.length,8)
    assert.equal(lower.length,8)
    assert.deepEqual(upper.slice(6),lower.slice(0,2))
    assert.deepEqual(upper.slice(0,2),lower.slice(6))
    assert.ok(upper[1]>upper[3] && upper[3]<upper[7],
      'floating fleck should have a small curved crown')
    assert.ok(upper[6]-upper[0]>=3 && upper[6]-upper[0]<=5)
  }
  assert.notDeepEqual(flecks,rain.slice(-3))
  assert.equal(snowy.length,16+3+6)
})

test('Partly Cloudy is airy while Overcast is a broad stationary cloud bank',()=>{
  const partly=weatherCoastalCurves(2,4)
  const overcast=weatherCoastalCurves(3,4)
  const clear=weatherCoastalCurves(0,4)
  assert.equal(partly.length,16+2+2)
  assert.equal(overcast.length,16+5)
  assert.equal(clear.length,16+2) // Clear is not redesigned here
  assert.deepEqual(partly.slice(0,16),overcast.slice(0,16))
  assert.notDeepEqual(partly.slice(16,18),overcast.slice(16,18))
  assert.notDeepEqual(partly.slice(-2),overcast.slice(-2))
  assert.equal(overcast.length>partly.length,true)
})

test('Rain stays byte-for-byte identical to the approved Weather v2 baseline',()=>{
  const rainy=weatherCoastalCurves(61,4)
  assert.equal(rainy.length,16+5+3)
  assert.deepEqual(rainy.slice(-3),[
    [79,53,78,56,76,60,74,64],
    [95,52,93,55,90,59,89,63],
    [111,54,110,56,108,59,107,62],
  ])
  assert.deepEqual(rainy.slice(16,21),[
    [58,39,69,38,73,30,84,29],
    [84,29,96,26,104,30,114,30],
    [114,30,126,30,131,35,137,37],
    [72,46,91,44,105,44,124,46],
    [84,23,96,21,101,23,112,26],
  ])
})
