import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

test('existing physical WMO 3 mapping selects the overcast cloud, not the sun',async()=>{
  const icons=await readFile(new URL('../frame/src/assets/icons/ModuleIcons.cpp',import.meta.url),'utf8')
  const mapper=icons.match(/static int wmoToIconKind\(int wmo\) \{[\s\S]*?\n\}/)?.[0]
  const renderer=icons.match(/void drawWeatherIcon\(int cx, int cy, int size, int wmo\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(mapper)
  assert.ok(renderer)
  assert.match(mapper,/if \(wmo == 0\) return 0;/)
  assert.match(mapper,/if \(wmo == 3\) return 2;/)
  assert.match(renderer,/case 0: \{\s*drawSun\(/)
  assert.match(renderer,/case 2: \{\s*drawCloud4Bumps\(/)
})

test('adaptive Weather renders the representative WMO used by its condition',async()=>{
  const weather=await readFile(new URL('../frame/src/modules/ModuleWeather.cpp',import.meta.url),'utf8')
  const adaptive=weather.match(/static void renderAdaptiveWeather[\s\S]*?\n}\n\n\/\/ -----------------------------------------------------------------------------\n\/\/ Public API/)?.[0]
  assert.ok(adaptive)
  const iconCalls=[...adaptive.matchAll(/ModuleIcons::drawWeatherIcon\([\s\S]*?\);/g)].map(match=>match[0])
  assert.equal(iconCalls.length,2)
  for(const call of iconCalls){
    assert.match(call,/data\.wmo/)
    assert.doesNotMatch(call,/data\.currentWmo/)
  }
})
