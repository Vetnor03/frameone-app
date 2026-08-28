export function deriveDynamicModuleKeys<T extends string>(
  activeLayoutModules: Record<number, T | null> | undefined,
  pinnedModuleTabs: T[],
): T[]
