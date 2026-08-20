export type ReminderTextVariant='full'|'compact'|'short'|'tiny'|'fallback'
export type ReminderProtectedFact={value:string;kind:'id'|'name'|'location'|'date-context';optionalInTitle:boolean}
export type ReminderItem={time:string|null;text:Record<'full'|'compact'|'short'|'tiny',string>;protectedFacts:readonly ReminderProtectedFact[]}
export type ReminderState={today:readonly ReminderItem[];tomorrow:readonly ReminderItem[]}
export const REMINDER_TEXT_ORDER:readonly string[]
export const reminderStudioPresets:Readonly<Record<'empty'|'normal'|'long'|'extreme',ReminderState>>
export function chooseReminderTextVariant(item:ReminderItem,availableWidth:number,measure:(text:string)=>number):{variant:ReminderTextVariant;text:string}
export function reminderComposition(profile:import('./responsiveCellProfile.mjs').ResponsiveCellProfile,state:ReminderState):{direction:'horizontal'|'vertical';showHeading:boolean;showTime:boolean;showTomorrow:boolean;maxItems:number}
