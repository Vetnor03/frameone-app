import type {ResponsiveCellProfile} from './responsiveCellProfile.mjs'
export type StockRange='day'|'week'|'month'|'year'
export type StockRect={x:number;y:number;width:number;height:number}
export type StocksState={symbol:string|null;name:string|null;currency:string|null;price:number|null;change:number|null;changePercent:number|null;previousClose:number|null;open:number|null;high:number|null;low:number|null;selectedRange:StockRange;selectedRangePercent:number|null;baselinePrice?:number|null;baselineSource?:string|null;series:readonly number[];purchasePrice?:number|null;personalChangePercent?:number|null}
export const STOCK_RANGES:readonly StockRange[]
export const STOCK_RANGE_LABELS:Record<StockRange,string>
export const STOCK_CHART_MIN_WIDTH:number
export const STOCK_CHART_MIN_HEIGHT:number
export const stocksStudioPresets:Record<'normal'|'long'|'extreme'|'empty',StocksState>
export function formatStockPrice(value:number|null|undefined):string|null
export function formatStockSigned(value:number|null|undefined,options?:{percent?:boolean;decimals?:number}):string|null
export function fitStockFact(value:string|number|null|undefined,width:number,height:number,measure:(value:string,fontSize:number)=>number,options?:{maxFont?:number;minFont?:number}):{text:string;fontSize:number}|null
export function stocksComposition(profile:ResponsiveCellProfile,state:StocksState):{family:'empty'|'micro'|'summary-strip'|'summary-stack'|'chart-summary'|'detail-chart'|'expanded';available:boolean;showChart:boolean;showSelector:boolean;showDetails:boolean;detailKeys:string[]}
export function stocksLayout(profile:ResponsiveCellProfile,composition:ReturnType<typeof stocksComposition>):{emptyRect:StockRect|null;titleRect:StockRect|null;summaryGroupRect:StockRect|null;priceRect:StockRect|null;dayChangeRect:StockRect|null;rangeChangeRect:StockRect|null;detailsRect:StockRect|null;detailRowRects:StockRect[];rangeSelectorRect:StockRect|null;chartRect:StockRect|null}
export function stockReferenceLine(state:StocksState):number|null
