// Dynamic Layout is an optional overlay on the legacy single-layout config.
// Only the active period reaches physical firmware; the editor retains all four.
export const DYNAMIC_PERIODS = ['morning', 'afternoon', 'evening', 'night'];
const VALID_LAYOUTS = new Set(['default', 'pyramid', 'square', 'full', 'custom']);
const START_MINUTES = { morning: 360, afternoon: 720, evening: 1020, night: 1320 };
const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export function safeDynamicTimezone(value) {
  if (typeof value === 'string' && value.length <= 64) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(); return value; } catch {}
  }
  return 'UTC';
}

export function dynamicPeriodAt(timestamp, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: safeDynamicTimezone(timezone), hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find(part => part.type === 'minute')?.value ?? 0);
  const localMinute = hour * 60 + minute;
  if (localMinute < START_MINUTES.morning || localMinute >= START_MINUTES.night) return 'night';
  if (localMinute < START_MINUTES.afternoon) return 'morning';
  if (localMinute < START_MINUTES.evening) return 'afternoon';
  return 'evening';
}

export function normalizeDynamicLayout(raw, fallback) {
  if (!isObject(raw)) return null;
  const base = isObject(fallback) ? fallback : { layout: 'default', cells: [] };
  const normalizeChoice = value => {
    const source = isObject(value) ? value : base;
    const layout = VALID_LAYOUTS.has(source.layout) ? source.layout : 'default';
    const cells = Array.isArray(source.cells) ? source.cells
      .filter(cell => isObject(cell) && Number.isInteger(cell.slot) && cell.slot >= 0 && cell.slot < 16 && typeof cell.module === 'string')
      .slice(0, 16).map(cell => ({ ...cell })) : [];
    return {
      layout,
      cells,
      ...(layout === 'custom' && typeof source.custom_layout_id === 'string'
        ? { custom_layout_id: source.custom_layout_id } : {}),
    };
  };
  const periods = {};
  for (const period of DYNAMIC_PERIODS) periods[period] = normalizeChoice(raw.periods?.[period]);
  return {
    enabled: raw.enabled === true,
    timezone: safeDynamicTimezone(raw.timezone),
    periods,
  };
}

function choiceSignature(choice) {
  if (!choice) return '';
  return JSON.stringify([choice.layout, choice.cells]);
}

// A layout switch is optional when the adjacent periods display identical content.
// Scanning the next 27h also covers the Oslo DST spring/fall clock change.
export function nextDynamicTransitionAt(config, nowMs = Date.now()) {
  if (!config?.enabled) return 0;
  const active = dynamicPeriodAt(nowMs, config.timezone);
  const displayed = choiceSignature(config.periods?.[active]);
  let previousOffset = 0;
  for (let offset = 10; offset <= 27 * 60; offset += 10) {
    const future = dynamicPeriodAt(nowMs + offset * 60_000, config.timezone);
    if (choiceSignature(config.periods?.[future]) === displayed) {
      previousOffset = offset;
      continue;
    }
    // The period boundary falls between these points, even across a DST jump.
    let low = previousOffset, high = offset;
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      const candidate = dynamicPeriodAt(nowMs + mid * 60_000, config.timezone);
      if (choiceSignature(config.periods?.[candidate]) === displayed) low = mid;
      else high = mid;
    }
    return Math.floor((nowMs + high * 60_000) / 60_000) * 60;
  }
  return 0;
}

export function resolveDynamicFrameSettings(raw, nowMs = Date.now()) {
  const original = isObject(raw) ? raw : {};
  const { dynamic_layout: dynamicRaw, ...legacySettings } = original;
  const config = normalizeDynamicLayout(dynamicRaw, legacySettings);
  if (!config?.enabled) return { settings: legacySettings, nextTransitionAt: 0 };
  const active = config.periods[dynamicPeriodAt(nowMs, config.timezone)];
  const nextTransitionAt = nextDynamicTransitionAt(config, nowMs);
  const settings = {
    ...legacySettings,
    layout: active.layout,
    cells: active.cells,
    ...(active.layout === 'custom' ? { custom_layout_id: active.custom_layout_id } : { custom_layout_id: undefined }),
    dynamic_transition_at: nextTransitionAt,
  };
  return { settings, nextTransitionAt };
}
