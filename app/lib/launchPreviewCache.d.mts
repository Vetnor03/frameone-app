export type LaunchModule = 'assistant'|'date'|'weather'|'surf'|'ski'|'reminders'|'news'|'countdown'|'soccer'|'stocks'|'groceries'
export type LaunchLayout = 'default'|'pyramid'|'square'|'full'|'custom'
export type LaunchPreviewCell = { slot: number; module: LaunchModule|null; col?:number; row?:number; colSpan?:number; rowSpan?:number }
export type CachedCustomLayout = { id:string; deviceId:string; ownerUserId:string; name:string; cells:{slot:number;col:number;row:number;colSpan:number;rowSpan:number}[]; sortOrder:number; createdAt:string; updatedAt:string }
export type LaunchPreview = { theme:'dark'|'light';powerSaver:boolean;language:'en'|'no';fontSize:'normal'|'large';layout:LaunchLayout;custom_layout_id:string|null;cells:LaunchPreviewCell[];pinned_tabs:LaunchModule[];customLayout:CachedCustomLayout|null }
export const LAUNCH_PREVIEW_PREFIX:string
export const LAUNCH_PREVIEW_TTL_MS:number
export function launchPreviewKey(userId:string): string|null
export function readLaunchPreview(storage:Pick<Storage,'getItem'>|null,userId:string,now?:number):{deviceId:string;preview:LaunchPreview}|null
export function writeLaunchPreview(storage:Pick<Storage,'setItem'>|null,userId:string,deviceId:string,settings:unknown,customLayout?:unknown,now?:number):boolean
export function clearLaunchPreview(storage:Pick<Storage,'removeItem'>|null,userId:string):void
