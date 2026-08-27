import type { ResponsiveCellProfile } from './responsiveCellProfile.mjs'
export type CountdownUpcoming={title:string;count:string;unit:string}
export type CountdownState={title:string|null;count:string|null;unit:string|null;targetDate:string|null;upcoming?:readonly CountdownUpcoming[]}
export type CountdownFamily='unavailable'|'horizontal'|'stack'|'split-horizontal'|'expanded-vertical'
export type CountdownComposition={available:boolean;family:CountdownFamily;showTitle:boolean;showCount:boolean;showUnit:boolean;showTargetDate:boolean;upcomingRows:number;overflow:number;showCalendar:boolean;splitPercent:number}
export type CountdownRect={x:number;y:number;width:number;height:number}
export type CountdownUpcomingRowLayout={rowRect:CountdownRect;titleRect:CountdownRect;metricRect:CountdownRect}
export type CountdownLayout={pad:number;emptyRect:CountdownRect|null;primaryRect:CountdownRect|null;heroGroupRect:CountdownRect|null;titleRect:CountdownRect|null;countRect:CountdownRect|null;unitRect:CountdownRect|null;targetDateRect:CountdownRect|null;upcomingRect:CountdownRect|null;upcomingGroupRect:CountdownRect|null;upcomingRows:readonly CountdownUpcomingRowLayout[];calendarRect:CountdownRect|null;overflowRect:CountdownRect|null}
export const COUNTDOWN_STUDIO_PRESET_VALUES:readonly ['normal','long','extreme','empty']
export const countdownStudioPresets:Readonly<Record<typeof COUNTDOWN_STUDIO_PRESET_VALUES[number],CountdownState>>
export function countdownComposition(profile:ResponsiveCellProfile,state:CountdownState):CountdownComposition
export function countdownLayout(profile:ResponsiveCellProfile,composition:CountdownComposition):CountdownLayout
export function estimateCountdownTextWidth(value:string,font?:'B9'|'B12'|'B18'):number
export function fitCountdownStructuredText(value:string,width:number,height:number,measure:(value:string,fontSize:number)=>number,options?:{maxFont?:number;minFont?:number}):Readonly<{text:string;fontSize:number}>|null
