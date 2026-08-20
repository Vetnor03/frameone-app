import type { ResponsiveCellProfile } from './responsiveCellProfile.mjs'
export type DateHoliday={dateLabel:string;title:string}
export type DateState={weekday:string|null;day:number|null;monthName:string|null;month0:number|null;year:number|null;nextMonthName?:string;nextMonth0?:number;nextMonthYear?:number;holidays?:readonly DateHoliday[]}
export type DateFamily='unavailable'|'micro'|'horizontal'|'stack'|'calendar-split'|'expanded'
export type DateCalendarFeatures={showMonthTitle:boolean;showWeekNums:boolean;showDowHeader:boolean}
export type DateComposition={available:boolean;family:DateFamily;showYear:boolean;showMonth:boolean;showWeekday:boolean;currentCalendar:DateCalendarFeatures|null;nextCalendar:DateCalendarFeatures|null;holidayRows:number}
export type DateRect={x:number;y:number;width:number;height:number}
export type DateLayout={pad:number;emptyRect:DateRect|null;heroRect:DateRect|null;heroGroupRect:DateRect|null;yearRect:DateRect|null;monthRect:DateRect|null;dayRect:DateRect|null;weekdayRect:DateRect|null;calendarRect:DateRect|null;nextCalendarRect:DateRect|null;holidayRect:DateRect|null}
export const DATE_STUDIO_PRESET_VALUES:readonly ['normal','long','extreme','empty']
export const dateStudioPresets:Readonly<Record<typeof DATE_STUDIO_PRESET_VALUES[number],DateState>>
export const DATE_CALENDAR_MIN:Readonly<{gridWidth:number;gridHeight:number;dowWidth:number;dowHeight:number;weekWidth:number;weekHeight:number;titleHeight:number}>
export function dateCalendarFeatures(width:number,height:number,options?:{title?:boolean}):DateCalendarFeatures|null
export function dateComposition(profile:ResponsiveCellProfile,state:DateState):DateComposition
export function dateLayout(profile:ResponsiveCellProfile,composition:DateComposition):DateLayout
export function fitDateFact(value:string|number,width:number,height:number,measure:(value:string,fontSize:number)=>number,options?:{maxFont?:number;minFont?:number}):Readonly<{text:string;fontSize:number}>|null
