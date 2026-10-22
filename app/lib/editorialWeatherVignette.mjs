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
const coast=Object.freeze([
  [5,70,15,68],[15,68,24,64],[24,64,32,61],[32,61,40,63],
  [40,63,48,68],[48,68,57,70],[57,70,75,71],[75,71,93,71],
  [93,71,115,70],[115,70,135,71],[28,61,28,50],[28,56,22,51],
  [28,54,34,47],[24,58,19,57],[31,57,36,54],
  [9,81,29,81],[37,84,61,84],[70,80,101,80],
  [107,85,131,85],[63,89,85,89],
])
const sun=Object.freeze([
  [22,27,24,21],[24,21,29,17],[29,17,35,16],
  [35,16,42,19],[42,19,45,25],[45,25,44,31],
  [44,31,40,36],[40,36,34,37],[34,37,27,34],
  [27,34,22,27],[34,10,34,7],[17,26,13,26],
  [46,13,49,10],
])
const cloud=Object.freeze([
  [54,45,60,43],[60,43,65,42],[65,42,67,36],
  [67,36,71,32],[71,32,77,30],[77,30,83,31],
  [83,31,88,35],[88,35,92,34],[92,34,97,35],
  [97,35,103,38],[103,38,106,43],[106,43,118,45],
  [58,48,76,48],[80,48,102,48],[107,48,118,48],
  [74,27,79,25],[79,25,86,26],
])
const skyExtras=Object.freeze({
  fair:[],
  overcast:[[60,26,75,22],[75,22,93,24],[97,27,117,30]],
  wind:[[10,22,25,20],[30,19,48,20],[95,15,109,13],
        [114,14,130,17],[112,57,126,55]],
  rain:[[72,54,68,62],[86,53,82,61],[100,54,96,62]],
  snow:[[70,56,76,62],[76,56,70,62],[87,52,93,58],
        [93,52,87,58],[105,57,111,63],[111,57,105,63]],
})
export function weatherCoastalLines(wmo,windMs){
  const sky=weatherCoastalSkyFor(wmo,windMs)
  return [
    ...coast,
    ...(sky==='fair'?sun:[]),
    ...(wmo!==0||sky!=='fair'?cloud:[]),
    ...skyExtras[sky],
  ]
}
