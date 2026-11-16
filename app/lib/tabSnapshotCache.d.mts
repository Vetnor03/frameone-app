export type TabSnapshotKind = 'reminders' | 'groceries' | 'countdown' | 'news' | 'ski'
export const TAB_SNAPSHOT_PREFIX:string
export const TAB_SNAPSHOT_MAX_AGE_MS:number
export function tabSnapshotKey(userId:string|null,deviceId:string|null,tab:TabSnapshotKind,variant?:string):string|null
export function readTabSnapshot<T=unknown>(storage:Pick<Storage,'getItem'>|null,userId:string|null,deviceId:string|null,tab:TabSnapshotKind,variant?:string,now?:number):{data:T;savedAt:number}|null
export function writeTabSnapshot(storage:Pick<Storage,'setItem'>|null,userId:string|null,deviceId:string|null,tab:TabSnapshotKind,variant:string|undefined,data:unknown,now?:number):boolean
export function clearTabSnapshotsForUser(storage:Pick<Storage,'length'|'key'|'removeItem'>|null,userId:string|null):void
