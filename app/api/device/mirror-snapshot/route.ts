import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SURF_SPOTS, spotIdFromLabel } from '@/app/lib/surf/spots'
import { buildMediumWeatherDetail, buildWeatherPrecipLine, buildWeatherWindLine, formatWeatherTemp, normalizeDisplayWmoForTemps } from '@/app/lib/weatherMirror'
import { normalizeSurfRating1to6, surfRatingIsExperienceBased } from '@/app/lib/surf/ratings'
import { buildFrameConfigPayload, deviceHasOwnerAccessLink, pairRequiredPayload } from '@/app/api/device/frame-config/builder'
import { fetchWeatherForecast } from '@/app/lib/server/weatherForecast'
import { AI_ASSISTANT_FRAME_LIMITS, selectAiAssistantFrameItems, type AiAssistantFrameUpdate } from '@/app/lib/device/aiAssistantFrame'
import { aiAssistantDefaultTopicTitle, simplifyAiAssistantTopicTitle } from '@/app/lib/device/aiAssistantTopicTitle.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SurfMirrorDaypart = {
  label?: string
  rating?: number
  waveRange?: string
  swellPeriodS?: number
  windSpeedMs?: number
  ratingFromExperience?: boolean
  experienceDiceValue?: number
}

type SurfMirrorDaily = SurfMirrorDaypart & {
  dateLocal?: string
}

type WeatherMirrorDay = {
  label: string
  lowTemp: string
  highTemp: string
  windLine: string
  precipLine: string
  wmo: number | null
}

type Detail = {
  primary: string
  secondary?: string
  tertiary?: string
  module?: string
  rating?: number
  waveRange?: string
  swellPeriodS?: number
  windSpeedMs?: number
  surfDayparts?: SurfMirrorDaypart[]
  surfDaily?: SurfMirrorDaily[]
  isTodaysBest?: boolean
  isExperienceBased?: boolean
  ratingFromExperience?: boolean
  experienceDiceValue?: number
  swellDirectionDeg?: number
  windDirectionDeg?: number
  groceryItems?: string[]
  reminderItems?: string[]
  reminderMediumItems?: string[]
  reminderCalendarDates?: string[]
  reminderNextItems?: Array<{ date: string; title: string }>
  reminderHeader?: string
  reminderOverflowCount?: number
  reminderMediumOverflowCount?: number
  reminderTomorrowCount?: number
  reminderDateBadge?: string
  aiAssistantItems?: Array<{ id: string; headline: string; summary?: string | null; created_at: string; topicTitle?: string }>
  aiAssistantOverflowCount?: number
  aiAssistantActiveWatchCount?: number
  aiAssistantLastCheckedAt?: string | null
  aiAssistantTopicTitle?: string
  aiAssistantActiveWatchRequests?: string[]
  aiAssistantHasActiveWatches?: boolean
  dinnerTodayTitle?: string
  groceryDinnerPlan?: Array<{ date: string; title: string }>
  groceryRunningLow?: Array<{ name: string; label?: string }>
  groceryMealIdeas?: Array<{ name: string; missing?: string[] }>
  weatherLowTemp?: string
  weatherHighTemp?: string
  weatherAdvice?: string
  weatherWindLine?: string
  weatherPrecipLine?: string
  weatherSunLine?: string
  weatherHumidityLine?: string
  weatherWmo?: number | null
  weatherDays?: WeatherMirrorDay[]
  surfAirMinC?: number
  surfAirMaxC?: number
  surfWaterMinC?: number
  surfWaterMaxC?: number
  surfSunrise?: string
  surfSunset?: string
  stockTitle?: string
  stockSymbol?: string
  stockPrice?: string
  stockDayPercent?: string
  stockRangePercent?: string
  stockOpen?: string
  stockHigh?: string
  stockLow?: string
  stockPreviousCloseText?: string
  stockChange?: string
  stockPositionPercent?: string
  stockModuleId?: number
  stockChartRange?: string
  stockSeries?: number[]
  stockSeriesTimestamps?: Array<number | null>
  stockPreviousClose?: number | null
  stockBaselinePrice?: number | null
  stockPurchasePrice?: number | null
  countdownTitle?: string
  countdownDaysLeft?: number
  countdownTargetDate?: string
  countdownPinned?: boolean
  countdownUpcoming?: Array<{ title: string; targetDate: string; daysLeft: number }>
  soccerFixtureLine?: string
  soccerKickoffLine?: string
  soccerPositionLine?: string
  soccerPointsLine?: string
  soccerNextDayLine?: string
  soccerNextTimeLine?: string
  soccerNextHomeLine?: string
  soccerNextAwayLine?: string
  soccerLastHomeLine?: string
  soccerLastAwayLine?: string
  soccerLastHomeGoalsLine?: string
  soccerLastAwayGoalsLine?: string
  soccerLeagueLine?: string
  soccerTopScorerLine?: string
  soccerRecordLine?: string
  soccerGoalsLine?: string
  soccerTableRows?: Array<{
    position: number | null
    teamShort: string
    points: number | null
    gap: number | null
    goalDifference: number | null
    isSelected: boolean
  }>
}

type UnknownRecord = Record<string, unknown>

const MODULES = new Set(['assistant', 'date', 'weather', 'surf', 'reminders', 'countdown', 'soccer', 'stocks', 'groceries'])
const MIRROR_FETCH_TIMEOUT_MS = 8000
const WEATHER_FETCH_TIMEOUT_MS = 6500

const SOCCER_TEAM_ABBREVIATIONS: Array<[string, string]> = [
  ['AFC Bournemouth', 'BOU'],
  ['Bournemouth', 'BOU'],
  ['Arsenal', 'ARS'],
  ['Aston Villa', 'AVL'],
  ['Brentford', 'BRE'],
  ['Brighton & Hove Albion', 'BHA'],
  ['Brighton', 'BHA'],
  ['Burnley', 'BUR'],
  ['Chelsea', 'CHE'],
  ['Crystal Palace', 'CRY'],
  ['Everton', 'EVE'],
  ['Fulham', 'FUL'],
  ['Leeds', 'LEE'],
  ['Liverpool', 'LIV'],
  ['Manchester City', 'MCI'],
  ['Man City', 'MCI'],
  ['Manchester United', 'MUN'],
  ['Man Utd', 'MUN'],
  ['Man United', 'MUN'],
  ['Newcastle', 'NEW'],
  ['Nottingham Forest', 'NFO'],
  ['Sunderland', 'SUN'],
  ['Tottenham Hotspur', 'TOT'],
  ['Tottenham', 'TOT'],
  ['West Ham', 'WHU'],
  ['Wolverhampton', 'WOL'],
  ['Wolves', 'WOL'],
]

const SOCCER_OFFICIAL_CODES = new Set([
  'BOU', 'ARS', 'AVL', 'BRE', 'BHA', 'BUR', 'CHE', 'CRY', 'EVE', 'FUL', 'LEE', 'LIV',
  'MCI', 'MUN', 'NEW', 'NFO', 'SUN', 'TOT', 'WHU', 'WOL',
])

function soccerOfficialish3(value: unknown) {
  const input = asString(value).trim()
  if (!input) return '---'

  for (const [needle, code] of SOCCER_TEAM_ABBREVIATIONS) {
    if (input.includes(needle)) return code
  }

  if (SOCCER_OFFICIAL_CODES.has(input)) return input

  const letters = input.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 3)
  return (letters + '---').slice(0, 3)
}

function osloDateParts(value: unknown) {
  const iso = asString(value).trim()
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo',
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const part = (type: string) => parts.find((x) => x.type === type)?.value || ''
  return {
    weekday: part('weekday') || '--',
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour') || '--',
    minute: part('minute') || '--',
  }
}

function osloYmd(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function soccerKickoffParts(value: unknown) {
  const parts = osloDateParts(value)
  if (!parts) return { dayText: '--', timeText: '--:--' }

  const kickoffYmd = `${parts.year}-${parts.month}-${parts.day}`
  const now = new Date()
  const todayYmd = osloYmd(now)
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowYmd = osloYmd(tomorrow)

  let dayText = parts.weekday
  if (kickoffYmd === todayYmd) dayText = 'Today'
  else if (kickoffYmd === tomorrowYmd) dayText = 'Tomorrow'

  return { dayText, timeText: `${parts.hour}:${parts.minute}` }
}

function soccerSmallKickoffLine(value: unknown) {
  const parts = soccerKickoffParts(value)
  return `${parts.dayText} ${parts.timeText}`
}

function soccerTableRows(value: unknown) {
  const rows = Array.isArray(value) ? value.map(asRecord) : []
  return rows
    .map((row) => ({
      position: asNumber(row.position),
      teamShort: soccerOfficialish3(row.teamShort || row.teamName),
      points: asNumber(row.points),
      gap: asNumber(row.gap),
      goalDifference: asNumber(row.goalDifference),
      isSelected: row.isSelected === true,
    }))
    .filter((row) => row.position != null || row.teamShort !== '---')
}
const RUNNING_LOW_PURCHASE_COOLDOWN_DAYS = 7
const LIKELY_AVAILABLE_RECENT_PURCHASE_DAYS = 21
const LIKELY_AVAILABLE_HISTORY_DAYS = 45
const MIRROR_RECIPE_SOURCE_MAX = 200
const MIRROR_STORED_SUGGESTION_MAX = 8
const MIN_LEARNED_AVAILABLE_DAYS = 1
const MAX_LEARNED_AVAILABLE_DAYS = 180
const MS_PER_DAY = 24 * 60 * 60 * 1000

function getBearerToken(req: Request) {
  const h = req.headers.get('authorization') || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : {}
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10)
}

function daysAgoIso(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function isIsoAtOrAfter(value: string, cutoffIso: string) {
  return !!value && value >= cutoffIso
}

function compactGroceryInsightName(value: unknown, maxLength = 32) {
  const name = asString(value, '').replace(/\s+/g, ' ').trim()
  if (!name || name.length > maxLength) return ''
  return name
}

function normalizeGroceryInsightKey(name: string) {
  return name.trim().toLocaleLowerCase()
}

function normalizeGroceryIngredientKey(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function groceryIngredientKeysMatch(recipeIngredientKey: string, availableKey: string) {
  if (!recipeIngredientKey || !availableKey) return false
  if (recipeIngredientKey === availableKey) return true
  return availableKey.includes(recipeIngredientKey) || recipeIngredientKey.includes(availableKey)
}

function maybeParseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

function recipeNameFromRow(row: UnknownRecord) {
  return compactGroceryInsightName(row.name, 32)
    || compactGroceryInsightName(row.title, 32)
    || compactGroceryInsightName(row.recipe_name, 32)
    || compactGroceryInsightName(row.suggestion, 32)
}

function isOptionalRecipeSchemaError(error: unknown) {
  const row = asRecord(error)
  const code = asString(row.code).trim()
  const message = asString(row.message).toLocaleLowerCase()
  return code === '42P01'
    || code === '42703'
    || code === 'PGRST200'
    || code === 'PGRST204'
    || message.includes('does not exist')
    || message.includes('could not find')
}

function addUniqueRecipeIngredient(target: Map<string, string>, value: unknown) {
  const name = compactGroceryInsightName(value, 28)
  if (!name) return
  const key = normalizeGroceryIngredientKey(name)
  if (!target.has(key)) target.set(key, name)
}

function addRecipeIngredient(target: Map<string, string>, value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    const parsed = trimmed.startsWith('[') || trimmed.startsWith('{') ? maybeParseJson(trimmed) : value
    if (parsed !== value) {
      addRecipeIngredients(target, parsed)
      return
    }

    for (const part of value.split(/[\n,;]+/)) addUniqueRecipeIngredient(target, part)
    return
  }

  const row = asRecord(value)
  if (Object.keys(row).length <= 0) return
  addUniqueRecipeIngredient(target, row.name ?? row.title ?? row.ingredient ?? row.item)
}

function addRecipeIngredients(target: Map<string, string>, value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) addRecipeIngredient(target, item)
    return
  }

  if (typeof value === 'string') {
    addRecipeIngredient(target, value)
    return
  }

  const row = asRecord(value)
  for (const key of ['ingredients', 'items', 'grocery_items', 'ingredient_names']) {
    if (key in row) addRecipeIngredients(target, row[key])
  }
}

