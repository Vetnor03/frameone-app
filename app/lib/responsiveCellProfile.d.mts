export type ResponsiveCellProfile = {
  colSpan:number; rowSpan:number; width:number; height:number; area:number; aspectRatio:number
  orientation:'square'|'landscape'|'portrait'; density:'micro'|'compact'|'normal'|'expanded'
}
export const STUDIO_MODULES: readonly string[]
export function responsiveCellProfile(colSpan:number,rowSpan:number,width:number,height:number):ResponsiveCellProfile
export function legacyStudioVariant(colSpan:number,rowSpan:number):'SMALL'|'MEDIUM'|'LARGE'|'XL'|null
export function studioRenderStrategy(module:string,colSpan:number,rowSpan:number,width:number,height:number):{path:'legacy'|'responsive'|'reminders-responsive'|'weather-responsive'|'countdown-responsive'|'date-responsive'|'surf-responsive'|'soccer-responsive'|'stocks-responsive'|'groceries-responsive'|'ai-follow-responsive';legacyVariant:'SMALL'|'MEDIUM'|'LARGE'|'XL'|null;profile:ResponsiveCellProfile}
