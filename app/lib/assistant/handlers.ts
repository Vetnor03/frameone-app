import type { SupabaseClient, User } from '@supabase/supabase-js'
import { normalizeBuiltInLayout, transitionBuiltInLayoutSettings } from '../frameLayoutTransition.ts'
import { addGroceryItemsCanonical } from '../groceries/actions.ts'
import { findSpotByLabel } from '../surf/spots.ts'
import { ALL_TEAMS, type SoccerTeamItem } from '../soccer/teams.ts'
import type { AssistantDestination, AssistantResult } from './types.ts'
import { ASSISTANT_CAPABILITIES, type CapabilityArgument } from './capabilities.ts'

export type CapabilityId =
  | 'football.set_team' | 'football.read' | 'groceries.add' | 'groceries.read'
  | 'reminders.read' | 'countdown.create' | 'settings.set_app_theme'
  | 'frame.set_language' | 'frame.set_layout' | 'surf.log_experience'
  | 'weather.read' | 'surf.read' | `${string}.open`

export type CapabilityArguments = Partial<Record<CapabilityArgument, unknown>>
export type CapabilityScope = 'user' | 'device_member'
export type CapabilityContext = {
  db: SupabaseClient
  admin: SupabaseClient
  user: User
  deviceId: string
  language: 'en' | 'no'
  localNow: string
  timezone: string | null
  authorization: string
  executeSurfLog?: (args: ValidSurfLog) => Promise<AssistantResult>
  weatherDetails?: (request: Request) => Promise<Response>
  surfScore?: (request: Request) => Promise<Response>
}

type Validation = { ok: true; arguments: Record<string, unknown> } | { ok: false; missing?: CapabilityArgument[]; message?: string }
type Handler = {
  scope: CapabilityScope
  destructive: boolean
  missingQuestion: Partial<Record<CapabilityArgument, Record<'en' | 'no', string>>>
  validate: (args: CapabilityArguments) => Validation
  run: (ctx: CapabilityContext, args: Record<string, unknown>) => Promise<AssistantResult>
}

const ok = (args: Record<string, unknown>): Validation => ({ ok: true, arguments: args })
const invalid = (message?: string): Validation => ({ ok: false, message })
const required = (argument: CapabilityArgument): Validation => ({ ok: false, missing: [argument] })
const completed = (message: string): AssistantResult => ({ status: 'completed', message })
const ymd = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/
const hhmm = /^(?:[01]\d|2[0-3]):[0-5]\d$/

function canonicalTeam(value: unknown): SoccerTeamItem | null {
  const requested = typeof value === 'string' ? value.trim().toLocaleLowerCase() : ''
  return ALL_TEAMS.find((team) => [team.teamId, team.teamName, team.teamName.split(/\s+/).at(-1)!].some((name) => name.toLocaleLowerCase() === requested)) ?? null
}

function validItems(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > 30) return null
  const items = value.map((item) => {
    if (!item || typeof item !== 'object') return null
    const row = item as Record<string, unknown>
    const name = typeof row.name === 'string' ? row.name.trim() : ''
    const quantity = row.quantity == null ? undefined : Number(row.quantity)
    return !name || name.length > 80 || (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1 || quantity > 99)) ? null : { name, ...(quantity ? { quantity } : {}) }
  })
  return items.every(Boolean) ? items as Array<{ name: string; quantity?: number }> : null
}

function navigation(destination: AssistantDestination): Handler {
  return { scope: 'user', destructive: false, missingQuestion: {}, validate: () => ok({}), run: async (_ctx) => ({ status: 'completed', message: `Open ${destination}.`, cta: { label: `Open ${destination}`, destination } }) }
}

function forecastReadValidator(withSpot: boolean): Handler['validate'] {
  return (args) => {
    const period = args.period == null || args.period === '' ? 'current' : String(args.period).toLocaleLowerCase()
    if (!['current', 'today', 'tomorrow'].includes(period)) return invalid('Unsupported forecast period.')
    if (withSpot && args.spot != null && (typeof args.spot !== 'string' || !findSpotByLabel(args.spot))) return invalid('Unknown surf spot.')
    return ok({ period, ...(withSpot && typeof args.spot === 'string' ? { spot: args.spot } : {}) })
  }
}

