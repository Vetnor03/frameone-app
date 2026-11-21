export function enqueueSerializedSettingsSave<T>(
  tailRef: { current: Promise<unknown> },
  save: () => Promise<T>
): Promise<T>
