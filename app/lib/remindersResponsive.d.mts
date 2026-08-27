export type ReminderTextVariant='full'|'compact'|'short'|'tiny'|'fallback'
export type ReminderProtectedFact={value:string;kind:'id'|'name'|'location'|'date-context';optionalInTitle:boolean}
export type ReminderItem={time:string|null;text:Record<'full'|'compact'|'short'|'tiny',string>;protectedFacts:readonly ReminderProtectedFact[]}
export type ReminderState={today:readonly ReminderItem[];tomorrow:readonly ReminderItem[]}
export type ReminderRect={x:number;y:number;width:number;height:number}
export type ReminderComposition={available:boolean;direction:'horizontal'|'vertical'|'split';family:'shallow-horizontal'|'vertical-list'|'split-sections';showHeading:boolean;showTime:boolean;showTomorrow:boolean;todayItems:number;tomorrowItems:number;todayOverflow:number;tomorrowOverflow:number;maxItems:number;overflow:number}
export type ReminderDensity={name:'spacious'|'normal'|'dense';font:'B18'|'B12'|'B9';fontSize:number;rowHeight:number;rowGap:number;timeWidth:number}
export type ReminderItemLayout={itemRect:ReminderRect;timeRect:ReminderRect;titleRect:ReminderRect;stacked:boolean;density:ReminderDensity}
export type ReminderLayout={pad:number;emptyRect:ReminderRect|null;todayRect:ReminderRect|null;tomorrowRect:ReminderRect|null;footerRect:ReminderRect|null;todayFooterRect:ReminderRect|null;tomorrowFooterRect:ReminderRect|null;items:readonly ReminderItemLayout[]}
export const REMINDER_TEXT_ORDER:readonly string[]
export const REMINDER_STUDIO_PRESET_VALUES:readonly ['normal','long','extreme','empty']
export const reminderStudioPresets:Readonly<Record<'empty'|'normal'|'long'|'extreme',ReminderState>>
export function chooseReminderTextVariant(item:ReminderItem,availableWidth:number,measure:(text:string)=>number):{variant:ReminderTextVariant;text:string}
export function reminderDensity(availablePixels:number,requiredRows:number):ReminderDensity
export function reminderComposition(profile:import('./responsiveCellProfile.mjs').ResponsiveCellProfile,state:ReminderState):ReminderComposition
export function reminderLayout(profile:import('./responsiveCellProfile.mjs').ResponsiveCellProfile,composition:ReminderComposition):ReminderLayout
