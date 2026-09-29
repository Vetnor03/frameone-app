export type PickerModuleKey = 'assistant' | 'date' | 'weather' | 'surf' | 'ski' | 'reminders' | 'news' | 'countdown' | 'soccer' | 'stocks' | 'groceries'
export type PickerModuleCategory = 'everyday' | 'finance' | 'sports'
export const recommendedModuleKeys: ReadonlyArray<PickerModuleKey>
export function additionalModuleGroups(
  language: 'en' | 'no',
  moduleLabel: (module: PickerModuleKey) => string,
  showAiFollow?: boolean,
): Array<{ key: PickerModuleCategory; label: string; modules: PickerModuleKey[] }>
