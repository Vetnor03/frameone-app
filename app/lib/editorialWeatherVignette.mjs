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
  [32,70,34,56,45,39,65,26],
  [53,38,59,30,65,25,72,26],
  [52,39,60,41,70,39,77,37],
  [41,55,30,50,19,48,12,49],
  [41,55,31,54,20,53,14,51],
  [48,46,48,37,54,34,64,33],
  [35,65,46,59,53,56,61,57],
])
const windCloud=Object.freeze([
  [72,39,89,33,111,32,134,37],
  [91,47,106,45,119,46,133,47],
])
const partlyCloud=Object.freeze([
  [87,41,99,36,112,37,126,41],
  [101,33,109,31,119,33,126,36],
])
const overcastCloud=Object.freeze([
  [53,39,70,32,86,28,102,30],
  [102,30,118,29,130,33,138,36],
  [62,47,84,44,106,45,130,47],
  [70,25,88,21,108,23,125,28],
  [88,53,104,51,121,52,135,51],
])
const snowCloud=Object.freeze([
  [63,40,77,34,92,32,111,34],
  [111,34,124,35,132,38,136,40],
  [74,47,92,45,111,46,130,48],
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
const wind=Object.freeze([
  [88,17,104,14,121,17,137,20],
])
const rain=Object.freeze([
  [79,53,78,56,76,60,74,64],
  [95,52,93,55,90,59,89,63],
  [111,54,110,56,108,59,107,62],
])
const snow=Object.freeze([
  [75,55,76,52,79,52,80,55],
  [80,55,79,58,77,59,75,55],
  [94,63,95,60,98,60,99,63],
  [99,63,98,66,96,67,94,63],
  [112,54,113,51,116,51,117,54],
  [117,54,116,57,114,58,112,54],
])
export function weatherCoastalCurves(wmo,windMs){
  const sky=weatherCoastalSkyFor(wmo,windMs)
  return [
    ...shore.slice(0,6),
    ...(sky==='wind'?windPlant:shore.slice(6)),
    ...(wmo!==0 ? (sky==='fair'?partlyCloud :
       sky==='overcast'?overcastCloud :
       sky==='wind'?windCloud :
       sky==='snow'?snowCloud : cloud) : []),
    ...({fair,wind,rain,snow}[sky]??[]),
  ]
}