function recipeIngredientsFromRow(row: UnknownRecord) {
  const ingredientMap = new Map<string, string>()
  addRecipeIngredients(ingredientMap, row.ingredients)
  addRecipeIngredients(ingredientMap, row.items)
  addRecipeIngredients(ingredientMap, row.grocery_items)
  addRecipeIngredients(ingredientMap, row.ingredient_names)
  return [...ingredientMap.entries()]
}

function recipeAppliesToDevice(row: UnknownRecord, storageDeviceIds: string[]) {
  const recipeDeviceId = asString(row.device_id).trim()
  return !recipeDeviceId || storageDeviceIds.includes(recipeDeviceId)
}

function recipeIsActive(row: UnknownRecord) {
  if (row.is_active === false || row.active === false || row.archived === true) return false
  return true
}


type CountdownMirrorRow = {
  id: string | null
  title: string | null
  target_date: string | null
  pinned: boolean | null
}

function parseYmdDateOnly(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  return { y, m, d }
}

function daysFromCivil(y: number, m: number, d: number) {
  y -= m <= 2 ? 1 : 0
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const mp = m + (m > 2 ? -3 : 9)
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

function diffDaysYmd(fromYmd: string, toYmd: string) {
  const from = parseYmdDateOnly(fromYmd)
  const to = parseYmdDateOnly(toYmd)
  if (!from || !to) return 0
  return daysFromCivil(to.y, to.m, to.d) - daysFromCivil(from.y, from.m, from.d)
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function todayYmdInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)
  return `${year}-${pad2(month)}-${pad2(day)}`
}

async function countdownDetail(supabase: SupabaseClient, storageDeviceIds: string[], language: string): Promise<Detail> {
  const { data, error } = await supabase
    .from('countdown_events')
    .select('id, title, target_date, pinned')
    .in('device_id', storageDeviceIds)
    .order('target_date', { ascending: true })
    .order('title', { ascending: true })

  if (error) throw new Error(error.message)

  const todayYmd = todayYmdInTimeZone('Europe/Oslo')
  const items = (Array.isArray(data) ? (data as CountdownMirrorRow[]) : [])
    .map((row) => {
      const title = asString(row.title).trim()
      const targetDate = asString(row.target_date).trim()
      const daysLeft = diffDaysYmd(todayYmd, targetDate)
      return title && targetDate
        ? {
            title,
            targetDate,
            daysLeft,
            pinned: !!row.pinned,
            isPast: daysLeft < 0,
          }
        : null
    })
    .filter((item): item is { title: string; targetDate: string; daysLeft: number; pinned: boolean; isPast: boolean } => !!item)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      if (a.isPast !== b.isPast) return a.isPast ? 1 : -1
      if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft
      if (a.targetDate !== b.targetDate) return a.targetDate.localeCompare(b.targetDate)
      return a.title.localeCompare(b.title)
    })

  const nearest = items.find((item) => !item.isPast) ?? items[0]
  if (!nearest) return { primary: language === 'no' ? 'Ingen nedtelling' : 'No Countdown', secondary: language === 'no' ? 'Ingen hendelser' : 'No events yet' }

  return {
    primary: nearest.title,
    secondary: language === 'no' ? 'Nedtelling' : 'Countdown',
    countdownTitle: nearest.title,
    countdownDaysLeft: nearest.daysLeft,
    countdownTargetDate: nearest.targetDate,
    countdownPinned: nearest.pinned,
    countdownUpcoming: items
      .filter((item) => !item.isPast)
      .slice(1, 5)
      .map((item) => ({
        title: item.title,
        targetDate: item.targetDate,
        daysLeft: item.daysLeft,
      })),
  }
}


type MirrorDeviceScope = {
  ownerId: string
  deviceIds: string[]
  storageDeviceIds: string[]
}

function uniqueNonEmpty(values: unknown[]) {
  return Array.from(new Set(values.map((value) => asString(value).trim()).filter(Boolean)))
}

async function resolveMirrorDeviceScope(supabase: SupabaseClient, deviceId: string, fallbackUserId: string): Promise<MirrorDeviceScope> {
  let currentDevice: UnknownRecord | null = null

  for (const select of ['id, device_id, owner_id', 'id, device_id, user_id', 'id, device_id']) {
    const { data, error } = await supabase
      .from('devices')
      .select(select)
      .eq('device_id', deviceId)
      .maybeSingle()

    if (!error) {
      currentDevice = asRecord(data)
      break
    }
  }

  const ownerIdFromDevice = asString(currentDevice?.owner_id || currentDevice?.user_id).trim()
  let ownerId = ownerIdFromDevice

  if (!ownerId) {
    const { data: ownerMember } = await supabase
      .from('device_members')
      .select('user_id')
      .eq('device_id', deviceId)
      .eq('role', 'owner')
      .maybeSingle()
    ownerId = asString((ownerMember as UnknownRecord | null)?.user_id).trim()
  }

  if (!ownerId) ownerId = fallbackUserId

  let ownedDeviceRows: UnknownRecord[] = []
  if (ownerId) {
    for (const column of ['owner_id', 'user_id']) {
      const { data, error } = await supabase
        .from('devices')
        .select('id, device_id')
        .eq(column, ownerId)

      if (!error) {
        ownedDeviceRows = Array.isArray(data) ? data.map(asRecord) : []
        break
      }
    }
  }

  if (ownedDeviceRows.length <= 0 && ownerId) {
    const { data: memberRows } = await supabase
      .from('device_members')
      .select('device_id')
      .eq('user_id', ownerId)
    const memberDeviceIds = uniqueNonEmpty(Array.isArray(memberRows) ? memberRows.map((row: { device_id?: unknown }) => row.device_id) : [])
    if (memberDeviceIds.length > 0) {
      const { data: devicesByMember } = await supabase
        .from('devices')
        .select('id, device_id')
        .in('device_id', memberDeviceIds)
      ownedDeviceRows = Array.isArray(devicesByMember) ? devicesByMember.map(asRecord) : memberDeviceIds.map((id) => ({ device_id: id }))
    }
  }

  const deviceIds = uniqueNonEmpty([deviceId, ...ownedDeviceRows.map((row) => row.device_id)])
  const storageDeviceIds = uniqueNonEmpty([
    deviceId,
    currentDevice?.id,
    currentDevice?.device_id,
    ...ownedDeviceRows.flatMap((row) => [row.device_id, row.id]),
  ])

  return {
    ownerId,
    deviceIds: deviceIds.length > 0 ? deviceIds : [deviceId],
    storageDeviceIds: storageDeviceIds.length > 0 ? storageDeviceIds : [deviceId],
  }
}

function builtInMirrorRecipeRows() {
  return [
    { name: 'Pasta with tomato sauce', ingredients: ['pasta', 'tomato', 'cheese'] },
    { name: 'Chicken rice bowl', ingredients: ['chicken', 'rice', 'vegetables'] },
    { name: 'Taco dinner', ingredients: ['tortilla', 'minced meat', 'cheese', 'tomato'] },
    { name: 'Salmon potatoes', ingredients: ['salmon', 'potatoes', 'broccoli'] },
    { name: 'Omelette', ingredients: ['eggs', 'cheese', 'ham'] },
    { name: 'Yoghurt bowl', ingredients: ['yoghurt', 'banan'] },
    { name: 'Fried rice', ingredients: ['rice', 'eggs', 'vegetables'] },
    { name: 'Soup and bread', ingredients: ['soup', 'bread'] },
  ]
}

async function loadGroceryMirrorRecipeRows(supabase: SupabaseClient, userId: string) {
  const recipeScopes = [
    { column: 'user_id', select: 'id, user_id, name' },
    { column: 'user_id', select: 'id, user_id, title' },
    { column: 'user_id', select: 'id, user_id, recipe_name' },
    { column: 'owner_id', select: 'id, owner_id, name' },
    { column: 'owner_id', select: 'id, owner_id, title' },
    { column: 'owner_id', select: 'id, owner_id, recipe_name' },
  ]

  let recipeData: unknown[] = []
  let lastError: unknown = null
  for (const scope of recipeScopes) {
    const { data, error } = await supabase
      .from('grocery_recipes')
      .select(scope.select)
      .eq(scope.column, userId)
      .limit(MIRROR_RECIPE_SOURCE_MAX)

    if (!error) {
      recipeData = Array.isArray(data) ? data : []
      lastError = null
      break
    }

    lastError = error
    if (!isOptionalRecipeSchemaError(error)) break
  }

  if (lastError) {
    if (!isOptionalRecipeSchemaError(lastError)) console.error('/api/device/mirror-snapshot grocery_recipes query failed', { error: lastError })
    return []
  }

  const recipes = recipeData.map(asRecord).filter(recipeIsActive)
  const recipeIds = recipes.map((row) => asString(row.id).trim()).filter(Boolean)
  if (recipeIds.length <= 0) return recipes

  const { data: ingredientData, error: ingredientError } = await supabase
    .from('grocery_recipe_ingredients')
    .select('recipe_id, name')
    .in('recipe_id', recipeIds)
    .limit(MIRROR_RECIPE_SOURCE_MAX * 8)

  if (ingredientError) {
    if (!isOptionalRecipeSchemaError(ingredientError)) console.error('/api/device/mirror-snapshot grocery_recipe_ingredients query failed', { error: ingredientError })
    return recipes
  }

  const ingredientsByRecipe = new Map<string, UnknownRecord[]>()
  for (const ingredient of Array.isArray(ingredientData) ? ingredientData.map(asRecord) : []) {
    const recipeId = asString(ingredient.recipe_id).trim()
    if (!recipeId) continue
    const list = ingredientsByRecipe.get(recipeId) ?? []
    list.push(ingredient)
    ingredientsByRecipe.set(recipeId, list)
  }

  return recipes.map((recipe) => ({
    ...recipe,
    ingredients: ingredientsByRecipe.get(asString(recipe.id).trim()) ?? [],
  }))
}

async function loadMirrorRecipeRows(supabase: SupabaseClient, userId: string) {
  const groceryRows = await loadGroceryMirrorRecipeRows(supabase, userId)
  return groceryRows.length > 0 ? groceryRows : builtInMirrorRecipeRows()
}

