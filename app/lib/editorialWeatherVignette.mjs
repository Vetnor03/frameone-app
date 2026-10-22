// The coordinates mirror EditorialFigures::weatherCoastalVignette in ESP32
// firmware. One quiet family of coastal 1-bit line engravings, not icon art.
export const WEATHER_VIGNETTE_SCENES=Object.freeze({
  clear: {label:'Clear',wmo:0,windMs:3,detail:'Clear skies'},
  partly: {label:'Partly cloudy',wmo:2,windMs:4,detail:'Cloudy with sunny spells'},
  overcast: {label:'Overcast',wmo:3,windMs:3,detail:'Cloudy'},
  windy: {label:'Windy',wmo:2,windMs:10,detail:'Breezy on the coast'},
  rainy: {label:'Rain',wmo:61,windMs:4,detail:'Showers and rain'},
  snowy: {label:'Snow',wmo:73,windMs:3,detail:'Snow showers'},
})

export function weatherCoastalSkyFor(wmo,windMs){
  if((wmo>=71&&wmo<=77)||wmo===85||wmo===86)return 'snow'
  if((wmo>=51&&wmo<=67)||(wmo>=80&&wmo<=82)||wmo>=95)return 'rain'
  if(windMs>=8)return 'wind'
  if(wmo>=3)return 'overcast'
  return 'fair'
}
// Source-of-truth cubic control points mirrored byte-for-byte by C++.
// Four pairs per row: start, first handle, second handle, endpoint.
const shore=Object.freeze([
  [7,80,16,78,23,72,31,70],
  [31,70,43,66,51,73,62,75],
  [62,75,83,78,101,76,133,73],
  [11,86,24,85,33,83,48,85],
  [63,87,81,86,92,88,111,85],
  [119,89,124,88,132,88,137,86],
  [32,70,30,57,23,43,31,26],
  [31,26,34,20,39,17,47,16],
  [28,59,22,52,17,47,10,46],
  [10,46,16,45,23,48,28,54],
  [29,49,34,41,42,34,51,33],
  [51,33,47,40,39,46,31,51],
  [30,65,21,61,18,59,12,58],
  [34,58,39,55,45,53,51,53],
  [31,34,34,33,38,30,39,27],
  [38,20,41,21,44,21,46,20],
])
const windPlant=Object.freeze([
  [32,70,30,55,42,38,58,24],
  [58,24,64,18,70,17,75,19],
  [39,51,29,44,20,43,12,44],
  [12,44,20,43,31,47,39,51],
  [40,51,51,43,59,35,70,36],
  [70,36,65,42,51,48,41,52],
  [31,64,21,58,17,57,9,58],
  [42,55,51,51,60,50,68,51],
  [56,28,63,26,68,25,72,26],
  [69,20,74,20,78,21,81,20],
])
const windCloud=Object.freeze([
  [58,40,72,37,80,30,93,30],
  [93,30,110,28,122,31,137,35],
  [74,47,93,44,115,45,134,47],
  [93,24,106,22,118,23,129,26],
])
const cloud=Object.freeze([
  [58,39,69,38,73,30,84,29],
  [84,29,96,26,104,30,114,30],
  [114,30,126,30,131,35,137,37],
  [72,46,91,44,105,44,124,46],
  [84,23,96,21,101,23,112,26],
])
const fair=Object.freeze([
  [69,18,82,16,90,18,101,20],
  [105,21,110,22,117,22,121,23],
])
const overcast=Object.freeze([
  [56,30,66,28,75,22,90,23],
  [90,23,106,22,117,26,132,30],
  [65,53,84,51,104,53,127,51],
])
const wind=Object.freeze([
  [8,28,24,24,38,23,51,27],
  [86,16,102,14,121,17,136,20],
])
const rain=Object.freeze([
  [79,53,78,56,76,60,74,64],
  [95,52,93,55,90,59,89,63],
  [111,54,110,56,108,59,107,62],
])
const snow=Object.freeze([
  [73,55,74,53,74,51,76,50],
  [86,61,87,59,88,57,88,55],
  [99,53,100,51,99,50,102,48],
  [114,62,115,60,116,57,118,56],
])
export function weatherCoastalCurves(wmo,windMs){
  const sky=weatherCoastalSkyFor(wmo,windMs)
  return [
    ...shore.slice(0,6),
    ...(sky==='wind'?windPlant:shore.slice(6)),
    ...(wmo!==0?(sky==='wind'?windCloud:cloud):[]),
    ...({fair,overcast,wind,rain,snow}[sky]??[]),
  ]
}
