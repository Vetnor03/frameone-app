export const ASSISTANT_TIPS = [
  'You can ask me to add groceries.',
  'Try: “Remind me to call Mum tomorrow.”',
  'I can help you find settings too.',
] as const

export const ASSISTANT_TIP_LIMIT = ASSISTANT_TIPS.length

export function nextAssistantTip(shown: number[]) {
  const shownSet = new Set(shown.filter((index) => Number.isInteger(index)))
  const index = ASSISTANT_TIPS.findIndex((_, candidate) => !shownSet.has(candidate))
  return index < 0 ? null : { index, text: ASSISTANT_TIPS[index] }
}

