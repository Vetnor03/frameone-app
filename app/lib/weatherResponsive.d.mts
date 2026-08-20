import type { ResponsiveCellProfile } from './responsiveCellProfile.mjs'
export type WeatherForecast={day:string;temperature:string;condition?:string|null}
export type WeatherState={location?:string|null;condition?:string|null;temperature?:string|null;low?:string|null;high?:string|null;windSpeed?:string|null;windDirection?:string|null;precipitationProbability?:number|null;insight?:string|null;forecast?:readonly WeatherForecast[]}
export type WeatherComposition={available:boolean;layout:'unavailable'|'vertical'|'horizontal'|'balanced';showLocation:boolean;showCondition:boolean;showTemperature:boolean;showRange:boolean;showWind:boolean;showPrecipitation:boolean;showInsight:boolean;forecastRows:number}
export type WeatherRect={x:number;y:number;width:number;height:number}
export type WeatherLayout={pad:number;headerRect:WeatherRect|null;primaryRect:WeatherRect;detailsRect:WeatherRect|null;forecastRect:WeatherRect|null;dividerY:number|null}
export const WEATHER_STUDIO_PRESET_VALUES:readonly ['normal','long','extreme','empty']
export const weatherStudioPresets:Readonly<Record<typeof WEATHER_STUDIO_PRESET_VALUES[number],WeatherState>>
export function weatherComposition(profile:ResponsiveCellProfile,state:WeatherState):WeatherComposition
export function weatherLayout(profile:ResponsiveCellProfile,composition:WeatherComposition):WeatherLayout
