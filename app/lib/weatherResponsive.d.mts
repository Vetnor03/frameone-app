import type { ResponsiveCellProfile } from './responsiveCellProfile.mjs'
export type WeatherForecast={day:string;temperature:string;condition?:string|null}
export type WeatherState={location?:string|null;condition?:string|null;temperature?:string|null;low?:string|null;high?:string|null;windSpeed?:string|null;windDirection?:string|null;precipitationProbability?:number|null;insight?:string|null;forecast?:readonly WeatherForecast[]}
export type WeatherComposition={available:boolean;layout:'unavailable'|'vertical'|'horizontal'|'balanced';showLocation:boolean;showCondition:boolean;showTemperature:boolean;showRange:boolean;showWind:boolean;showPrecipitation:boolean;showInsight:boolean;forecastRows:number}
export const WEATHER_STUDIO_PRESET_VALUES:readonly ['normal','long','extreme','empty']
export const weatherStudioPresets:Readonly<Record<typeof WEATHER_STUDIO_PRESET_VALUES[number],WeatherState>>
export function weatherComposition(profile:ResponsiveCellProfile,state:WeatherState):WeatherComposition