export type ValidSurfLog = { spot: string; rating: number; date: 'today' | 'yesterday'; time: string; comment: string }

export const ASSISTANT_CAPABILITY_HANDLERS: Record<string, Handler> = {
  'football.set_team': { scope: 'device_member', destructive: false, missingQuestion: { team: { en: 'Which football team?', no: 'Hvilket fotballag?' } }, validate: (args) => {
    if (!args.team) return required('team'); const team = canonicalTeam(args.team); return team ? ok({ team }) : invalid('Unknown football team.')
  }, run: async (ctx, args) => {
    const team = args.team as SoccerTeamItem
    const { data: row, error: readError } = await ctx.db.from('device_settings').select('settings_json').eq('device_id', ctx.deviceId).maybeSingle()
    if (readError) throw readError
    const settings = row?.settings_json && typeof row.settings_json === 'object' && !Array.isArray(row.settings_json) ? { ...row.settings_json as Record<string, unknown> } : {}
    const modules = settings.modules && typeof settings.modules === 'object' && !Array.isArray(settings.modules) ? { ...settings.modules as Record<string, unknown> } : {}
    const soccer = Array.isArray(modules.soccer) ? [...modules.soccer] : []
    const index = soccer.findIndex((value) => value && typeof value === 'object' && Number((value as Record<string, unknown>).id) === 1)
    const next = { ...(index >= 0 ? soccer[index] as object : {}), id: 1, ...team }
    if (index >= 0) soccer[index] = next; else soccer.push(next)
    settings.modules = { ...modules, soccer }
    const { data, error } = await ctx.db.rpc('upsert_device_settings', { p_device_id: ctx.deviceId, p_settings: settings })
    if (error || data !== true) throw error ?? new Error('settings_not_saved')
    return completed(ctx.language === 'no' ? `Fotballaget er byttet til ${team.teamName}.` : `Football team changed to ${team.teamName}.`)
  } },
  'football.read': { scope: 'device_member', destructive: false, missingQuestion: {}, validate: () => ok({}), run: async (ctx) => {
    const { data, error } = await ctx.db.from('device_settings').select('settings_json').eq('device_id', ctx.deviceId).maybeSingle(); if (error) throw error
    const settings = data?.settings_json as Record<string, any> | undefined; const team = Array.isArray(settings?.modules?.soccer) ? settings!.modules.soccer.find((row: any) => Number(row?.id) === 1) : null
    return completed(team?.teamName ? (ctx.language === 'no' ? `Valgt fotballag er ${team.teamName}.` : `Selected football team is ${team.teamName}.`) : (ctx.language === 'no' ? 'Ingen fotballag er valgt.' : 'No football team is selected.'))
  } },
  'groceries.add': { scope: 'device_member', destructive: false, missingQuestion: { items: { en: 'What should I add?', no: 'Hva skal jeg legge til?' } }, validate: (args) => args.items ? (validItems(args.items) ? ok({ items: validItems(args.items)! }) : invalid('Invalid grocery items.')) : required('items'), run: async (ctx, args) => {
    const items = args.items as Array<{ name: string; quantity?: number }>; await addGroceryItemsCanonical(ctx.db, ctx.deviceId, items, crypto.randomUUID()); return completed(`${ctx.language === 'no' ? 'La til' : 'Added'} ${items.map((item) => item.name).join(', ')}.`)
  } },
  'groceries.read': { scope: 'device_member', destructive: false, missingQuestion: {}, validate: () => ok({}), run: async (ctx) => {
    const { data, error } = await ctx.db.from('grocery_items').select('name,quantity').eq('device_id', ctx.deviceId).eq('is_checked', false).order('created_at'); if (error) throw error
    const names = (data ?? []).map((row: any) => row.name); return completed(names.length ? names.join(', ') : (ctx.language === 'no' ? 'Handlelisten er tom.' : 'Your grocery list is empty.'))
  } },
  'reminders.read': { scope: 'device_member', destructive: false, missingQuestion: {}, validate: () => ok({}), run: async (ctx) => {
    const { data, error } = await ctx.db.from('reminders').select('title,due_date,due_time').eq('device_id', ctx.deviceId).eq('is_done', false).order('due_date'); if (error) throw error
    const titles = (data ?? []).map((row: any) => row.title); return completed(titles.length ? titles.join(', ') : (ctx.language === 'no' ? 'Du har ingen åpne påminnelser.' : 'You have no open reminders.'))
  } },
  'countdown.create': { scope: 'device_member', destructive: false, missingQuestion: { title: { en: 'What is the countdown called?', no: 'Hva skal nedtellingen hete?' }, targetDate: { en: 'What is the target date?', no: 'Hva er måldatoen?' } }, validate: (args) => {
    if (!args.title) return required('title'); if (!args.targetDate) return required('targetDate'); const title = typeof args.title === 'string' ? args.title.trim() : ''; const targetDate = typeof args.targetDate === 'string' ? args.targetDate : ''
    return title && title.length <= 120 && ymd.test(targetDate) && !Number.isNaN(Date.parse(`${targetDate}T00:00:00Z`)) ? ok({ title, targetDate }) : invalid('Invalid countdown.')
  }, run: async (ctx, args) => { const { error } = await ctx.db.from('countdown_events').insert({ device_id: ctx.deviceId, title: args.title, target_date: args.targetDate, pinned: false, created_by_user_id: ctx.user.id, updated_by_user_id: ctx.user.id }); if (error) throw error; return completed(ctx.language === 'no' ? 'Nedtelling opprettet.' : 'Countdown created.') } },
  'settings.set_app_theme': { scope: 'user', destructive: false, missingQuestion: { theme: { en: 'Light or dark theme?', no: 'Lyst eller mørkt tema?' } }, validate: (args) => args.theme === 'light' || args.theme === 'dark' ? ok({ theme: args.theme }) : invalid('Theme must be light or dark.'), run: async (ctx, args) => { const { error } = await ctx.db.from('user_app_preferences').upsert({ user_id: ctx.user.id, app_theme: args.theme }, { onConflict: 'user_id' }); if (error) throw error; return completed(ctx.language === 'no' ? 'Apptema oppdatert.' : 'App theme updated.') } },
  'frame.set_language': deviceSettingHandler('language', ['en', 'no']),
  'frame.set_layout': { scope: 'device_member', destructive: false, missingQuestion: { layout: { en: 'Which layout?', no: 'Hvilket oppsett?' } }, validate: (args) => {
    if (!args.layout) return required('layout'); const layout = normalizeBuiltInLayout(args.layout); return layout ? ok({ layout }) : invalid('Invalid layout.')
  }, run: async (ctx, args) => {
    const { data, error } = await ctx.db.from('device_settings').select('settings_json').eq('device_id', ctx.deviceId).maybeSingle(); if (error) throw error
    const current = data?.settings_json && typeof data.settings_json === 'object' && !Array.isArray(data.settings_json) ? data.settings_json as Record<string, unknown> : {}
    const settings = transitionBuiltInLayoutSettings(current, args.layout as Parameters<typeof transitionBuiltInLayoutSettings>[1])
    const saved = await ctx.db.rpc('upsert_device_settings', { p_device_id: ctx.deviceId, p_settings: settings }); if (saved.error || saved.data !== true) throw saved.error ?? new Error('settings_not_saved')
    return completed(ctx.language === 'no' ? 'Oppsett oppdatert.' : 'Layout updated.')
  } },
  'surf.log_experience': { scope: 'device_member', destructive: false, missingQuestion: { spot: { en: 'Which surf spot?', no: 'Hvilken surfespot?' }, rating: { en: 'How was it, from 1 to 6?', no: 'Hvordan var det, fra 1 til 6?' }, date: { en: 'Today or yesterday?', no: 'I dag eller i går?' }, time: { en: 'What time was it?', no: 'Hvilket klokkeslett var det?' } }, validate: (args) => {
    for (const key of ['spot', 'rating', 'date', 'time'] as CapabilityArgument[]) if (args[key] == null || args[key] === '') return required(key)
    const spot = typeof args.spot === 'string' ? findSpotByLabel(args.spot) : null; const rating = Number(args.rating); const date = args.date; const time = args.time
    return spot && Number.isInteger(rating) && rating >= 1 && rating <= 6 && (date === 'today' || date === 'yesterday') && typeof time === 'string' && hhmm.test(time) ? ok({ spot: spot.label, rating, date, time, comment: typeof args.comment === 'string' ? args.comment : '' }) : invalid('Invalid surf experience.')
  }, run: async (ctx, args) => { if (!ctx.executeSurfLog) throw new Error('surf_adapter_missing'); return ctx.executeSurfLog(args as ValidSurfLog) } },
  'weather.read': { scope: 'device_member', destructive: false, missingQuestion: {}, validate: forecastReadValidator(false), run: async (ctx, args) => {
    if (!ctx.weatherDetails) throw new Error('weather_adapter_missing')
    const config = await firstModuleConfig(ctx, 'weather'); const lat = Number(config?.lat); const lon = Number(config?.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { status: 'needs_input', message: ctx.language === 'no' ? 'Velg et værsted først.' : 'Choose a weather location first.', cta: { label: 'Open weather', destination: 'weather' } }
    const response = await ctx.weatherDetails(new Request(`http://frame.local/api/weather/details?lat=${lat}&lon=${lon}&days=7`)); const payload = await response.json() as any
    if (!response.ok || !payload?.weather) throw new Error('weather_unavailable')
    if (args.period === 'tomorrow') {
      const daily = payload.weather.daily; const date = daily?.time?.[1]; const high = daily?.temperature_2m_max?.[1]; const low = daily?.temperature_2m_min?.[1]; const rain = daily?.precipitation_sum?.[1]
      if (!date || !Number.isFinite(Number(high)) || !Number.isFinite(Number(low))) throw new Error('tomorrow_weather_unavailable')
      return completed(ctx.language === 'no' ? `I morgen blir det ${low}–${high}°, med ${rain ?? 0} mm nedbør.` : `Tomorrow will be ${low}–${high}°, with ${rain ?? 0} mm of precipitation.`)
    }
    if (!payload.weather.current) throw new Error('current_weather_unavailable')
    const temperature = payload.weather.current.temperature_2m; return completed(ctx.language === 'no' ? `Det er ${temperature}° nå.` : `It is ${temperature}° now.`)
  } },
  'surf.read': { scope: 'device_member', destructive: false, missingQuestion: {}, validate: forecastReadValidator(true), run: async (ctx, args) => {
    if (!ctx.surfScore) throw new Error('surf_score_adapter_missing')
    const config = await firstModuleConfig(ctx, 'surf'); const requestedSpot = typeof args.spot === 'string' ? findSpotByLabel(args.spot) : null; const spot = requestedSpot?.spotId ?? (typeof config?.spotId === 'string' ? config.spotId : typeof config?.spot === 'string' ? config.spot : '')
    if (!spot) return { status: 'needs_input', message: ctx.language === 'no' ? 'Velg en surfespot først.' : 'Choose a surf spot first.', cta: { label: 'Open surf', destination: 'surf' } }
    const tomorrow = args.period === 'tomorrow'
    const response = await ctx.surfScore(new Request(`http://frame.local/api/surf/score?spotId=${encodeURIComponent(spot)}&compact=1${tomorrow ? '&daily=1&days=2' : ''}`, { headers: { authorization: ctx.authorization } })); const payload = await response.json() as any
    if (!response.ok) throw new Error('surf_unavailable')
    const forecast = tomorrow ? payload?.daily?.[1] : payload; const rating = Number(forecast?.rating ?? forecast?.score)
    if (!Number.isFinite(rating)) throw new Error(tomorrow ? 'tomorrow_surf_unavailable' : 'surf_unavailable')
    const detail = [forecast?.line1, forecast?.line2].filter((value) => typeof value === 'string' && value.trim()).join(' · ')
    const label = payload.spot ?? requestedSpot?.label ?? spot; const when = tomorrow ? (ctx.language === 'no' ? 'i morgen' : 'tomorrow') : ''
    return completed(ctx.language === 'no' ? `${label}${when ? ` ${when}` : ''}: ${rating} av 6${detail ? ` — ${detail}` : ''}.` : `${label}${when ? ` ${when}` : ''}: ${rating} out of 6${detail ? ` — ${detail}` : ''}.`)
  } },
  'settings.open': navigation('settings'), 'weather.open': navigation('weather'), 'surf.open': navigation('surf'), 'reminders.open': navigation('reminders'), 'groceries.open': navigation('groceries'), 'layout.open': navigation('layout'), 'spond.open': navigation('spond'),
}

// Navigation entries share one real deep-link adapter. Non-navigation entries
// must always have an explicit handler above; never disguise them as navigation.
for (const capability of ASSISTANT_CAPABILITIES) {
  if (capability.kind === 'navigation' && !ASSISTANT_CAPABILITY_HANDLERS[capability.id]) ASSISTANT_CAPABILITY_HANDLERS[capability.id] = navigation(capability.destination)
}

async function firstModuleConfig(ctx: CapabilityContext, module: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await ctx.db.from('device_settings').select('settings_json').eq('device_id', ctx.deviceId).maybeSingle(); if (error) throw error
  const settings = data?.settings_json as Record<string, any> | undefined; const list = settings?.modules?.[module]
  return Array.isArray(list) && list[0] && typeof list[0] === 'object' ? list[0] : null
}

function deviceSettingHandler(key: 'language' | 'layout', allowed: readonly string[]): Handler {
  return { scope: 'device_member', destructive: false, missingQuestion: { [key]: { en: `Which ${key}?`, no: key === 'language' ? 'Hvilket språk?' : 'Hvilket oppsett?' } }, validate: (args) => allowed.includes(String(args[key])) ? ok({ [key]: args[key] }) : invalid(`Invalid ${key}.`), run: async (ctx, args) => {
    const { data, error } = await ctx.db.from('device_settings').select('settings_json').eq('device_id', ctx.deviceId).maybeSingle(); if (error) throw error
    const settings = data?.settings_json && typeof data.settings_json === 'object' ? { ...data.settings_json as object, [key]: args[key] } : { [key]: args[key] }
    const saved = await ctx.db.rpc('upsert_device_settings', { p_device_id: ctx.deviceId, p_settings: settings }); if (saved.error || saved.data !== true) throw saved.error ?? new Error('settings_not_saved'); return completed(`${key} updated.`)
  } }
}

export async function executeCapability(id: string, args: CapabilityArguments, ctx: CapabilityContext): Promise<AssistantResult> {
  const handler = ASSISTANT_CAPABILITY_HANDLERS[id]
  if (!handler) return { status: 'needs_input', message: ctx.language === 'no' ? 'Det støttes ikke i RE:MIND.' : 'That is not supported in RE:MIND.' }
  if (handler.scope === 'device_member') {
    const { data } = await ctx.db.from('device_members').select('device_id').eq('device_id', ctx.deviceId).eq('user_id', ctx.user.id).maybeSingle()
    if (!data) return { status: 'error', message: "I couldn't do that. Try again." }
  }
  const validation = handler.validate(args)
  if (!validation.ok) {
    const missing = validation.missing?.[0]
    if (!missing) return { status: 'needs_input', message: validation.message ?? 'Invalid request.' }
    const { data, error } = await ctx.admin.from('assistant_pending_actions').insert({ user_id: ctx.user.id, device_id: ctx.deviceId, action: `capability:${id}`, payload: { capabilityId: id, arguments: args, missing } }).select('id').single()
    if (error || !data) return { status: 'error', message: "I couldn't do that. Try again." }
    return { status: 'needs_input', message: handler.missingQuestion[missing]?.[ctx.language] ?? 'Please provide the missing information.', pendingId: data.id }
  }
  return handler.run(ctx, validation.arguments)
}
