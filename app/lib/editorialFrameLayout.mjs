// Experimental mirror of frame/src/display/EditorialDesign.h.
// Keep geometry thresholds and role behavior in lockstep with firmware.
// No DOM, font rendering or data loading belongs in this policy.
export const EditorialRole = Object.freeze({
  HERO: 'hero',
  HEADING: 'heading',
  PRIMARY: 'primary',
  SECONDARY: 'secondary',
  LIST_ITEM: 'listItem',
  MEASUREMENT: 'measurement',
  FIGURE: 'figure',
  DIVIDER: 'divider',
})

export function editorialPlan(width, height) {
  width = Math.max(0, Math.trunc(Number(width) || 0))
  height = Math.max(0, Math.trunc(Number(height) || 0))
  let shape = 'card'
  if (height < 152 && width >= 300) shape = 'ribbon'
  else if (width < 260 && height >= 152) shape = 'column'
  else if (width < 260 || height < 152) shape = 'compact'
  else if (width >= 530 && height >= 215) shape = 'spread'
  const inset = width < 260 || height < 155 ? 8
    : width >= 530 && height >= 215 ? 16 : 12
  const gap = width >= 530 && height >= 215 ? 12
    : width < 260 || height < 155 ? 6 : 8
  const safeWidth = Math.max(0, width - 2 * inset)
  const safeHeight = Math.max(0, height - 2 * inset)
  const columns = (shape === 'ribbon' && safeWidth >= 440)
    || (shape === 'spread' && safeWidth >= 420) ? 2 : 1
  return {
    shape, width, height, inset, gap, safeWidth, safeHeight, columns,
    illustrationsAllowed: shape === 'spread' && safeHeight >= 240 && safeWidth >= 560,
    ornamentalDividerAllowed: safeWidth >= 610 && safeHeight >= 200,
  }
}

export function editorialRole(plan, role) {
  const spacious = plan.shape === 'spread'
  const tight = plan.shape === 'compact' || plan.shape === 'ribbon'
  switch (role) {
    case EditorialRole.HERO:
      return { font: spacious ? 'bold18' : 'bold12', maxLines: 2, visible: plan.safeHeight >= 24, wrap: false }
    case EditorialRole.HEADING:
      return { font: spacious || plan.shape === 'card' || (plan.shape === 'ribbon' && plan.safeWidth >= 440) ? 'bold12' : 'regular9',
        maxLines: 1, visible: plan.safeHeight >= 38, wrap: false }
    case EditorialRole.PRIMARY:
      return { font: spacious ? 'regular12' : 'regular9', maxLines: tight ? 2 : 3,
        visible: plan.safeHeight >= 16, wrap: true }
    case EditorialRole.SECONDARY:
      return { font: 'regular9', maxLines: tight ? 1 : 2, visible: plan.safeHeight >= 90, wrap: true }
    case EditorialRole.LIST_ITEM:
      return { font: spacious ? 'regular12' : 'regular9', maxLines: tight ? 1 : 2,
        visible: plan.safeHeight >= 36, wrap: true }
    case EditorialRole.MEASUREMENT:
      return { font: spacious ? 'bold18' : 'bold12', maxLines: 1,
        visible: plan.safeHeight >= 26, wrap: false }
    case EditorialRole.FIGURE:
      return { font: 'regular9', maxLines: 0, visible: plan.illustrationsAllowed, wrap: false }
    case EditorialRole.DIVIDER:
      return { font: 'regular9', maxLines: 0, visible: plan.safeWidth >= 140, wrap: false }
    default:
      return { font: 'regular9', maxLines: 1, visible: false, wrap: false }
  }
}

export function showEditorialRole(plan, role, priority = 'important') {
  if (priority === 'essential') return editorialRole(plan, role).visible
  if (priority === 'decorative') return role === EditorialRole.FIGURE
    ? plan.illustrationsAllowed : role === EditorialRole.DIVIDER && plan.ornamentalDividerAllowed
  if (priority === 'important') return editorialRole(plan, role).visible
    && (role !== EditorialRole.SECONDARY || plan.safeHeight >= 90)
  return editorialRole(plan, role).visible && plan.safeHeight >= 165 && plan.safeWidth >= 220
}

export function editorialListCapacity(plan, contentHeight, minimumRow = 28) {
  if (contentHeight < minimumRow || minimumRow <= 0 || plan.safeWidth < 60) return 0
  return Math.max(0, Math.min(8, Math.trunc(contentHeight / (minimumRow + plan.gap))))
}

export function editorialModuleKind(module) {
  if (typeof module !== 'string') return 'unknown'
  const [kind] = module.toLowerCase().split(':', 1)
  return {
    date: 'dateFacts',
    reminders: 'reminderList',
    weather: 'weatherFacts',
    news: 'newsList',
    surf: 'surfFacts',
    ski: 'skiFacts',
    countdown: 'countdownFacts',
    soccer: 'soccerList',
    stocks: 'stocksFacts',
    groceries: 'groceryList',
    assistant: 'assistantText',
  }[kind] || 'unknown'
}

// Disclosure matches EditorialDesign::budgetFor in the physical firmware.
// Keep these two implementations in lockstep and exercise geometry parity tests.
export function editorialContentBudget(plan, kind) {
  const ribbon = plan.shape === 'ribbon'
  const compact = plan.shape === 'compact'
  const list = ['reminderList', 'newsList', 'soccerList', 'groceryList'].includes(kind)
  const measurement = ['weatherFacts', 'surfFacts', 'skiFacts', 'stocksFacts'].includes(kind)
  const headerFloor = list ? 95 : 110
  const heading = kind !== 'dateFacts' && !compact &&
    plan.safeHeight >= headerFloor && (!ribbon || plan.safeHeight >= 120)
  const secondary = plan.safeHeight >= (measurement ? 85 : 125) && plan.safeWidth >= 145
  const illustration = plan.illustrationsAllowed &&
    (kind === 'dateFacts' || kind === 'weatherFacts')
  const splitColumns = plan.columns === 2 && plan.safeWidth >= 420 &&
    (list || kind === 'dateFacts' || measurement)
  const listHeight = plan.safeHeight - (heading ? 34 : 0) - (secondary ? 18 : 0)
  const rowPixels = kind === 'reminderList' ? 88 : kind === 'newsList' ? 45
    : kind === 'groceryList' ? 35 : 38
  const listItems = list ? Math.min(8,
    Math.max(0, Math.trunc(listHeight / (rowPixels + plan.gap))) * (splitColumns ? 2 : 1)) : 0
  return { heading, secondary, illustration, splitColumns, listItems }
}
