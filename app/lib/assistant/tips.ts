export const ASSISTANT_TIPS = [
  { id: 'landscape-frame-preview', en: 'Turn your phone sideways to preview your frame.', no: 'Snu telefonen sidelengs for å se hva som vises på rammen.' },
  { id: 'add-groceries', en: 'You can ask me to add groceries.', no: 'Du kan be meg legge til dagligvarer.' },
  { id: 'reminder-example', en: 'Try: “Remind me to call Mum tomorrow.”', no: 'Prøv: «Minn meg på å ringe mamma i morgen.»' },
  { id: 'settings-help', en: 'I can help you find settings too.', no: 'Jeg kan også hjelpe deg å finne innstillinger.' },
] as const

export const ASSISTANT_TIP_LIMIT = ASSISTANT_TIPS.length

export function nextAssistantTip(shown: number[], language: 'en' | 'no' = 'en') {
  const shownSet = new Set(shown.filter((index) => Number.isInteger(index)))
  const index = ASSISTANT_TIPS.findIndex((_, candidate) => !shownSet.has(candidate))
  return index < 0 ? null : { index, text: ASSISTANT_TIPS[index][language] }
}
