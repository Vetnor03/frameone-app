import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {WEATHER_VIGNETTE_SCENES,weatherCoastalLines,weatherCoastalSkyFor} from
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
test('all six scenes use only line segments contained in the 140x96 plate',()=>{
  for(const [name,sample] of Object.entries(WEATHER_VIGNETTE_SCENES)){
    const lines=weatherCoastalLines(sample.wmo,sample.windMs)
    assert.ok(lines.length>=18,name)
    for(const line of lines){
      assert.equal(line.length,4)
      assert.ok(line.every((value,index)=>Number.isFinite(value) &&
        value>=0 && value <= (index%2===0?140:96)),name+':'+line)
    }
  }
})
test('same coastal contour coordinates are used in both JS and firmware',()=>{
  const cpp=readFileSync(new URL('../frame/src/display/EditorialFigures.h',import.meta.url),'utf8')
  assert.match(cpp,/weatherCoastalVignette/)
  assert.match(cpp,/coastalSkyFor/)
  const contour=cpp.match(/static const uint8_t shore\[\]\[4\] = \{([\s\S]*?)\n  \};/)?.[1]
  assert.ok(contour)
  const parse=[...contour.matchAll(/\{(\d+),(\d+),(\d+),(\d+)\}/g)]
    .map(match=>match.slice(1).map(Number))
  const scene=weatherCoastalLines(0,3)
  assert.deepEqual(scene.slice(0,parse.length),parse)
  assert.match(cpp,/if \(sky == COAST_RAIN\)/)
  assert.match(cpp,/else if \(sky == COAST_SNOW\)/)
})