function parseMirrorMissingList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => compactGroceryInsightName(item, 28)).filter(Boolean).slice(0, 2)
  if (typeof value === 'string') {
    const parsed = value.trim().startsWith('[') ? maybeParseJson(value) : value
    if (Array.isArray(parsed)) return parseMirrorMissingList(parsed)
    return value.split(/[,;\n]+/).map((item) => compactGroceryInsightName(item, 28)).filter(Boolean).slice(0, 2)
  }
  return []
}

async function loadMirrorStoredRecipeSuggestions(supabase: SupabaseClient, userId: string) {
  const suggestionScopes = [
    { column: 'user_id', select: 'title, missing, score, updated_at, created_at, expires_at' },
    { column: 'user_id', select: 'recipe_name, missing, score, updated_at, created_at, expires_at' },
    { column: 'user_id', select: 'suggestion, missing, score, updated_at, created_at, expires_at' },
    { column: 'user_id', select: 'name, missing, score, updated_at, created_at, expires_at' },
    { column: 'owner_id', select: 'title, missing, score, updated_at, created_at, expires_at' },
    { column: 'owner_id', select: 'recipe_name, missing, score, updated_at, created_at, expires_at' },
    { column: 'owner_id', select: 'suggestion, missing, score, updated_at, created_at, expires_at' },
    { column: 'owner_id', select: 'name, missing, score, updated_at, created_at, expires_at' },
  ]

  let data: unknown[] = []
  let lastError: unknown = null
  for (const scope of suggestionScopes) {
    const result = await supabase
      .from('grocery_recipe_suggestions')
      .select(scope.select)
      .eq(scope.column, userId)
      .order('score', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(MIRROR_STORED_SUGGESTION_MAX)

    if (!result.error) {
      data = Array.isArray(result.data) ? result.data : []
      lastError = null
      break
    }

    lastError = result.error
    if (!isOptionalRecipeSchemaError(result.error)) break
  }

  if (lastError) {
    if (!isOptionalRecipeSchemaError(lastError)) console.error('/api/device/mirror-snapshot grocery_recipe_suggestions query failed', { error: lastError })
    return []
  }

  const nowIso = new Date().toISOString()
  return (Array.isArray(data) ? data.map(asRecord) : [])
    .filter((row) => {
      const expiresAt = asString(row.expires_at)
      return !expiresAt || expiresAt > nowIso
    })
    .map((row) => ({
      name: recipeNameFromRow(row),
      missing: parseMirrorMissingList(row.missing),
      score: asNumber(row.score) ?? 0,
      updatedAt: asString(row.updated_at) || asString(row.created_at),
    }))
    .filter((row) => row.name)
}

function groceryRunningLowLabel(language: string) {
  return language.toLocaleLowerCase().startsWith('no') || language.toLocaleLowerCase().startsWith('nb') || language.toLocaleLowerCase().startsWith('nn')
    ? 'Lav snart'
    : 'Low soon'
}

function buildMirrorRunningLowInsights(params: {
  language: string
  activeNames: string[]
  historyRows: UnknownRecord[]
  checkedRows: UnknownRecord[]
}) {
  const activeKeys = new Set(params.activeNames.map(normalizeGroceryInsightKey))
  const recentPurchaseCutoffIso = daysAgoIso(RUNNING_LOW_PURCHASE_COOLDOWN_DAYS)
  const recentlyPurchasedKeys = new Set<string>()
  const scores = new Map<string, { name: string; score: number; lastUsed: string }>()

  for (const row of params.historyRows) {
    const name = compactGroceryInsightName(row.name, 28)
    const lastUsed = asString(row.last_used_at)
    if (name && isIsoAtOrAfter(lastUsed, recentPurchaseCutoffIso)) {
      recentlyPurchasedKeys.add(normalizeGroceryInsightKey(name))
    }
  }

  for (const row of params.checkedRows) {
    const name = compactGroceryInsightName(row.name, 28)
    const checkedAt = asString(row.checked_at) || asString(row.updated_at)
    if (name && isIsoAtOrAfter(checkedAt, recentPurchaseCutoffIso)) {
      recentlyPurchasedKeys.add(normalizeGroceryInsightKey(name))
    }
  }

  const addScore = (nameValue: unknown, score: number, lastUsed = '') => {
    const name = compactGroceryInsightName(nameValue, 28)
    if (!name) return
    const key = normalizeGroceryInsightKey(name)
    if (activeKeys.has(key) || recentlyPurchasedKeys.has(key)) return
    const existing = scores.get(key) ?? { name, score: 0, lastUsed: '' }
    existing.score += score
    if (lastUsed && lastUsed > existing.lastUsed) existing.lastUsed = lastUsed
    scores.set(key, existing)
  }

  for (const row of params.historyRows) {
    const usageCount = Math.max(0, asNumber(row.usage_count) ?? 0)
    if (usageCount < 2) continue
    addScore(row.name, Math.min(8, usageCount * 2), asString(row.last_used_at))
  }

  const checkedCounts = new Map<string, { name: string; count: number; lastUsed: string }>()
  for (const row of params.checkedRows) {
    const name = compactGroceryInsightName(row.name, 28)
    if (!name) continue
    const key = normalizeGroceryInsightKey(name)
    if (activeKeys.has(key) || recentlyPurchasedKeys.has(key)) continue
    const checkedAt = asString(row.checked_at) || asString(row.updated_at)
    const existing = checkedCounts.get(key) ?? { name, count: 0, lastUsed: '' }
    existing.count += 1
    if (checkedAt && checkedAt > existing.lastUsed) existing.lastUsed = checkedAt
    checkedCounts.set(key, existing)
  }

  for (const entry of checkedCounts.values()) {
    if (entry.count < 2) continue
    addScore(entry.name, Math.min(6, entry.count * 3), entry.lastUsed)
  }

  const label = groceryRunningLowLabel(params.language)
  return [...scores.values()]
    .filter((item) => item.score >= 4)
    .sort((a, b) => b.score - a.score || b.lastUsed.localeCompare(a.lastUsed) || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((item) => ({ name: item.name, label }))
}

function learnedAvailableDays(row: UnknownRecord) {
  const n = asNumber(row.average_days_available)
  if (n == null || !Number.isFinite(n)) return null
  return Math.max(MIN_LEARNED_AVAILABLE_DAYS, Math.min(MAX_LEARNED_AVAILABLE_DAYS, n))
}

function ageInDays(isoValue: string) {
  const then = new Date(isoValue).getTime()
  if (Number.isNaN(then)) return null
  return Math.max(0, (Date.now() - then) / MS_PER_DAY)
}

function buildLikelyAvailableIngredientScores(params: {
  historyRows: UnknownRecord[]
  checkedRows: UnknownRecord[]
}) {
  const recentPurchaseCutoffIso = daysAgoIso(LIKELY_AVAILABLE_RECENT_PURCHASE_DAYS)
  const historyCutoffIso = daysAgoIso(LIKELY_AVAILABLE_HISTORY_DAYS)
  const scores = new Map<string, { name: string; score: number; lastUsed: string }>()

  const addScore = (nameValue: unknown, score: number, lastUsed = '') => {
    const name = compactGroceryInsightName(nameValue, 28)
    if (!name) return
    const key = normalizeGroceryIngredientKey(name)
    const existing = scores.get(key) ?? { name, score: 0, lastUsed: '' }
    existing.score += score
    if (lastUsed && lastUsed > existing.lastUsed) existing.lastUsed = lastUsed
    scores.set(key, existing)
  }

  for (const row of params.historyRows) {
    const usageCount = Math.max(0, asNumber(row.usage_count) ?? 0)
    const lastUsed = asString(row.last_used_at)
    const lastPurchased = asString(row.last_purchased_at) || lastUsed
    if (usageCount < 2 || !isIsoAtOrAfter(lastUsed, historyCutoffIso)) continue

    const averageDaysAvailable = learnedAvailableDays(row)
    if (averageDaysAvailable != null && lastPurchased) {
      const ageDays = ageInDays(lastPurchased)
      if (ageDays == null || ageDays > averageDaysAvailable) continue

      const remainingRatio = Math.max(0.15, (averageDaysAvailable - ageDays) / averageDaysAvailable)
      const learnedFreshnessScore = Math.ceil(remainingRatio * 8)
      addScore(row.name, Math.min(10, usageCount) + learnedFreshnessScore, lastPurchased)
      continue
    }

    addScore(row.name, Math.min(10, usageCount) + (isIsoAtOrAfter(lastUsed, recentPurchaseCutoffIso) ? 4 : 0), lastUsed)
  }

  for (const row of params.checkedRows) {
    const checkedAt = asString(row.checked_at) || asString(row.updated_at)
    if (!isIsoAtOrAfter(checkedAt, recentPurchaseCutoffIso)) continue
    addScore(row.name, 8, checkedAt)
  }

  return scores
}

function buildMirrorMealIdeas(params: {
  recipeRows: UnknownRecord[]
  storedSuggestions: Array<{ name: string; missing: string[]; score: number; updatedAt: string }>
  dinnerPlanTitles: string[]
  historyRows: UnknownRecord[]
  checkedRows: UnknownRecord[]
}) {
  const likelyAvailable = buildLikelyAvailableIngredientScores({
    historyRows: params.historyRows,
    checkedRows: params.checkedRows,
  })
  const plannedTitles = new Set(params.dinnerPlanTitles.map(normalizeGroceryInsightKey))
  const ideas = new Map<string, { name: string; missing: string[]; score: number; updatedAt: string }>()

  for (const row of params.storedSuggestions) {
    const key = normalizeGroceryInsightKey(row.name)
    if (!key || plannedTitles.has(key)) continue
    ideas.set(key, { name: row.name, missing: row.missing, score: row.score + 1000, updatedAt: row.updatedAt })
  }

  for (const row of params.recipeRows) {
    const name = recipeNameFromRow(row)
    if (!name) continue

    const key = normalizeGroceryInsightKey(name)
    if (plannedTitles.has(key)) continue

    const ingredients = recipeIngredientsFromRow(row)
    if (ingredients.length < 2) continue

    const ingredientMatches = ingredients.map(([ingredientKey, ingredientName]) => {
      const matched = [...likelyAvailable.entries()].find(([availableKey]) => groceryIngredientKeysMatch(ingredientKey, availableKey))
      return { ingredientName, score: matched?.[1].score ?? 0 }
    })
    const matchedIngredientScores = ingredientMatches.map((match) => match.score).filter((score) => score > 0)
    const missing = ingredientMatches.filter((match) => match.score <= 0).map((match) => match.ingredientName)
    const overlap = matchedIngredientScores.length
    if (overlap < 1 || missing.length > 2) continue

    const learnedScore = matchedIngredientScores.reduce((total, score) => total + score, 0)
    const updatedAt = asString(row.updated_at) || asString(row.created_at)
    const score = learnedScore + overlap * 3 + ingredients.length - missing.length + (updatedAt ? 1 : 0)
    const existing = ideas.get(key)
    if (!existing || score > existing.score || updatedAt > existing.updatedAt) {
      ideas.set(key, { name, missing: missing.slice(0, 2), score, updatedAt })
    }
  }

  return [...ideas.values()]
    .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name))
    .slice(0, 2)
    .map((idea) => ({ name: idea.name, missing: idea.missing }))
}

