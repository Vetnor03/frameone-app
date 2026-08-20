import type { ResponsiveCellProfile } from './responsiveCellProfile.mjs'
export type SurfRect={x:number;y:number;width:number;height:number}
export type SurfForecast={day:string;ratingScore:number;ratingLabel:string;waveHeight:string;period?:string|null}
export type SurfState={spot:string|null;rating:{score:number|null;max:number;label:string|null};waveHeight:string|null;period:string|null;swellDirection:string|null;windDirection:string|null;windSpeed:string|null;bestWindow?:{label:string;time?:string|null}|null;airTemperature?:string|null;waterTemperature?:string|null;sunrise?:string|null;sunset?:string|null;forecast?:readonly SurfForecast[]}
export const SURF_FORECAST_MIN_COLUMN_WIDTH:number
export function surfRatingWord(score:unknown):string|null
export const surfStudioPresets:Record<'normal'|'long'|'extreme'|'empty',SurfState>
export function fitSurfFact(value:string|number|null|undefined,width:number,height:number,measure:(value:string,fontSize:number)=>number,options?:{maxFont?:number;minFont?:number}):{text:string;fontSize:number}|null
export function surfComposition(profile:ResponsiveCellProfile,state:SurfState):{family:'empty'|'micro'|'shallow'|'hero'|'detail-split'|'forecast'|'expanded';available:boolean;showSpot:boolean;showRating:boolean;showRatingLabel:boolean;showBlocks:boolean;showWave:boolean;showPeriod:boolean;showWind:boolean;showDirections:boolean;showBestWindow:boolean;showEnvironment:boolean;forecastDays:number}
export type SurfForecastLayout={columnRect:SurfRect;dayRect:SurfRect;ratingRect:SurfRect;blocksRect:SurfRect;waveRect:SurfRect;periodRect:SurfRect|null}
export function surfLayout(profile:ResponsiveCellProfile,composition:ReturnType<typeof surfComposition>):{emptyRect:SurfRect|null;headerRect:SurfRect|null;heroRect:SurfRect|null;ratingRect:SurfRect|null;ratingBlocksRect:SurfRect|null;waveRect:SurfRect|null;detailsRect:SurfRect|null;bestWindowRect:SurfRect|null;environmentRect:SurfRect|null;forecastRect:SurfRect|null;forecastColumns:SurfForecastLayout[]}
