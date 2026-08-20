export type ReminderTextVariant='full'|'compact'|'short'|'tiny'|'fallback'
export type ReminderItem={time:string|null;text:Record<'full'|'compact'|'short'|'tiny',string>;protectedFacts:readonly string[]}
export type ReminderState={today:readonly ReminderItem[];tomorrow:readonly ReminderItem[]}
export const REMINDER_TEXT_ORDER:readonly string[]
export const reminderStudioPresets:Readonly<Record<'empty'|'normal'|'long'|'extreme',ReminderState>>
export function chooseReminderTextVariant(text:ReminderItem['text'],availableWidth:number,measure:(text:string)=>number):{variant:ReminderTextVariant;text:string}
export function reminderComposition(profile:import('./responsiveCellProfile.mjs').ResponsiveCellProfile,state:ReminderState):{direction:'horizontal'|'vertical';showHeading:boolean;showTime:boolean;showTomorrow:boolean;maxItems:number}
