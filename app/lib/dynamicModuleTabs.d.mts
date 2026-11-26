export function deriveDynamicModuleKeys<T extends string>(
  activeLayoutModules: Record<number, T | null> | undefined,
  pinnedModuleTabs: T[],
): T[]

export function readPinnedModuleTabs(storage: Pick<Storage, 'getItem'> | null, userId: string | null, deviceId: string | null): string[] | null
export function writePinnedModuleTabs(storage: Pick<Storage, 'setItem'> | null, userId: string | null, deviceId: string | null, pins: string[]): boolean
export function togglePinnedModuleTab<T extends string>(pins: T[], moduleKey: T): T[]