function splitStoredModule(value: unknown) {
  const raw = String(value ?? '').trim()
  const [baseRaw, idRaw] = raw.split(':', 2)
  const base = baseRaw.toLowerCase()
  if (!MODULES.has(base)) return null
  const id = Math.max(1, Math.round(Number(idRaw || 1)) || 1)
  return { raw, base, id }
}

function moduleConfig(modules: UnknownRecord, base: string, id: number) {
  const raw = modules[base]
  if (Array.isArray(raw)) {
    const exact = raw.find((item) => Number(asRecord(item).id) === id)
    return asRecord(exact ?? raw[id - 1])
  }
  return asRecord(raw)
}

function formatTemp(value: unknown, units: string) {
  return formatWeatherTemp(value, units === 'imperial' ? 'imperial' : 'metric')
}

function formatPrice(value: unknown, currency: string) {
  const n = asNumber(value)
  if (n == null) return '--'
  const digits = Math.abs(n) >= 100 ? 2 : 2
  return `${currency} ${n.toFixed(digits)}`
}

function formatFrameStockPrice(value: unknown) {
  const n = asNumber(value)
  if (n == null) return '--'
  return Math.abs(n) >= 1000 ? n.toFixed(0) : n.toFixed(2)
}

function formatFrameStockSigned(value: unknown, withPercent = false) {
  const n = asNumber(value)
  if (n == null) return '--'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}${withPercent ? '%' : ''}`
}


function truthy(value: unknown) {
  if (value === true) return true
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.trim().toLowerCase())
  return false
}

function surfExperienceDiceValue(payload: UnknownRecord, fallbackRating?: number) {
  if (!isSurfScoreExperienceBased(payload)) return undefined
  const breakdown = asRecord(payload.breakdown)
  const experience = asRecord(breakdown.experience)
  const topExperience = asRecord(payload.experience)
  const picked = asRecord(payload.picked)
  const pickedBreakdown = asRecord(picked.breakdown)
  const pickedExperience = asRecord(picked.experience)
  const candidates = [
    fallbackRating,
    asNumber(payload.rating),
    asNumber(payload.score),
    asNumber(experience.blended_rating_1_6),
    asNumber(topExperience.blended_rating_1_6),
    asNumber(asRecord(pickedBreakdown.experience).blended_rating_1_6),
    asNumber(pickedExperience.blended_rating_1_6),
    asNumber(experience.rating_1_6),
    asNumber(topExperience.rating_1_6),
    asNumber(asRecord(pickedBreakdown.experience).rating_1_6),
    asNumber(pickedExperience.rating_1_6),
  ]

  for (const value of candidates) {
    if (value != null && value >= 1 && value <= 6) return Math.round(value)
  }

  return undefined
}

function isSurfScoreExperienceBased(payload: UnknownRecord) {
  const breakdown = asRecord(payload.breakdown)
  const experience = asRecord(breakdown.experience)
  const topExperience = asRecord(payload.experience)
  const picked = asRecord(payload.picked)
  const pickedBreakdown = asRecord(picked.breakdown)
  const pickedExperience = asRecord(picked.experience)
  const source = asString(payload.ratingSource || payload.source).toLowerCase()

  return (
    truthy(payload.isExperienceBased) ||
    truthy(payload.ratingFromExperience) ||
    truthy(payload.basedOnExperience) ||
    source.includes('experience') ||
    source.includes('user_surf_experiences') ||
    truthy(experience.matched) ||
    truthy(experience.isExperienceBased) ||
    truthy(topExperience.matched) ||
    truthy(pickedExperience.matched) ||
    truthy(asRecord(pickedBreakdown.experience).matched)
  )
}

function formatPercent(value: unknown) {
  const n = asNumber(value)
  if (n == null) return null
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}


function seriesTimestampMs(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 100000000000 ? value : value * 1000
  }
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function selectedSeriesRows(value: unknown) {
  const series = Array.isArray(value) ? value : []
  const rows = series
    .map((point, index) => {
      if (typeof point === 'number') {
        return Number.isFinite(point) ? { price: point, index, timestampMs: null as number | null } : null
      }

      const row = asRecord(point)
      const price = asNumber(row.p) ?? asNumber(row.price)
      if (price == null || !Number.isFinite(price)) return null

      const timestampMs =
        seriesTimestampMs(row.t) ??
        seriesTimestampMs(row.timestamp) ??
        seriesTimestampMs(row.time) ??
        seriesTimestampMs(row.date)

      return { price, index, timestampMs }
    })
    .filter((row): row is { price: number; index: number; timestampMs: number | null } => row != null)

  const hasTimestamps = rows.some((row) => row.timestampMs != null)
  if (!hasTimestamps) return rows

  return [...rows].sort((a, b) => {
    if (a.timestampMs == null && b.timestampMs == null) return a.index - b.index
    if (a.timestampMs == null) return 1
    if (b.timestampMs == null) return -1
    return a.timestampMs - b.timestampMs || a.index - b.index
  })
}


function normalizeStockRange(value: unknown) {
  const raw = asString(value, 'day').trim().toLowerCase()
  return raw === 'week' || raw === 'month' || raw === 'year' ? raw : 'day'
}

function selectedSeriesPercent(value: unknown) {
  const prices = selectedSeriesRows(value).map((point) => point.price)

  if (prices.length < 2) return null

  const start = prices[0]
  const end = prices[prices.length - 1]
  if (!Number.isFinite(start) || !Number.isFinite(end) || Math.abs(start) <= 0.00001) return null

  return ((end - start) / start) * 100
}

function formatDate(language: string) {
  return new Intl.DateTimeFormat(language === 'no' ? 'nb-NO' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date())
}

function appOrigin(req: Request) {
  const url = new URL(req.url)
  return `${url.protocol}//${url.host}`
}

