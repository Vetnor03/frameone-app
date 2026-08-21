import type {ResponsiveCellProfile} from './responsiveCellProfile.mjs'
export type GroceryItem={name:string;quantity:number}
export type DinnerPlanItem={date:string;dayLabel:string;title:string}
export type RunningLowItem={name:string;label?:string|null}
export type MealIdea={name:string;missing:readonly string[]}
export type GroceriesState={status:'ok'|'failed';header:string;emptyPhrase:string;todayDate:string;items:readonly GroceryItem[];dinners:readonly DinnerPlanItem[];runningLow:readonly RunningLowItem[];mealIdeas:readonly MealIdea[];rotationOffset?:number}
export type GroceryRect={x:number;y:number;width:number;height:number}
export const GROCERIES_MENU_MIN_WIDTH:number
export const GROCERIES_MENU_MIN_HEIGHT:number
export const groceriesStudioPresets:Record<'normal'|'long'|'extreme'|'empty',GroceriesState>
export function formatGroceryItem(item:GroceryItem):string
export function groceriesTodayDinner(state:GroceriesState):DinnerPlanItem|null
export function groceriesFutureDinners(state:GroceriesState):DinnerPlanItem[]
export function selectGroceryItems(state:GroceriesState,count:number):GroceryItem[]
export function fitGroceryText(item:GroceryItem,width:number,measure:(text:string,fontSize:number)=>number,options?:{fontSize?:number;ellipsis?:string}):{quantity:string;name:string;text:string;truncated:boolean}|null
export function groceriesComposition(profile:ResponsiveCellProfile,state:GroceriesState):{family:'empty'|'micro'|'item-strip'|'list-stack'|'list-columns'|'list-menu'|'expanded';failed:boolean;todayDinner:DinnerPlanItem|null;futureDinners:DinnerPlanItem[];showMenu:boolean;showRunningLow:boolean;showMealIdeas:boolean;columns:number;horizontal:boolean}
export function groceriesLayout(profile:ResponsiveCellProfile,composition:ReturnType<typeof groceriesComposition>,state:GroceriesState):{emptyRect:GroceryRect|null;headerRect:GroceryRect|null;todayLabelRect:GroceryRect|null;titleRect:GroceryRect|null;groceryRect:GroceryRect|null;groceryRows:Array<{item:GroceryItem;itemRect:GroceryRect;quantityRect:GroceryRect|null;nameRect:GroceryRect|null}>;overflowRect:GroceryRect|null;menuRect:GroceryRect|null;menuHeaderRect:GroceryRect|null;menuRows:Array<{dinner:DinnerPlanItem;rect:GroceryRect}>;runningLowRect:GroceryRect|null;runningLowRows:Array<{item:RunningLowItem;rect:GroceryRect}>;mealIdeasRect:GroceryRect|null;mealIdeaGroups:Array<{idea:MealIdea;rect:GroceryRect}>;dividers:Array<{x1:number;y1:number;x2:number;y2:number}>}
