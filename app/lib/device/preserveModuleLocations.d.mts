export declare function preserveStoredModuleLocations(
  storedSettings: unknown,
  requestedSettings: Record<string, unknown>,
): {
  settingsJson: Record<string, unknown>
  preserved: string[]
}
