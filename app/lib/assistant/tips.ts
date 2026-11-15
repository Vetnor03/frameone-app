export const ASSISTANT_TIPS = [
  { id: 'landscape-frame-preview', en: 'Turn your phone sideways to preview your frame.', no: 'Snu telefonen sidelengs for å se hva som vises på rammen.' },
  { id: 'add-groceries', en: 'You can ask me to add groceries.', no: 'Du kan be meg legge til dagligvarer.', command: { en: 'Add milk, eggs and bread', no: 'Legg til melk, egg og brød' } },
  { id: 'reminder-example', en: 'Try: “Remind me to call Mum tomorrow.”', no: 'Prøv: «Minn meg på å ringe mamma i morgen.»', command: { en: 'Remind me to call Mum tomorrow', no: 'Minn meg på å ringe mamma i morgen' } },
  { id: 'settings-help', en: 'I can help you find settings too.', no: 'Jeg kan også hjelpe deg å finne innstillinger.' },
  { id: 'power-save', en: 'Longer battery life, less responsive.', no: 'Lengre batteritid, mindre responsiv.' },
  // Append instead of reordering: saved assistant_tips_shown entries are numeric indexes.
  { id: 'customize-frame-cells', en: 'Tap any cell in your frame preview to choose its module. You can change this anytime.', no: 'Trykk på et felt i rammevisningen for å velge modul. Du kan endre det når som helst.' },
] as const

export const ASSISTANT_TIP_LIMIT = ASSISTANT_TIPS.length

const NEUTRAL_PLACEHOLDER = { en: 'What would you like me to do?', no: 'Hva vil du at jeg skal gjøre?' } as const

export function assistantPlaceholder(tipId: string | undefined, language: 'en' | 'no' = 'en') {
  const tip = ASSISTANT_TIPS.find((candidate) => candidate.id === tipId)
  return tip && 'command' in tip ? tip.command[language] : NEUTRAL_PLACEHOLDER[language]
}

export function nextAssistantTip(shown: number[], language: 'en' | 'no' = 'en') {
  const shownSet = new Set(shown.filter((index) => Number.isInteger(index)))
  // Introduce the essential frame customization gesture first, including for existing accounts.
  // Historical tip indexes are preserved so earlier tips are never accidentally reset.
  const customizationIndex = ASSISTANT_TIPS.findIndex((tip) => tip.id === 'customize-frame-cells')
  const index = customizationIndex >= 0 && !shownSet.has(customizationIndex)
    ? customizationIndex
    : ASSISTANT_TIPS.findIndex((_, candidate) => !shownSet.has(candidate))
  return index < 0 ? null : { index, id: ASSISTANT_TIPS[index].id, text: ASSISTANT_TIPS[index][language] }
}
