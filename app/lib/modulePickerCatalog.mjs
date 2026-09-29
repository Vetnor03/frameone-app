// Presentation-only catalog for the frame's module picker.
// This does not change saved layouts, active modules or module capabilities.
export const recommendedModuleKeys = Object.freeze(['reminders', 'news', 'date', 'weather'])

const additionalCategories = [
  {
    key: 'everyday',
    labels: { en: 'Everyday', no: 'Hverdag' },
    modules: ['countdown', 'groceries', 'assistant'],
  },
  {
    key: 'finance',
    labels: { en: 'Finance', no: 'Økonomi' },
    modules: ['stocks'],
  },
  {
    key: 'sports',
    labels: { en: 'Sports', no: 'Sport' },
    modules: ['ski', 'soccer', 'surf'],
  },
]

/**
 * Alphabetical by the translated category title, then by the module's
 * translated, user-visible label. Hide AI Follow while its release flag is off.
 */
export function additionalModuleGroups(language, moduleLabel, showAiFollow = false) {
  const locale = language === 'no' ? 'nb' : 'en'
  return additionalCategories
    .map((category) => ({
      key: category.key,
      label: category.labels[language === 'no' ? 'no' : 'en'],
      modules: category.modules
        .filter((module) => showAiFollow || module !== 'assistant')
        .sort((a, b) => moduleLabel(a).localeCompare(moduleLabel(b), locale)),
    }))
    .filter((category) => category.modules.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label, locale))
}
