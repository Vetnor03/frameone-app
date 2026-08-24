import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {promisify} from 'node:util'
import test from 'node:test'

const execFileAsync=promisify(execFile)

test('physical WMO codes select the correct weather icon families',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'weather-icons-'))
  const source=join(directory,'mapping.cpp')
  await writeFile(source,`#include "frame/src/assets/icons/WeatherIconKind.h"
#include <cassert>
using namespace ModuleIcons;
int main() {
  assert(weatherIconKindForWmo(0) == WEATHER_ICON_CLEAR);
  assert(weatherIconKindForWmo(0) != weatherIconKindForWmo(3));
  assert(weatherIconKindForWmo(1) == WEATHER_ICON_PARTLY_CLOUDY);
  assert(weatherIconKindForWmo(2) == WEATHER_ICON_PARTLY_CLOUDY);
  assert(weatherIconKindForWmo(3) == WEATHER_ICON_OVERCAST);
  assert(weatherIconKindForWmo(45) == WEATHER_ICON_FOG);
  assert(weatherIconKindForWmo(48) == WEATHER_ICON_FOG);
  assert(weatherIconKindForWmo(51) == WEATHER_ICON_RAIN);
  assert(weatherIconKindForWmo(57) == WEATHER_ICON_RAIN);
  assert(weatherIconKindForWmo(61) == WEATHER_ICON_RAIN);
  assert(weatherIconKindForWmo(65) == WEATHER_ICON_RAIN);
  assert(weatherIconKindForWmo(66) == WEATHER_ICON_SLEET);
  assert(weatherIconKindForWmo(67) == WEATHER_ICON_SLEET);
  assert(weatherIconKindForWmo(71) == WEATHER_ICON_SNOW);
  assert(weatherIconKindForWmo(77) == WEATHER_ICON_SNOW);
  assert(weatherIconKindForWmo(80) == WEATHER_ICON_RAIN);
  assert(weatherIconKindForWmo(82) == WEATHER_ICON_RAIN);
  assert(weatherIconKindForWmo(85) == WEATHER_ICON_SNOW);
  assert(weatherIconKindForWmo(86) == WEATHER_ICON_SNOW);
  assert(weatherIconKindForWmo(95) == WEATHER_ICON_THUNDER);
  assert(weatherIconKindForWmo(99) == WEATHER_ICON_THUNDER);
}
`)
  const executable=join(directory,'mapping')
  try{
    await execFileAsync('g++',['-std=c++11','-I.',source,'-o',executable])
    await execFileAsync(executable)
  }
  finally{await rm(directory,{recursive:true,force:true})}
})

test('anchor and adaptive Weather render the WMO used by the condition',async()=>{
  const weather=await readFile(new URL('../frame/src/modules/ModuleWeather.cpp',import.meta.url),'utf8')
  const adaptive=weather.match(/static void renderAdaptiveWeather[\s\S]*?\n}\n\n\/\/ -----------------------------------------------------------------------------\n\/\/ Public API/)[0]
  assert.match(adaptive,/drawWeatherIcon\([\s\S]*?data\.wmo\)/)
  assert.doesNotMatch(adaptive,/drawWeatherIcon\([\s\S]*?data\.currentWmo\)/)
  for(const renderer of ['renderMedium','renderMiniDay','renderLargeXL'])
    assert.match(weather,new RegExp(`static void ${renderer}[\\s\\S]*?drawWeatherIcon`))
})
