export type WarmModuleKey = 'date'|'weather'|'surf'|'ski'|'reminders'|'news'|'countdown'|'soccer'|'stocks'|'groceries'
export function planModuleTabWarmup(tabKeys: readonly string[], alreadyMounted?: readonly string[], activeKey?: string): WarmModuleKey[]
export function tabCacheScope(userId: string | null, deviceId: string | null): string
export function appendCachedModuleTab(cache: {scope:string;keys:WarmModuleKey[]}, scope:string, tabKey:string): {scope:string;keys:WarmModuleKey[]}