async function fetchJson(url: string, init?: RequestInit & { timeoutMs?: number }) {
  const timeoutMs = init?.timeoutMs ?? MIRROR_FETCH_TIMEOUT_MS
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const { timeoutMs: _timeoutMs, signal: callerSignal, ...fetchInit } = init || {}

  if (callerSignal) {
    if (callerSignal.aborted) controller.abort()
    else callerSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  try {
    const resp = await fetch(url, { ...fetchInit, cache: 'no-store', signal: controller.signal })
    if (!resp.ok) throw new Error(`Fetch failed ${resp.status}`)
    return resp.json() as Promise<unknown>
  } catch (e: unknown) {
    const isAbort = e instanceof Error && e.name === 'AbortError'
    throw new Error(isAbort ? `Fetch timed out after ${timeoutMs}ms` : e instanceof Error ? e.message : String(e || 'Fetch failed'))
  } finally {
    clearTimeout(timeout)
  }
}

function arrayNumberAt(values: unknown, index: number): number | null {
  return Array.isArray(values) ? asNumber(values[index]) : null
}

function arrayStringAt(values: unknown, index: number): string {
  return Array.isArray(values) ? asString(values[index]) : ''
}

function hhmmFromIso(value: string) {
  const match = /T(\d{2}:\d{2})/.exec(value)
  return match ? match[1] : ''
}

function weekdayShortFromYmd(value: string, language: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return '--'

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (Number.isNaN(date.getTime())) return '--'

  return new Intl.DateTimeFormat(language === 'no' ? 'nb-NO' : 'en-US', { weekday: 'short', timeZone: 'UTC' })
    .format(date)
    .replace(/\.$/, '')
}

function wmoSeverityRank(wmo: number) {
  if (wmo === 95 || wmo === 96 || wmo === 99) return 90
  if ((wmo >= 71 && wmo <= 77) || wmo === 85 || wmo === 86) return 100
  if (wmo === 66 || wmo === 67) return 85
  if ((wmo >= 51 && wmo <= 65) || (wmo >= 80 && wmo <= 82)) return 80
  if (wmo === 45 || wmo === 48) return 60
  if (wmo === 3) return 40
  if (wmo === 1 || wmo === 2) return 30
  if (wmo === 0) return 10
  return 20
}

function isPrecipWmo(wmo: number) {
  return (
    (wmo >= 51 && wmo <= 67) ||
    (wmo >= 71 && wmo <= 77) ||
    (wmo >= 80 && wmo <= 82) ||
    wmo === 85 ||
    wmo === 86 ||
    wmo === 95 ||
    wmo === 96 ||
    wmo === 99
  )
}

type WmoCount = { wmo: number; count: number }

function chooseDominantWmo(counts: WmoCount[], fallbackWmo: number | null, precipMm: number | null) {
  const totalCount = counts.reduce((sum, item) => sum + item.count, 0)
  let chosen = fallbackWmo

  if (counts.length > 0) {
    let best = counts[0]
    let bestRank = wmoSeverityRank(best.wmo)

    for (const item of counts.slice(1)) {
      const rank = wmoSeverityRank(item.wmo)
      if (item.count > best.count || (item.count === best.count && rank > bestRank)) {
        best = item
        bestRank = rank
      }
    }
    chosen = best.wmo

    if (precipMm != null && precipMm > 2.0) {
      let precipBest: WmoCount | null = null
      let precipBestRank = -1

      for (const item of counts) {
        if (!isPrecipWmo(item.wmo)) continue
        const rank = wmoSeverityRank(item.wmo)
        if (precipBest == null || item.count > precipBest.count || (item.count === precipBest.count && rank > precipBestRank)) {
          precipBest = item
          precipBestRank = rank
        }
      }

      // Only let precipitation override the icon when it covers a meaningful
      // share of the selected period. A short late shower should still be
      // mentioned in the text, but the icon should represent the mostly-dry day.
      const precipCoverageThreshold = Math.max(3, Math.ceil(totalCount * 0.35))
      if (precipBest && precipBest.count >= precipCoverageThreshold) chosen = precipBest.wmo
    }
  }

  return chosen
}

function addWmoCount(counts: WmoCount[], wmo: number) {
  const existing = counts.find((item) => item.wmo === wmo)
  if (existing) existing.count += 1
  else counts.push({ wmo, count: 1 })
}

function localHourFromIso(value: string) {
  const match = /T(\d{2})/.exec(value)
  return match ? Number(match[1]) : null
}

function computeSelectedWeatherPeriods(data: UnknownRecord, fallbackFullDay: {
  hiC: number | null
  loC: number | null
  windMaxMs: number | null
  precipMm: number | null
  wmo: number | null
}) {
  const current = asRecord(data.current)
  const hourly = asRecord(data.hourly)
  const currentTime = asString(current.time)
  const currentDate = currentTime.slice(0, 10)
  const currentHour = localHourFromIso(currentTime)
  const times = Array.isArray(hourly.time) ? hourly.time : []

  if (currentDate.length < 10) {
    const normalizedWmo = normalizeDisplayWmoForTemps(fallbackFullDay.wmo, fallbackFullDay.loC, fallbackFullDay.hiC)
    return {
      ...fallbackFullDay,
      wmo: normalizedWmo,
      restValid: false,
      restHiC: fallbackFullDay.hiC,
      restLoC: fallbackFullDay.loC,
      restWindMaxMs: fallbackFullDay.windMaxMs,
      restPrecipMm: fallbackFullDay.precipMm,
      restWmo: normalizedWmo,
    }
  }

  let hiC: number | null = null
  let loC: number | null = null
  let windMaxMs: number | null = null
  let precipMm = 0
  let sawPrecip = false
  let sawFullDay = false
  const wmoCounts: WmoCount[] = []

  let restHiC: number | null = null
  let restLoC: number | null = null
  let restWindMaxMs: number | null = null
  let restPrecipMm = 0
  let sawRestPrecip = false
  let sawRestToday = false
  const restWmoCounts: WmoCount[] = []

  times.forEach((rawTime, index) => {
    const time = asString(rawTime)
    if (!time.startsWith(currentDate)) return
    const hour = localHourFromIso(time)
    if (hour == null || hour < 0 || hour >= 24) return

    const temp = arrayNumberAt(hourly.temperature_2m, index)
    if (temp != null) {
      hiC = hiC == null ? temp : Math.max(hiC, temp)
      loC = loC == null ? temp : Math.min(loC, temp)
    }

    const wind = arrayNumberAt(hourly.wind_speed_10m, index)
    if (wind != null) windMaxMs = windMaxMs == null ? wind : Math.max(windMaxMs, wind)

    const precip = arrayNumberAt(hourly.precipitation, index)
    if (precip != null) {
      sawPrecip = true
      if (precip > 0) precipMm += precip
    }

    const wmo = arrayNumberAt(hourly.weather_code, index)
    if (wmo != null) addWmoCount(wmoCounts, Math.round(wmo))
    sawFullDay = true

    const isRestOfToday = currentHour != null && hour >= currentHour
    if (!isRestOfToday) return

    if (temp != null) {
      restHiC = restHiC == null ? temp : Math.max(restHiC, temp)
      restLoC = restLoC == null ? temp : Math.min(restLoC, temp)
    }

    if (wind != null) restWindMaxMs = restWindMaxMs == null ? wind : Math.max(restWindMaxMs, wind)

    if (precip != null) {
      sawRestPrecip = true
      if (precip > 0) restPrecipMm += precip
    }

    if (wmo != null) addWmoCount(restWmoCounts, Math.round(wmo))
    sawRestToday = true
  })

  const selectedHiC = sawFullDay && hiC != null ? hiC : fallbackFullDay.hiC
  const selectedLoC = sawFullDay && loC != null ? loC : fallbackFullDay.loC
  const selectedWindMaxMs = sawFullDay && windMaxMs != null ? windMaxMs : fallbackFullDay.windMaxMs
  const selectedPrecipMm = sawFullDay && sawPrecip ? precipMm : fallbackFullDay.precipMm
  const selectedWmo = normalizeDisplayWmoForTemps(
    chooseDominantWmo(wmoCounts, fallbackFullDay.wmo, selectedPrecipMm),
    selectedLoC,
    selectedHiC,
  )

  const restSelectedHiC = sawRestToday && restHiC != null ? restHiC : selectedHiC
  const restSelectedLoC = sawRestToday && restLoC != null ? restLoC : selectedLoC
  const restSelectedWindMaxMs = sawRestToday && restWindMaxMs != null ? restWindMaxMs : selectedWindMaxMs
  const restSelectedPrecipMm = sawRestToday && sawRestPrecip ? restPrecipMm : selectedPrecipMm
  const restSelectedWmo = normalizeDisplayWmoForTemps(
    chooseDominantWmo(restWmoCounts, selectedWmo, restSelectedPrecipMm),
    restSelectedLoC,
    restSelectedHiC,
  )

  return {
    hiC: selectedHiC,
    loC: selectedLoC,
    windMaxMs: selectedWindMaxMs,
    precipMm: selectedPrecipMm,
    wmo: selectedWmo,
    restValid: sawRestToday,
    restHiC: restSelectedHiC,
    restLoC: restSelectedLoC,
    restWindMaxMs: restSelectedWindMaxMs,
    restPrecipMm: restSelectedPrecipMm,
    restWmo: restSelectedWmo,
  }
}

function buildTodayWeatherInsightHours(data: UnknownRecord) {
  const current = asRecord(data.current)
  const hourly = asRecord(data.hourly)
  const currentDate = asString(current.time).slice(0, 10)
  const times = Array.isArray(hourly.time) ? hourly.time : []
  if (currentDate.length < 10 || times.length === 0) return []
  return times.flatMap((rawTime, index) => {
    const time = asString(rawTime)
    if (!time.startsWith(currentDate)) return []
    const hour = localHourFromIso(time)
    if (hour == null || hour < 0 || hour >= 24) return []
    return [{
      hour,
      tempC: arrayNumberAt(hourly.temperature_2m, index),
      precipMm: arrayNumberAt(hourly.precipitation, index),
      windMs: arrayNumberAt(hourly.wind_speed_10m, index),
      wmo: arrayNumberAt(hourly.weather_code, index),
    }]
  })
}

async function weatherDetail(cfg: UnknownRecord, language: string, configUpdatedAt?: string | null): Promise<Detail> {
  const lat = asNumber(cfg.lat)
  const lon = asNumber(cfg.lon)
  const label = asString(cfg.label).trim()
  const units = asString(cfg.units, 'metric').toLowerCase() === 'imperial' ? 'imperial' : 'metric'
  const showHiLo = cfg.hiLo == null ? true : truthy(cfg.hiLo)
  if (lat == null || lon == null) return { module: 'weather', primary: '--°', secondary: label || (language === 'no' ? 'Vær utilgjengelig' : 'Weather unavailable'), tertiary: language === 'no' ? 'Mangler sted' : 'Missing location' }

  let data: UnknownRecord
  try {
    const fetched = await fetchWeatherForecast({
      lat,
      lon,
      timeoutMs: WEATHER_FETCH_TIMEOUT_MS,
      frameRequest: true,
      configUpdatedAt: configUpdatedAt ?? null,
    })
    if (!fetched.payload) throw new Error(fetched.error || 'Open-Meteo weather unavailable')
    data = asRecord(fetched.payload)
    console.info('[mirror-snapshot:weather]', { stage: 'open-meteo-cache', label, lat, lon, ...fetched.debug })
  } catch (e: unknown) {
    const reason = e instanceof Error ? e.message : String(e || 'Unknown weather error')
    console.error('[mirror-snapshot:weather]', { stage: 'open-meteo-failed', label, lat, lon, reason })
    return {
      module: 'weather',
      primary: '--°',
      secondary: label || (language === 'no' ? 'Vær utilgjengelig' : 'Weather unavailable'),
      tertiary: language === 'no' ? 'Prøv igjen snart' : 'Try again soon',
      weatherLowTemp: '--°',
      weatherHighTemp: '--°',
      weatherAdvice: language === 'no' ? 'Værdata er midlertidig utilgjengelig.' : 'Weather data is temporarily unavailable.',
      weatherWindLine: language === 'no' ? 'Vind --' : 'Wind --',
      weatherPrecipLine: language === 'no' ? 'Nedbør --' : 'Precip --',
      weatherSunLine: 'Sun --:-- / --:--',
      weatherHumidityLine: 'Humidity --%',
      weatherWmo: null,
      weatherDays: [],
    }
  }
  const current = asRecord(data.current)
  const daily = asRecord(data.daily)
  const missingRenderFields = [
    asNumber(current.temperature_2m) == null ? 'weather.current.temperature_2m' : '',
    !Array.isArray(daily.time) ? 'weather.daily.time' : '',
    !Array.isArray(daily.temperature_2m_max) ? 'weather.daily.temperature_2m_max' : '',
    !Array.isArray(daily.temperature_2m_min) ? 'weather.daily.temperature_2m_min' : '',
  ].filter(Boolean)
  if (missingRenderFields.length) {
    console.error('[mirror-snapshot:weather]', { stage: 'missing-render-fields', label, lat, lon, missingFields: missingRenderFields })
  }
  const currentTempC = asNumber(current.temperature_2m)
  const humidity = asNumber(current.relative_humidity_2m)
  const hiC = arrayNumberAt(daily.temperature_2m_max, 0)
  const loC = arrayNumberAt(daily.temperature_2m_min, 0)
  const windMaxMs = arrayNumberAt(daily.wind_speed_10m_max, 0)
  const precipMm = arrayNumberAt(daily.precipitation_sum, 0)
  const wmo = arrayNumberAt(daily.weather_code, 0)
  const currentTime = asString(current.time)
  const sunriseHHMM = hhmmFromIso(arrayStringAt(daily.sunrise, 0))
  const sunsetHHMM = hhmmFromIso(arrayStringAt(daily.sunset, 0))
  const selectedPeriods = computeSelectedWeatherPeriods(data, { hiC, loC, windMaxMs, precipMm, wmo })
  const medium = buildMediumWeatherDetail({
    units,
    showHiLo,
    currentTempC,
    ...selectedPeriods,
    sunriseHHMM,
    sunsetHHMM,
    localHour: localHourFromIso(currentTime),
    todayHours: buildTodayWeatherInsightHours(data),
  })
  const dailyTime = Array.isArray(daily.time) ? daily.time : []
  const weatherDays: WeatherMirrorDay[] = Array.from({ length: Math.min(5, Math.max(1, dailyTime.length)) }, (_, index) => {
    const dayLoC = index === 0 && selectedPeriods.restValid ? selectedPeriods.restLoC : arrayNumberAt(daily.temperature_2m_min, index)
    const dayHiC = index === 0 && selectedPeriods.restValid ? selectedPeriods.restHiC : arrayNumberAt(daily.temperature_2m_max, index)
    const dayWindMaxMs = index === 0 && selectedPeriods.restValid ? selectedPeriods.restWindMaxMs : arrayNumberAt(daily.wind_speed_10m_max, index)
    const dayPrecipMm = index === 0 && selectedPeriods.restValid ? selectedPeriods.restPrecipMm : arrayNumberAt(daily.precipitation_sum, index)
    const dayWmo = index === 0 && selectedPeriods.restValid ? selectedPeriods.restWmo : arrayNumberAt(daily.weather_code, index)

    return {
      label: index === 0 ? 'Today' : weekdayShortFromYmd(asString(dailyTime[index]), language),
      lowTemp: formatTemp(dayLoC, units),
      highTemp: formatTemp(dayHiC, units),
      windLine: buildWeatherWindLine(dayWindMaxMs),
      precipLine: buildWeatherPrecipLine(dayPrecipMm, dayWmo, dayLoC, dayHiC),
      wmo: dayWmo,
    }
  })

  return {
    primary: formatTemp(currentTempC, units),
    secondary: label || (language === 'no' ? 'Vær' : 'Weather'),
    tertiary: `${formatTemp(loC, units)} / ${formatTemp(hiC, units)}`,
    ...medium,
    weatherSunLine: `Sun ${sunriseHHMM || '--:--'} / ${sunsetHHMM || '--:--'}`,
    weatherHumidityLine: humidity != null ? `Humidity ${Math.round(humidity)}%` : 'Humidity --%',
    weatherDays,
  }
}

function isTodaysBestSurfConfig(spotId: string, spot: string) {
  if (spotId.toLowerCase() === '__todays_best__') return true

  const normalizedSpot = spot.trim().toLowerCase()
  return normalizedSpot === "today's best" || normalizedSpot === 'todays best' || normalizedSpot === 'dagens beste'
}

function buildPhysicalSurfScoreUrl(origin: string, cfg: UnknownRecord, surfSettings: UnknownRecord, spotIdOverride?: string, configUpdatedAt?: string | null) {
  const spot = asString(cfg.spot || cfg.label).trim()
  const configuredSpotId = asString(cfg.spotId).trim()
  const spotId = configuredSpotId || (spot ? spotIdFromLabel(spot) ?? '' : '')
  const lat = asNumber(cfg.lat)
  const lon = asNumber(cfg.lon)
  const isBuiltInSpot = !!spotId && !!SURF_SPOTS[spotId]
  const url = new URL('/api/surf/score', origin)

  if (spotIdOverride) url.searchParams.set('spotId', spotIdOverride)
  else if (spotId) url.searchParams.set('spotId', spotId)
  else if (spot) url.searchParams.set('spot', spot)
  else url.searchParams.set('spot', 'Surf')

  // Built-in spots are resolved server-side from the shared surf spot registry.
  // Do not forward stale/default coordinates such as lat=0/lon=0 from mirror config,
  // because query lat/lon must only describe true custom spots.
  if (!spotIdOverride && !isBuiltInSpot && lat != null) url.searchParams.set('lat', String(lat))
  if (!spotIdOverride && !isBuiltInSpot && lon != null) url.searchParams.set('lon', String(lon))

  url.searchParams.set('hours', '4')
  url.searchParams.set('frame', '1')
  if (configUpdatedAt) url.searchParams.set('configUpdatedAt', configUpdatedAt)

  if (!spotIdOverride && isTodaysBestSurfConfig(spotId, spot)) {
    const fuelPenalty = truthy(surfSettings.fuelPenalty)
    const homeLat = asNumber(surfSettings.homeLat)
    const homeLon = asNumber(surfSettings.homeLon)
    url.searchParams.set('fuelPenalty', fuelPenalty ? '1' : '0')
    if (fuelPenalty && homeLat != null && homeLon != null && homeLat !== 0 && homeLon !== 0) {
      url.searchParams.set('homeLat', String(homeLat))
      url.searchParams.set('homeLon', String(homeLon))
    }
  }

  return { url, spot, spotId, isTodaysBest: isTodaysBestSurfConfig(spotId, spot) }
}

function resolvedSurfSpotId(payload: UnknownRecord) {
  const picked = asRecord(payload.picked)
  return asString(payload.spotId || payload.spot_id || picked.spotId || picked.spot_id).trim()
}

async function surfDetail(
  origin: string,
  cfg: UnknownRecord,
  authToken: string,
  language: string,
  surfSettings: UnknownRecord,
  configUpdatedAt?: string | null
): Promise<Detail> {
  const base = buildPhysicalSurfScoreUrl(origin, cfg, surfSettings, undefined, configUpdatedAt)
  const headers = { Authorization: `Bearer ${authToken}` }

  // Mirror the firmware's render path: Today's Best is first resolved with the exact
  // physical-frame query, then the winning spot is fetched again for daypart/daily data.
  let data = asRecord(await fetchJson(base.url.toString(), { headers }))
  if (base.isTodaysBest) {
    const winnerSpotId = resolvedSurfSpotId(data)
    if (winnerSpotId) {
      const winner = buildPhysicalSurfScoreUrl(origin, cfg, surfSettings, winnerSpotId, configUpdatedAt)
      winner.url.searchParams.set('dayparts', '1')
      winner.url.searchParams.set('daily', '1')
      winner.url.searchParams.set('days', '5')
      data = asRecord(await fetchJson(winner.url.toString(), { headers }))
    }
  } else {
    base.url.searchParams.set('dayparts', '1')
    base.url.searchParams.set('daily', '1')
    base.url.searchParams.set('days', '5')
    data = asRecord(await fetchJson(base.url.toString(), { headers }))
  }

  const forecast = asRecord(data.forecast)
  const inputs = asRecord(data.inputs)
  const rating = normalizeSurfRating1to6(data).rating
  const waveRange = asString(forecast.wave_height_range_label || data.line1 || data.line2, '')
  const isExperienceBased = surfRatingIsExperienceBased(data)
  const normalizeSurfPeriod = (part: unknown): SurfMirrorDaily | null => {
    const record = asRecord(part)
    const label = asString(record.label).trim()
    const partRating = normalizeSurfRating1to6(record).rating
    const partWaveRange = asString(record.wave_height_range_label || record.waveRange || record.wave_range, '').trim()
    const partSwellPeriodS = asNumber(record.swell_period_s ?? record.swellPeriodS) ?? undefined
    const partWindSpeedMs = asNumber(record.wind_speed_ms ?? record.windSpeedMs) ?? undefined
    const partRatingFromExperience = surfRatingIsExperienceBased(record)
    const partExperienceDiceValue = surfExperienceDiceValue(record, partRating)
    const dateLocal = asString(record.date_local || record.dateLocal, '').trim()
    if (
      !label &&
      partRating == null &&
      !partWaveRange &&
      partSwellPeriodS == null &&
      partWindSpeedMs == null &&
      !partRatingFromExperience &&
      partExperienceDiceValue == null &&
      !dateLocal
    ) return null
    return {
      label: label || undefined,
      rating: partRating,
      waveRange: partWaveRange || undefined,
      swellPeriodS: partSwellPeriodS,
      windSpeedMs: partWindSpeedMs,
      ratingFromExperience: partRatingFromExperience || undefined,
      experienceDiceValue: partExperienceDiceValue,
      dateLocal: dateLocal || undefined,
    }
  }

  const surfDayparts = Array.isArray(data.dayparts)
    ? data.dayparts.map(normalizeSurfPeriod).filter((part): part is SurfMirrorDaypart => Boolean(part))
    : undefined
  const surfDaily = Array.isArray(data.daily)
    ? data.daily.map(normalizeSurfPeriod).filter((part): part is SurfMirrorDaily => Boolean(part))
    : undefined
  const air = asRecord(data.air)
  const water = asRecord(data.water)
  const sun = asRecord(data.sun)
  const weather = asRecord(data.weather)

  return {
    module: 'surf',
    primary: String(rating ?? '--'),
    secondary: asString(data.spot, base.spot || (language === 'no' ? 'Surf' : 'Surf')),
    tertiary: waveRange,
    rating,
    waveRange,
    surfDayparts,
    surfDaily,
    weatherWmo: asNumber(weather.code) ?? null,
    surfAirMinC: asNumber(air.temp_min_c) ?? undefined,
    surfAirMaxC: asNumber(air.temp_max_c) ?? undefined,
    surfWaterMinC: asNumber(water.temp_min_c) ?? undefined,
    surfWaterMaxC: asNumber(water.temp_max_c) ?? undefined,
    surfSunrise: asString(sun.sunrise, '') || undefined,
    surfSunset: asString(sun.sunset, '') || undefined,
    isExperienceBased,
    ratingFromExperience: isExperienceBased,
    experienceDiceValue: surfExperienceDiceValue(data, rating),
    swellPeriodS: asNumber(inputs.swell_period_s) ?? undefined,
    windSpeedMs: asNumber(inputs.wind_speed_ms) ?? undefined,
    swellDirectionDeg: asNumber(inputs.swell_direction_deg) ?? undefined,
    windDirectionDeg: asNumber(inputs.wind_direction_deg) ?? undefined,
    isTodaysBest: base.isTodaysBest,
  }
}

async function soccerDetail(origin: string, cfg: UnknownRecord, language: string): Promise<Detail> {
  const teamId = asString(cfg.teamId).trim()
  const teamName = asString(cfg.teamName || cfg.team).trim()
  if (!teamId) return { primary: teamName || 'SOCCER', secondary: language === 'no' ? 'Lagret lag' : 'Saved team' }
  const url = new URL('/api/soccer/frame', origin)
  url.searchParams.set('teamId', teamId)
  const data = asRecord(await fetchJson(url.toString()))
  const next = asRecord(data.next)
  const last = asRecord(data.last)
  const standing = asRecord(data.standing)
  const position = asNumber(standing.position)
  const points = asNumber(standing.points)
  const won = asNumber(standing.won)
  const draw = asNumber(standing.draw)
  const lost = asNumber(standing.lost)
  const goalsFor = asNumber(standing.goalsFor)
  const goalsAgainst = asNumber(standing.goalsAgainst)
  const goalDifference = asNumber(standing.goalDifference)
  const topScorer = asRecord(data.topScorer)
  const topScorerName = asString(topScorer.name).trim()
  const topScorerGoals = asNumber(topScorer.goals)
  const hasNext = Object.keys(next).length > 0
  const hasLast = Object.keys(last).length > 0
  const fixtureLine = hasNext
    ? `${soccerOfficialish3(next.homeShort)} vs ${soccerOfficialish3(next.awayShort)}`
    : (teamName || asString(data.teamKey, 'Team'))
  const kickoffParts = hasNext ? soccerKickoffParts(next.utc) : { dayText: '--', timeText: '--:--' }
  const [lastHomeGoals = '--', lastAwayGoals = '--'] = asString(last.score, '-- - --')
    .split('-')
    .map((part) => part.trim() || '--')
  const leagueLine = asString(data.competitionName, '') || asString(cfg.competitionName, '') || 'Premier League'
  const scorerLine = topScorerName && topScorerGoals != null ? `Top scorer: ${topScorerName} (${topScorerGoals})` : 'Top scorer: --'
  const recordLine = won != null && draw != null && lost != null ? `Record: ${won}W ${draw}D ${lost}L` : 'Record: --'
  const goalsLine = goalsFor != null && goalsAgainst != null
    ? goalDifference != null
      ? `Goals: ${goalsFor}-${goalsAgainst}  GD ${goalDifference > 0 ? '+' : ''}${goalDifference}`
      : `Goals: ${goalsFor}-${goalsAgainst}`
    : 'Goals: --'

  return {
    primary: teamName || asString(data.teamKey, 'SOCCER'),
    secondary: next.homeShort && next.awayShort ? `${next.homeShort} - ${next.awayShort}` : asString(data.competitionName, ''),
    tertiary: position != null ? `#${position}` : undefined,
    soccerFixtureLine: fixtureLine,
    soccerKickoffLine: hasNext ? soccerSmallKickoffLine(next.utc) : '-- --:--',
    soccerPositionLine: position != null ? `Position: ${position}` : 'Position: --',
    soccerPointsLine: points != null ? `Points: ${points}` : 'Points: --',
    soccerNextDayLine: kickoffParts.dayText,
    soccerNextTimeLine: kickoffParts.timeText,
    soccerNextHomeLine: hasNext ? soccerOfficialish3(next.homeShort) : '---',
    soccerNextAwayLine: hasNext ? soccerOfficialish3(next.awayShort) : '---',
    soccerLastHomeLine: hasLast ? soccerOfficialish3(last.homeShort) : '---',
    soccerLastAwayLine: hasLast ? soccerOfficialish3(last.awayShort) : '---',
    soccerLastHomeGoalsLine: hasLast ? lastHomeGoals : '--',
    soccerLastAwayGoalsLine: hasLast ? lastAwayGoals : '--',
    soccerLeagueLine: leagueLine,
    soccerTopScorerLine: scorerLine,
    soccerRecordLine: recordLine,
    soccerGoalsLine: goalsLine,
    soccerTableRows: soccerTableRows(data.table),
  }
}

async function stocksDetail(origin: string, deviceId: string, deviceToken: string, id: number, cfg: UnknownRecord): Promise<Detail> {
  const symbol = asString(cfg.symbol).trim().toUpperCase()
  const url = new URL('/api/device/stocks', origin)
  url.searchParams.set('device_id', deviceId)
  url.searchParams.set('id', String(id))
  const data = asRecord(await fetchJson(url.toString(), { headers: { Authorization: `Bearer ${deviceToken}` } }))
  const quote = asRecord(data.quote)
  const resolvedSymbol = asString(data.symbol, symbol).trim().toUpperCase()
  const title = asString(data.name, resolvedSymbol || symbol).trim() || resolvedSymbol || symbol
  const currentPrice = asNumber(quote.price)
  const currentPriceFromQuote = asNumber(quote.price)
  const previousCloseFromQuote = asNumber(quote.previousClose)
  const providerDayChangePct = asNumber(quote.changePercent)
  const dayChangePct =
    currentPriceFromQuote != null && previousCloseFromQuote != null && previousCloseFromQuote > 0
      ? ((currentPriceFromQuote - previousCloseFromQuote) / previousCloseFromQuote) * 100
      : providerDayChangePct
  const purchasePriceRaw = asNumber(data.purchasePrice)
  const purchasePrice = purchasePriceRaw != null && purchasePriceRaw > 0 ? purchasePriceRaw : null
  const returnSincePurchasePct =
    purchasePrice != null && currentPrice != null
      ? ((currentPrice - purchasePrice) / purchasePrice) * 100
      : null
  const rangeChangePct = asNumber(data.rangeChangePercent) ?? selectedSeriesPercent(data.selectedSeries)
  const displayReturnPct = returnSincePurchasePct ?? rangeChangePct
  const price = formatPrice(currentPrice, asString(data.currency, 'USD'))
  const dayPct = formatPercent(dayChangePct)
  const displayReturnPctText = formatPercent(displayReturnPct)
  const seriesRows = selectedSeriesRows(data.selectedSeries)
  const series = seriesRows.map((point) => point.price)

  return {
    module: 'stocks',
    primary: price,
    secondary: resolvedSymbol,
    tertiary: dayPct ?? undefined,
    stockModuleId: id,
    stockTitle: title,
    stockSymbol: resolvedSymbol,
    stockPrice: price,
    stockDayPercent: dayPct ?? '--',
    stockRangePercent: displayReturnPctText ?? '--',
    stockOpen: formatFrameStockPrice(quote.open),
    stockHigh: formatFrameStockPrice(quote.high),
    stockLow: formatFrameStockPrice(quote.low),
    stockPreviousCloseText: formatFrameStockPrice(quote.previousClose),
    stockChange: formatFrameStockSigned(quote.change),
    stockPositionPercent: returnSincePurchasePct != null ? formatFrameStockSigned(returnSincePurchasePct, true) : undefined,
    stockChartRange: normalizeStockRange(data.chartRange || cfg.chartRange),
    stockSeries: series,
    stockSeriesTimestamps: seriesRows.map((point) => point.timestampMs),
    stockPreviousClose: previousCloseFromQuote,
    stockBaselinePrice: asNumber(data.baselinePrice),
    stockPurchasePrice: purchasePrice,
  }
}


function formatReminderMirrorHeader(item: UnknownRecord | undefined, language: string) {
  if (!item) return language === 'no' ? 'Påminnelser' : 'Reminders'

  const locale = language === 'no' ? 'nb-NO' : 'en-US'
  const daysUntil = asNumber(item.days_until)
  const occurrenceYmd = asString(item.occurrence_date).trim()

  if (daysUntil === 0) return language === 'no' ? 'I dag' : 'Today'
  if (daysUntil === 1) return language === 'no' ? 'I morgen' : 'Tomorrow'

  if (occurrenceYmd) {
    const date = new Date(`${occurrenceYmd}T12:00:00`)
    if (!Number.isNaN(date.getTime())) {
      if (daysUntil != null && daysUntil > 1 && daysUntil <= 7) {
        const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date)
        return language === 'no' ? `På ${weekday}` : `On ${weekday}`
      }

      if (daysUntil != null && daysUntil > 7 && daysUntil <= 14) {
        const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date)
        return language === 'no' ? `${weekday} neste uke` : `${weekday} next week`
      }

      return new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: 'short',
      }).format(date).replace('.', '')
    }
  }

  const displayDate = asString(item.display_date).trim()
  return displayDate || (language === 'no' ? 'Påminnelser' : 'Reminders')
}


