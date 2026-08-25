export const ASSISTANT_TIPS = [
  { en: 'You can ask me to add groceries.', no: 'Du kan be meg legge til dagligvarer.' },
  { en: 'Try: “Remind me to call Mum tomorrow.”', no: 'Prøv: «Minn meg på å ringe mamma i morgen.»' },
  { en: 'I can help you find settings too.', no: 'Jeg kan også hjelpe deg å finne innstillinger.' },
] as const

export const ASSISTANT_TIP_LIMIT = ASSISTANT_TIPS.length

export function nextAssistantTip(shown: number[], language: 'en' | 'no' = 'en') {
  const shownSet = new Set(shown.filter((index) => Number.isInteger(index)))
  const index = ASSISTANT_TIPS.findIndex((_, candidate) => !shownSet.has(candidate))
  return index < 0 ? null : { index, text: ASSISTANT_TIPS[index][language] }
}
