export const WEATHER_STUDIO_PRESET_VALUES = ['normal','long','extreme','empty']

export const weatherStudioPresets = Object.freeze({
  normal: weather({location:'Oslo',condition:'Partly cloudy',temperature:'18°',low:'12°',high:'21°',windSpeed:'4 m/s',windDirection:'W',precipitationProbability:20,insight:'Clearing this afternoon',forecast:[['Thu','16°','Rain'],['Fri','19°','Cloudy'],['Sat','21°','Clear']]}),
  long: weather({location:'Longyearbyen, Svalbard',condition:'Snow showers and strong wind',temperature:'-18°',low:'-24°',high:'-12°',windSpeed:'18 m/s',windDirection:'North-northwest',precipitationProbability:85,insight:'Snow showers easing late this evening',forecast:[['Thu','-20°','Snow'],['Fri','-17°','Windy'],['Sat','-15°','Cloudy']]}),
  extreme: weather({location:'Research Station, Northern Archipelago',condition:'Exceptionally prolonged freezing rain and gale-force winds',temperature:'-123°',low:'-140°',high:'123°',windSpeed:'125 m/s',windDirection:'East-northeast',precipitationProbability:100,insight:'Severe conditions continue through the forecast period',forecast:[['Thu','-99°','Freezing rain'],['Fri','-88°','Heavy snow'],['Sat','-72°','Gale'],['Sun','-60°','Blizzard']]}),
  empty: weather({location:null,condition:null,temperature:null,low:null,high:null,windSpeed:null,windDirection:null,precipitationProbability:null,insight:null,forecast:[]}),
})

function weather(value) {
  return Object.freeze({...value,forecast:Object.freeze(value.forecast.map(([day,temperature,condition])=>Object.freeze({day,temperature,condition})))})
}

/** Weather disclosure is semantic: useful fields are revealed; text is never rewritten. */
export function weatherComposition(profile,state) {
  const available=Boolean(state.condition||state.temperature)
  if(!available)return Object.freeze({available:false,layout:'unavailable',showLocation:false,showCondition:false,showTemperature:false,showRange:false,showWind:false,showPrecipitation:false,showInsight:false,forecastRows:0})
  const tall=profile.orientation==='portrait',wide=profile.orientation==='landscape'
  const showRange=profile.area>=3&&Boolean(state.low||state.high)
  const showWind=profile.area>=3&&Boolean(state.windSpeed||state.windDirection)
  const showPrecipitation=profile.area>=4&&state.precipitationProbability!=null
  const large=profile.area>=8&&profile.height>=300
  const forecastRows=large?Math.min(state.forecast?.length??0,profile.width>=500?4:3):0
  return Object.freeze({
    available:true,
    layout:tall?'vertical':wide?'horizontal':'balanced',
    showLocation:profile.area>=3&&Boolean(state.location),
    showCondition:Boolean(state.condition),showTemperature:Boolean(state.temperature),
    showRange,showWind,showPrecipitation,
    showInsight:large&&forecastRows===0&&Boolean(state.insight),
    forecastRows,
  })
}