function formatReminderMirrorDateBadge(item: UnknownRecord | undefined, language: string) {
  if (!item) return undefined

  const daysUntil = asNumber(item.days_until)
  const isOverdue = Boolean(item.is_overdue) || (daysUntil != null && daysUntil < 0)
  if (daysUntil == null) return undefined

  if (isOverdue) {
    const late = Math.abs(daysUntil)
    if (language === 'no') return late === 1 ? '1 dag sen' : `${late} dager sen`
    return late === 1 ? '1 day late' : `${late} days late`
  }

  if (daysUntil === 0) return language === 'no' ? 'I dag' : 'Today'
  if (daysUntil === 1) return language === 'no' ? 'I morgen' : 'Tomorrow'
  return language === 'no' ? `Om ${daysUntil} dager` : `In ${daysUntil} days`
}

function formatReminderMirrorItems(items: UnknownRecord[]) {
  return items
    .map((item) => {
      const title = asString(item.title).trim()
      const displayTime = asString(item.display_time).trim()
      if (!title) return ''
      if (!displayTime) return title
      return `${displayTime} ${title}`
    })
    .filter(Boolean)
}

function reminderMirrorItemKey(item: UnknownRecord) {
  return `${asString(item.reminder_id).trim()}__${asString(item.occurrence_date).trim()}`
}

