/**
 * Orders module tabs for the assignments belonging to the layout on screen.
 * The caller is responsible for selecting the authoritative assignment map.
 */
export function deriveDynamicModuleKeys(activeLayoutModules, pinnedModuleTabs) {
  const activeModules = Array.from(
    new Set(Object.values(activeLayoutModules ?? {}).filter((module) => module && module !== 'date')),
  )

  const pinnedInactive = pinnedModuleTabs.filter(
    (module) => module !== 'date' && !activeModules.includes(module),
  )
  const pinnedActive = pinnedModuleTabs.filter(
    (module) => module !== 'date' && activeModules.includes(module),
  )
  const activeUnpinned = activeModules.filter((module) => !pinnedActive.includes(module))

  return [...pinnedActive, ...activeUnpinned, ...pinnedInactive]
}
