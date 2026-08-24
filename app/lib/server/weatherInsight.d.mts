export type WeatherInsightHour = { time:string; temperatureC:number|null; feelsLikeC:number|null; precipitationProbability:number|null; precipitationMm:number|null; weatherCode:number|null; windMs:number|null; gustMs:number|null }
export type CompactWeatherInsightForecast = { localNow:string; period:string; sunrise?:string; sunset?:string; hours:WeatherInsightHour[] }
export type WeatherInsightOptions = { apiKey?:string; model?:string; locationKey?:string; now?:number; timeoutMs?:number; fetcher?:typeof fetch }
export function compactWeatherInsightForecast(payload:unknown):CompactWeatherInsightForecast|null
export function resolveWeatherInsight(payload:unknown,options?:WeatherInsightOptions):Promise<string>
export function clearWeatherInsightCache():void