function formatReminderMirrorNextItems(items: UnknownRecord[]) {
  return items
    .map((item) => ({
      date: asString(item.occurrence_date).slice(0, 10),
      title: formatReminderMirrorItems([item])[0] || '',
    }))
    .filter((item) => item.date && item.title)
}


async function aiAssistantDetail(supabase: SupabaseClient, frameId: string, renderCycleId: string | null, limit = AI_ASSISTANT_FRAME_LIMITS.full): Promise<Detail> {
  const empty = {
    primary: 'UPDATES',
    secondary: 'UPDATES',
    aiAssistantItems: [],
    aiAssistantOverflowCount: 0,
    aiAssistantActiveWatchCount: 0,
    aiAssistantLastCheckedAt: null,
    aiAssistantTopicTitle: aiAssistantDefaultTopicTitle('en'),
    aiAssistantActiveWatchRequests: [],
  }

  try {
    const renderCycleMs = renderCycleId ? new Date(renderCycleId).getTime() : Number.NaN
    const referenceMs = Number.isNaN(renderCycleMs) ? Date.now() : renderCycleMs
    const sinceIso = new Date(referenceMs - 24 * 60 * 60 * 1000).toISOString()
    const { data: memberRows, error: memberError } = await supabase
      .from('device_members')
      .select('user_id')
      .eq('device_id', frameId)
    if (memberError) throw memberError

    const memberUserIds = uniqueNonEmpty(Array.isArray(memberRows) ? memberRows.map((row: { user_id?: unknown }) => row.user_id) : [])
    if (memberUserIds.length <= 0) return empty

    const { data: watchRows, error: watchError } = await supabase
      .from('monitoring_watches')
      .select('id, last_checked_at, status, title, preferred_language, created_at, original_request')
      .in('owner_user_id', memberUserIds)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
    if (watchError) throw watchError

    const activeWatches = Array.isArray(watchRows) ? watchRows : []
    const aiAssistantActiveWatchRequests = activeWatches
      .map((row: { original_request?: unknown }) => asString(row.original_request).trim())
      .filter(Boolean)
      .slice(0, 5)
    const activeTopicTitle = activeWatches.length === 1 ? simplifyAiAssistantTopicTitle(activeWatches[0]?.title, 'en') || aiAssistantDefaultTopicTitle('en') : aiAssistantDefaultTopicTitle('en')

    const lastCheckedAt = activeWatches
      .map((row: { last_checked_at?: unknown }) => asString(row.last_checked_at).trim())
      .filter(Boolean)
      .sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime())[0] || null

    const { data, error } = await supabase
      .from('monitoring_updates')
      .select('id, headline, summary, created_at, dismissed_from_frame, is_read, monitoring_watches!inner(owner_user_id, title, preferred_language)')
      .in('monitoring_watches.owner_user_id', memberUserIds)
      .eq('is_read', false)
      .eq('dismissed_from_frame', false)
      .gt('created_at', sinceIso)
      .lte('created_at', new Date(referenceMs).toISOString())
      .order('created_at', { ascending: false })
      .limit(limit + 25)
    if (error) throw error

    const updateCandidates = Array.isArray(data) ? data : []
    const selected = selectAiAssistantFrameItems(updateCandidates as AiAssistantFrameUpdate[], { memberUserIds, limit, renderCycleId })
    console.info('[mirror-snapshot:ai-assistant-snapshot]', {
      frameId,
      frameMemberCount: memberUserIds.length,
      activeAccessibleWatchCount: activeWatches.length,
      unreadUpdateCandidateCount: updateCandidates.length,
      selectedCount: selected.items.length,
    })
    return {
      primary: 'UPDATES',
      secondary: 'UPDATES',
      aiAssistantItems: selected.items,
      aiAssistantOverflowCount: selected.overflowCount,
      aiAssistantActiveWatchCount: activeWatches.length,
      aiAssistantLastCheckedAt: lastCheckedAt,
      aiAssistantTopicTitle: selected.items[0]?.topicTitle || activeTopicTitle,
      aiAssistantActiveWatchRequests,
    }
  } catch (e: unknown) {
    console.error('[mirror-snapshot:ai-assistant-failed]', { frameId, reason: e instanceof Error ? e.message : String(e || 'Unknown error') })
    return empty
  }
}

