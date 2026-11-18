export const DYNAMIC_PERIODS: readonly ['morning', 'afternoon', 'evening', 'night'];
export type DynamicPeriod = typeof DYNAMIC_PERIODS[number];
export type DynamicChoice = {layout: 'default'|'pyramid'|'square'|'full'|'custom'; cells: Array<{slot:number;module:string;col?:number;row?:number;colSpan?:number;rowSpan?:number}>;custom_layout_id?:string};
export type DynamicConfig = {enabled:boolean;timezone:string;periods:Record<DynamicPeriod,DynamicChoice>};
export function safeDynamicTimezone(value:unknown):string;
export function dynamicPeriodAt(timestamp:number,timezone:unknown):DynamicPeriod;
export function normalizeDynamicLayout(raw:unknown,fallback?:unknown):DynamicConfig|null;
export function nextDynamicTransitionAt(config:DynamicConfig|null,nowMs?:number):number;
export function resolveDynamicFrameSettings(raw:unknown,nowMs?:number):{settings:Record<string,unknown>;nextTransitionAt:number};