async function remindersDetail(origin: string, deviceId: string, deviceToken: string, language: string): Promise<Detail> {
  const url = new URL('/api/device/reminders', origin)
  url.searchParams.set('device_id', deviceId)
  url.searchParams.set('limit', '20')
  url.searchParams.set('skip_sync', '1')
  const data = asRecord(await fetchJson(url.toString(), { headers: { Authorization: `Bearer ${deviceToken}` } }))
  const items = Array.isArray(data.items) ? data.items.map(asRecord) : []
  const first = items[0]
  const firstOccurrenceDate = first ? asString(first.occurrence_date).trim() : ''
  const primaryBucketItems = firstOccurrenceDate
    ? items.filter((item) => asString(item.occurrence_date).trim() === firstOccurrenceDate)
    : items
  const firstDaysUntil = asNumber(first?.days_until)
  const isTodayOrTomorrow = firstDaysUntil === 0 || firstDaysUntil === 1
  const visibleItems = primaryBucketItems.slice(0, 3)
  const visibleMediumItems = primaryBucketItems.slice(0, isTodayOrTomorrow ? 4 : 3)
  const reminderItems = formatReminderMirrorItems(visibleItems)
  const reminderMediumItems = formatReminderMirrorItems(visibleMediumItems)
  const reminderCalendarDates = items.map((item) => asString(item.occurrence_date).slice(0, 10)).filter(Boolean)
  const shownPrimaryKeys = new Set(visibleMediumItems.map(reminderMirrorItemKey))
  const reminderNextItems = formatReminderMirrorNextItems(
    items.filter((item) => !shownPrimaryKeys.has(reminderMirrorItemKey(item))).slice(0, 5)
  )
  return {
    primary: first ? asString(first.title, language === 'no' ? 'Påminnelse' : 'Reminder') : (language === 'no' ? 'Ingen' : 'None'),
    secondary: language === 'no' ? 'Påminnelser' : 'Reminders',
    tertiary: first ? asString(first.display_date || first.display_time, '') : undefined,
    reminderItems,
    reminderMediumItems,
    reminderCalendarDates,
    reminderNextItems,
    reminderHeader: formatReminderMirrorHeader(first, language),
    reminderOverflowCount: Math.max(0, primaryBucketItems.length - visibleItems.length),
    reminderMediumOverflowCount: Math.max(0, primaryBucketItems.length - visibleMediumItems.length),
    reminderDateBadge: formatReminderMirrorDateBadge(first, language),
    reminderTomorrowCount: firstDaysUntil === 0
      ? items.filter((item) => asNumber(item.days_until) === 1).length
      : 0,
  }
}

async function groceriesDetail(supabase: SupabaseClient, storageDeviceIds: string[], ownerId: string, language: string): Promise<Detail> {

  const todayIso = isoDateOnly(new Date())

  const sinceCheckedIso = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const sinceDinnerIso = isoDateOnly(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000))

  const [itemsResult, dinnerResult, historyResult, checkedResult, recipesResult, storedSuggestionsResult] = await Promise.all([
    supabase
      .from('grocery_items')
      .select('name, quantity, updated_at')
      .in('device_id', storageDeviceIds)
      .eq('is_checked', false)
      .order('updated_at', { ascending: false })
      .limit(40),
    supabase
      .from('dinner_plan_days')
      .select('date, title, note')
      .in('device_id', storageDeviceIds)
      .gte('date', sinceDinnerIso)
      .order('date', { ascending: false })
      .limit(80),
    supabase
      .from('grocery_item_history')
      .select('name, usage_count, last_used_at, last_purchased_at, average_days_available')
      .in('device_id', storageDeviceIds)
      .gte('last_used_at', new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString())
      .order('usage_count', { ascending: false })
      .order('last_used_at', { ascending: false })
      .limit(80),
    supabase
      .from('grocery_items')
      .select('name, checked_at, updated_at')
      .in('device_id', storageDeviceIds)
      .eq('is_checked', true)
      .gte('checked_at', sinceCheckedIso)
      .order('checked_at', { ascending: false })
      .limit(80),
    loadMirrorRecipeRows(supabase, ownerId),
    loadMirrorStoredRecipeSuggestions(supabase, ownerId),
  ])

  if (itemsResult.error) throw new Error(itemsResult.error.message)
  if (dinnerResult.error) throw new Error(dinnerResult.error.message)

  const items = Array.isArray(itemsResult.data) ? itemsResult.data.map(asRecord) : []
  const dinnerRows = Array.isArray(dinnerResult.data) ? dinnerResult.data.map(asRecord) : []
  const historyRows = !historyResult.error && Array.isArray(historyResult.data) ? historyResult.data.map(asRecord) : []
  const checkedRows = !checkedResult.error && Array.isArray(checkedResult.data) ? checkedResult.data.map(asRecord) : []
  const dinnerTodayTitle = asString(dinnerRows.find((row) => asString(row.date).slice(0, 10) === todayIso)?.title).trim()
  const groceryDinnerPlan = dinnerRows
    .map((row) => ({
      date: asString(row.date).slice(0, 10),
      title: compactGroceryInsightName(row.title, 48),
    }))
    .filter((row) => row.date > todayIso && row.title)
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
    .slice(0, 7)
  const groceryItems = items
    .map((item) => {
      const name = asString(item.name).trim()
      const quantity = asNumber(item.quantity) ?? 1
      return quantity > 1 ? `${quantity}x ${name}` : name
    })
    .filter(Boolean)
  const preview = items
    .slice(0, 2)
    .map((item) => {
      const name = asString(item.name).trim()
      const quantity = asNumber(item.quantity) ?? 1
      return quantity > 1 ? `${name} ×${quantity}` : name
    })
    .filter(Boolean)
    .join(', ')
  const activeNames = items.map((item) => asString(item.name).trim()).filter(Boolean)
  const groceryRunningLow = buildMirrorRunningLowInsights({ language, activeNames, historyRows, checkedRows })
  const recipeRows = Array.isArray(recipesResult) ? recipesResult : []
  const storedSuggestions = Array.isArray(storedSuggestionsResult) ? storedSuggestionsResult : []
  const groceryMealIdeas = buildMirrorMealIdeas({
    recipeRows,
    storedSuggestions,
    dinnerPlanTitles: [dinnerTodayTitle, ...groceryDinnerPlan.map((day) => day.title)].filter(Boolean),
    historyRows,
    checkedRows,
  })

  return {
    primary: items.length ? `${items.length}` : '0',
    secondary: language === 'no' ? 'varer' : 'items',
    tertiary: preview,
    groceryItems,
    dinnerTodayTitle: dinnerTodayTitle || undefined,
    groceryDinnerPlan,
    groceryRunningLow,
    groceryMealIdeas,
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const deviceId = url.searchParams.get('device_id')?.trim()
    if (!deviceId) return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

    if (!(await deviceHasOwnerAccessLink(supabase, deviceId))) {
      return NextResponse.json(pairRequiredPayload(deviceId))
    }

    const bearer = getBearerToken(req)
    if (!bearer) return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(bearer)
    if (authError || !authData.user) return NextResponse.json({ error: 'Invalid or expired user token' }, { status: 401 })

    const { data: member, error: memberError } = await supabase
      .from('device_members')
      .select('device_id')
      .eq('device_id', deviceId)
      .eq('user_id', authData.user.id)
      .maybeSingle()
    if (memberError) return NextResponse.json({ error: memberError.message }, { status: 500 })
    if (!member) return NextResponse.json({ error: 'User is not a member of this device' }, { status: 403 })

    const [{ data: deviceRow, error: deviceError }, { data: statusRow, error: statusError }] = await Promise.all([
      supabase.from('devices').select('device_token').eq('device_id', deviceId).maybeSingle(),
      supabase
        .from('device_status')
        .select('current_version, battery_percent, battery_voltage, is_charging, is_usb_present, last_seen_at, last_render_at, last_refresh_at')
        .eq('device_id', deviceId)
        .maybeSingle(),
    ])
    if (deviceError) return NextResponse.json({ error: deviceError.message }, { status: 500 })
    if (!deviceRow) return NextResponse.json({ error: 'Device record not found' }, { status: 404 })
    if (statusError) return NextResponse.json({ error: statusError.message }, { status: 500 })

    const mirrorScope = await resolveMirrorDeviceScope(supabase, deviceId, authData.user.id)

    const origin = appOrigin(req)
    const frameConfig = asRecord(await buildFrameConfigPayload(supabase, deviceId))
    if (frameConfig.pair_required === true || frameConfig.unpaired === true) {
      return NextResponse.json(frameConfig)
    }

    const settings = asRecord(frameConfig.settings_json)
    const modules = asRecord(settings.modules)
    const cells = Array.isArray(settings.cells) ? settings.cells.map(asRecord) : []
    const language = asString(settings.language, 'en') === 'no' ? 'no' : 'en'
    const deviceToken = asString(deviceRow?.device_token)
    const detailsBySlot: Record<string, Detail> = {}

    await Promise.all(cells.map(async (cell) => {
      const slot = Number(cell.slot)
      if (!Number.isFinite(slot)) return
      const parsed = splitStoredModule(cell.module)
      if (!parsed) return
      const cfg = moduleConfig(modules, parsed.base, parsed.id)

      try {
        if (parsed.base === 'date') detailsBySlot[String(slot)] = { primary: formatDate(language), secondary: language === 'no' ? 'Dato' : 'Date' }
        else if (parsed.base === 'weather') detailsBySlot[String(slot)] = await weatherDetail(cfg, language, asString(frameConfig.updated_at) || null)
        else if (parsed.base === 'surf') detailsBySlot[String(slot)] = await surfDetail(origin, cfg, bearer, language, asRecord(modules.surf_settings), asString(frameConfig.updated_at) || null)
        else if (parsed.base === 'soccer') detailsBySlot[String(slot)] = await soccerDetail(origin, cfg, language)
        else if (parsed.base === 'stocks' && deviceToken) detailsBySlot[String(slot)] = await stocksDetail(origin, deviceId, deviceToken, parsed.id, cfg)
        else if (parsed.base === 'reminders' && deviceToken) detailsBySlot[String(slot)] = await remindersDetail(origin, deviceId, deviceToken, language)
        else if (parsed.base === 'assistant') detailsBySlot[String(slot)] = await aiAssistantDetail(supabase, deviceId, statusRow?.last_render_at ?? statusRow?.last_refresh_at ?? null)
        else if (parsed.base === 'groceries') detailsBySlot[String(slot)] = await groceriesDetail(supabase, mirrorScope.storageDeviceIds, mirrorScope.ownerId, language)
        else if (parsed.base === 'countdown') detailsBySlot[String(slot)] = await countdownDetail(supabase, mirrorScope.storageDeviceIds, language)
      } catch (e: unknown) {
        console.error('[mirror-snapshot:slot-detail-failed]', { slot, module: parsed.base, id: parsed.id, reason: e instanceof Error ? e.message : String(e || 'Unknown error') })
        detailsBySlot[String(slot)] = {
          primary: '--',
          secondary: parsed.base,
          tertiary: language === 'no' ? 'Midlertidig utilgjengelig' : 'Temporarily unavailable',
        }
      }
    }))

    return NextResponse.json({
      device_id: deviceId,
      updated_at: frameConfig.updated_at ?? null,
      settings_json: settings,
      detailsBySlot,
      status: {
        current_version: statusRow?.current_version ?? null,
        battery_percent: statusRow?.battery_percent ?? null,
        battery_voltage: statusRow?.battery_voltage ?? null,
        is_charging: statusRow?.is_charging ?? null,
        is_usb_present: statusRow?.is_usb_present ?? null,
        last_seen_at: statusRow?.last_seen_at ?? statusRow?.last_refresh_at ?? null,
        last_render_at: statusRow?.last_render_at ?? statusRow?.last_refresh_at ?? null,
      },
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 })
  }
}
