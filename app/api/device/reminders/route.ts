// app/api/device/reminders/route.ts

import { after, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { syncSpondIfStaleForUsers } from '@/app/lib/integrations/spond/server'
import { syncTeamsIfStaleForUser } from '@/app/lib/integrations/teams/server'
import { buildLocalEventFrameItem, buildSpondReminderItems, buildTeamsMeetingItems, buildWasteCollectionItems, compareReminderItems, selectReminderDisplayGroups, type DeviceReminderItem, type IntegrationItemRow, type LocalEventSkipRow } from '@/app/lib/device/remindersFeed'
import { optimizeFrameContent, PHYSICAL_AI_TIMEOUT_MS, supabaseTitleCache, type DisplayCapacityProfile } from '@/app/lib/frameContentOptimizer'
import { norwegianStarterReminderDate } from '@/app/lib/onboardingDefaults'

export const runtime = 'nodejs'

type ReminderRepeatKey =
  | 'none'
  | 'daily'
  | 'weekly'
  | '2weeks'
  | '4weeks'
  | 'monthly'
  | 'halfyear'
  | 'yearly'
  | '2years'
  | 'custom'

type ReminderRow = {
  id: string
  device_id: string
  title: string | null
  due_date: string | null
  due_time: string | null
  repeat_type: ReminderRepeatKey | null
  custom_repeat_days: number | null
  is_done: boolean | null
  starter_key?: string | null
}

type PhysicalDeviceReminderItem = {
  title: string
  occurrence_date: string
  display_date: string
  days_until: number
  is_overdue: boolean
  display_time: string | null
  profile_titles?: Partial<Record<DisplayCapacityProfile, string>>
}

const DEFAULT_TZ = 'Europe/Oslo'
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 10

const DEFAULT_HORIZON_DAYS = 120
const MAX_HORIZON_DAYS = 366

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function isReminderRepeatKey(v: unknown): v is ReminderRepeatKey {
  return (
    v === 'none' ||
    v === 'daily' ||
    v === 'weekly' ||
    v === '2weeks' ||
    v === '4weeks' ||
    v === 'monthly' ||
    v === 'halfyear' ||
    v === 'yearly' ||
    v === '2years' ||
    v === 'custom'
  )
}

function parseYmdToLocalDate(ymd: string) {
  const [y, m, d] = String(ymd || '').split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  return new Date(y, m - 1, d)
}

function toLocalYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function addDaysLocal(d: Date, days: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

function addMonthsLocal(d: Date, months: number) {
  const x = new Date(d)
  const day = x.getDate()
  x.setDate(1)
  x.setMonth(x.getMonth() + months)
  const daysInTargetMonth = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()
  x.setDate(Math.min(day, daysInTargetMonth))
  return x
}

function addYearsLocal(d: Date, years: number) {
  const x = new Date(d)
  const month = x.getMonth()
  const day = x.getDate()
  x.setDate(1)
  x.setFullYear(x.getFullYear() + years)
  const daysInTargetMonth = new Date(x.getFullYear(), month + 1, 0).getDate()
  x.setMonth(month)
  x.setDate(Math.min(day, daysInTargetMonth))
  return x
}

function nextReminderOccurrenceDate(
  base: Date,
  repeat: ReminderRepeatKey,
  customRepeatDays?: number | null
): Date | null {
  if (repeat === 'none') return null
  if (repeat === 'daily') return addDaysLocal(base, 1)
  if (repeat === 'weekly') return addDaysLocal(base, 7)
  if (repeat === '2weeks') return addDaysLocal(base, 14)
  if (repeat === '4weeks') return addDaysLocal(base, 28)
  if (repeat === 'monthly') return addMonthsLocal(base, 1)
  if (repeat === 'halfyear') return addMonthsLocal(base, 6)
  if (repeat === 'yearly') return addYearsLocal(base, 1)
  if (repeat === '2years') return addYearsLocal(base, 2)

  if (repeat === 'custom') {
    const n = Number(customRepeatDays)
    if (Number.isFinite(n) && n > 0) return addDaysLocal(base, n)
    return null
  }

  return null
}

function getDatePartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(date)
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const day = Number(parts.find((p) => p.type === 'day')?.value)

  return { year, month, day }
}

function getClockPartsInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

  const parts = formatter.formatToParts(date)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value)

  return { hour, minute }
}

function getTodayYmdInTimeZone(timeZone: string, now = new Date()) {
  const { year, month, day } = getDatePartsInTimeZone(now, timeZone)
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function getNowHmInTimeZone(timeZone: string, now = new Date()) {
  const { hour, minute } = getClockPartsInTimeZone(now, timeZone)
  return `${pad2(hour)}:${pad2(minute)}`
}

function normalizeReminderTime(raw: string | null | undefined) {
  const value = String(raw ?? '').trim()
  if (!value) return null

  const m = value.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/)
  if (!m) return null

  const hh = Number(m[1])
  const mm = Number(m[2])

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null

  return `${pad2(hh)}:${pad2(mm)}`
}

function formatDisplayDate(occurrenceYmd: string, todayYmd: string) {
  if (occurrenceYmd === todayYmd) return 'Today'

  const today = parseYmdToLocalDate(todayYmd)
  const occurrence = parseYmdToLocalDate(occurrenceYmd)
  if (!today || !occurrence) return occurrenceYmd

  const tomorrow = addDaysLocal(today, 1)
  if (toLocalYmd(tomorrow) === occurrenceYmd) return 'Tomorrow'

  return `${pad2(occurrence.getDate())}.${pad2(occurrence.getMonth() + 1)}.${occurrence.getFullYear()}`
}

function diffDaysFromYmd(fromYmd: string, toYmd: string) {
  const from = parseYmdToLocalDate(fromYmd)
  const to = parseYmdToLocalDate(toYmd)
  if (!from || !to) return 0

  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())

  return Math.round((toUtc - fromUtc) / 86400000)
}


async function sharedDeviceIdsForFrame(supabase: SupabaseClient, deviceId: string) {
  for (const select of ['id, device_id, owner_id', 'id, device_id, user_id']) {
    const { data: device, error: deviceError } = await supabase
      .from('devices')
      .select(select)
      .eq('device_id', deviceId)
      .maybeSingle()

    if (deviceError) continue

    const row = (device ?? {}) as { owner_id?: unknown; user_id?: unknown }
    const ownerId = String(row.owner_id || row.user_id || '').trim()
    if (!ownerId) break

    for (const column of ['owner_id', 'user_id']) {
      const { data: ownedDevices, error: ownedError } = await supabase
        .from('devices')
        .select('device_id')
        .eq(column, ownerId)

      if (!ownedError) {
        const ownedDeviceIds = (Array.isArray(ownedDevices) ? ownedDevices : [])
          .map((owned: { device_id?: unknown }) => String(owned.device_id || '').trim())
          .filter(Boolean)
        return Array.from(new Set([deviceId, ...ownedDeviceIds]))
      }
    }
  }

  const { data: members, error: membersError } = await supabase
    .from('device_members')
    .select('user_id')
    .eq('device_id', deviceId)

  if (membersError) throw membersError

  const userIds = Array.from(new Set((Array.isArray(members) ? members : [])
    .map((row: { user_id?: unknown }) => String(row.user_id || '').trim())
    .filter(Boolean)))

  if (userIds.length === 0) return [deviceId]

  const { data: shared, error: sharedError } = await supabase
    .from('device_members')
    .select('device_id')
    .in('user_id', userIds)

  if (sharedError) throw sharedError

  return Array.from(new Set([deviceId, ...(Array.isArray(shared) ? shared : [])
    .map((row: { device_id?: unknown }) => String(row.device_id || '').trim())
    .filter(Boolean)]))
}

function normalizeLimit(raw: string | null) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.floor(n))
}

function normalizeIncludeOverdue(raw: string | null) {
  if (raw == null) return false
  const v = raw.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  return false
}

function normalizeSkipSync(raw: string | null) {
  // Physical frames are cache-only by default. Upstream refresh is opt-in for app/admin callers.
  if (raw == null) return true
  const v = raw.trim().toLowerCase()
  if (v === '0' || v === 'false' || v === 'no') return false
  return true
}

function normalizeTimeZone(raw: string | null) {
  const tz = String(raw || '').trim()
  if (!tz) return DEFAULT_TZ

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date())
    return tz
  } catch {
    return DEFAULT_TZ
  }
}

function normalizeHorizonDays(raw: string | null) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_HORIZON_DAYS
  return Math.min(MAX_HORIZON_DAYS, Math.floor(n))
}

function logOptionalReminderProviderFailure(provider: string, error: unknown) {
  console.warn(`[device/reminders] Optional reminder provider ${provider} failed`, error)
}

function toPhysicalDeviceReminderItem(item: DeviceReminderItem): PhysicalDeviceReminderItem {
  return {
    title: item.title,
    occurrence_date: item.occurrence_date,
    display_date: item.display_date,
    days_until: item.days_until,
    is_overdue: item.is_overdue,
    display_time: normalizeReminderTime(item.display_time),
  }
}

function isTimedOccurrenceAlreadyPassed(
  occurrenceYmd: string,
  dueTime: string | null,
  todayYmd: string,
  nowHm: string
) {
  if (!dueTime) return false
  if (occurrenceYmd !== todayYmd) return false
  return dueTime < nowHm
}

function buildOccurrencesForRow(
  row: ReminderRow,
  todayYmd: string,
  nowHm: string,
  horizonEndYmd: string,
  includeOverdue: boolean
): DeviceReminderItem[] {
  const title = String(row.title ?? '').trim()
  const dueDate = String(row.due_date ?? '').trim()
  const dueTime = normalizeReminderTime(row.due_time)
  const repeat: ReminderRepeatKey = isReminderRepeatKey(row.repeat_type) ? row.repeat_type : 'none'
  const customRepeatDays = Number(row.custom_repeat_days)

  if (!title || !dueDate) return []

  const base = parseYmdToLocalDate(dueDate)
  if (!base) return []

  const items: DeviceReminderItem[] = []

  const addOccurrence = (occurrenceYmd: string) => {
    if (isTimedOccurrenceAlreadyPassed(occurrenceYmd, dueTime, todayYmd, nowHm)) {
      return
    }

    const days_until = diffDaysFromYmd(todayYmd, occurrenceYmd)

    if (!includeOverdue && days_until < 0) return

    items.push({
      reminder_id: String(row.id),
      title,
      occurrence_date: occurrenceYmd,
      display_date: formatDisplayDate(occurrenceYmd, todayYmd),
      days_until,
      is_overdue: days_until < 0,
      repeat,
      due_time: dueTime,
      display_time: dueTime,
    })
  }

  if (row.starter_key) {
    const startYear = Number(todayYmd.slice(0, 4))
    const endYear = Number(horizonEndYmd.slice(0, 4))
    let derived = false
    for (let year = startYear; year <= endYear; year += 1) {
      const occurrence = norwegianStarterReminderDate(row.starter_key, year)
      if (!occurrence) continue
      derived = true
      if (occurrence <= horizonEndYmd) addOccurrence(occurrence)
    }
    if (derived) return items
  }

  if (repeat === 'none') {
    if (row.is_done) return []
    if (dueDate > horizonEndYmd) return []
    addOccurrence(dueDate)
    return items
  }

  let current = new Date(base.getFullYear(), base.getMonth(), base.getDate())
  let guard = 0

  while (guard < 1000) {
    const currentYmd = toLocalYmd(current)

    if (currentYmd > horizonEndYmd) break

    addOccurrence(currentYmd)

    const next = nextReminderOccurrenceDate(
      current,
      repeat,
      Number.isFinite(customRepeatDays) && customRepeatDays > 0 ? customRepeatDays : null
    )

    if (!next) break

    const nextYmd = toLocalYmd(next)
    if (nextYmd <= currentYmd) break

    current = next
    guard += 1
  }

  return items
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const device_id = url.searchParams.get('device_id')
    const limit = normalizeLimit(url.searchParams.get('limit'))
    const includeOverdue = normalizeIncludeOverdue(url.searchParams.get('include_overdue'))
    const timeZone = normalizeTimeZone(url.searchParams.get('tz'))
    const horizonDays = normalizeHorizonDays(url.searchParams.get('horizon_days'))
    const skipSync = normalizeSkipSync(url.searchParams.get('skip_sync'))

    if (!device_id) {
      return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const sharedDeviceIds = await sharedDeviceIdsForFrame(supabase, device_id)

    // These reads share only sharedDeviceIds, so overlap their network latency.
    const [remindersResult, completionsResult, membersResult, deviceSettingsResult] = await Promise.all([supabase
      .from('reminders')
      .select('id, device_id, title, due_date, due_time, repeat_type, custom_repeat_days, is_done, starter_key')
      .in('device_id', sharedDeviceIds)
      .order('due_date', { ascending: true })
      .order('due_time', { ascending: true, nullsFirst: false })
      .order('title', { ascending: true }), supabase
      .from('reminder_completions')
      .select('reminder_id, occurrence_date')
      .in('device_id', sharedDeviceIds), supabase
      .from('device_members')
      .select('user_id')
      .eq('device_id', device_id), supabase
      .from('device_settings')
      .select('settings_json')
      .eq('device_id', device_id)
      .maybeSingle()])
    const { data, error } = remindersResult
    const { data: completionsData, error: completionsError } = completionsResult
    const { data: membersData, error: membersError } = membersResult
    const { data: deviceSettingsData, error: deviceSettingsError } = deviceSettingsResult
    if (deviceSettingsError) logOptionalReminderProviderFailure('device_settings', deviceSettingsError)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (completionsError) {
      return NextResponse.json({ error: completionsError.message }, { status: 500 })
    }

    const now = new Date()
    const todayYmd = getTodayYmdInTimeZone(timeZone, now)
    const nowHm = getNowHmInTimeZone(timeZone, now)

    const today = parseYmdToLocalDate(todayYmd)
    if (!today) {
      return NextResponse.json({ error: 'Failed to compute local today date' }, { status: 500 })
    }

    const horizonEndYmd = toLocalYmd(addDaysLocal(today, horizonDays))
    const rows = Array.isArray(data) ? (data as ReminderRow[]) : []

    const completedKeySet = new Set(
      (Array.isArray(completionsData) ? completionsData : []).map(
        (x: { reminder_id?: unknown; occurrence_date?: unknown }) => `${String(x.reminder_id)}__${String(x.occurrence_date)}`
      )
    )

    const manualItems: DeviceReminderItem[] = rows
      .flatMap((row) => buildOccurrencesForRow(row, todayYmd, nowHm, horizonEndYmd, includeOverdue))
      .filter((item) => !completedKeySet.has(`${item.reminder_id}__${item.occurrence_date}`))
      .map((item) => ({ ...item, source: 'remind' as const }))

    if (membersError) {
      logOptionalReminderProviderFailure('device_members', membersError)
    }

    const memberUserIds = Array.from(new Set(
      (!membersError && Array.isArray(membersData) ? membersData : [])
        .map((row: { user_id?: unknown }) => String(row.user_id || '').trim())
        .filter(Boolean)
    ))

    let spondItems: DeviceReminderItem[] = []
    let teamsItems: DeviceReminderItem[] = []
    let wasteItems: DeviceReminderItem[] = []
    let localEventItems: DeviceReminderItem[] = []
    const configuredModules = (deviceSettingsData?.settings_json as any)?.modules
    const explicitIntegrationSelection = configuredModules?.integration_selection_explicit === true
    const selectedIntegrations = configuredModules?.integrations || {}
    const providerEnabled = (provider: string) => !deviceSettingsError && (!explicitIntegrationSelection || selectedIntegrations?.[provider]?.enabled === true)
    if (memberUserIds.length > 0) {
      if (!skipSync) {
        const syncResults = await Promise.allSettled([
          providerEnabled('spond') ? syncSpondIfStaleForUsers(memberUserIds) : Promise.resolve(),
          Promise.allSettled((providerEnabled('teams') ? memberUserIds : []).map((userId) => syncTeamsIfStaleForUser(userId, { horizonDays }))),
        ])
        syncResults.forEach((result) => {
          if (result.status === 'rejected') logOptionalReminderProviderFailure('integration-sync', result.reason)
        })
      }

      await Promise.all([(async () => { try {
        if (!providerEnabled('spond')) return

        const { data: integrationItemsData, error: integrationItemsError } = await supabase
          .from('integration_items')
          .select('id, user_id, provider, external_id, title, body, starts_at, due_at, priority, raw')
          .eq('provider', 'spond')
          .in('user_id', memberUserIds)
          .order('priority', { ascending: true })
          .order('starts_at', { ascending: true, nullsFirst: false })

        if (integrationItemsError) throw integrationItemsError

        spondItems = buildSpondReminderItems(
          Array.isArray(integrationItemsData) ? (integrationItemsData as IntegrationItemRow[]) : [],
          todayYmd,
          horizonEndYmd,
          timeZone,
          includeOverdue
        )
      } catch (error) {
        logOptionalReminderProviderFailure('spond', error)
      } })(), (async () => { try {
        if (!providerEnabled('teams')) return

        const { data: teamsIntegrationItemsData, error: teamsIntegrationItemsError } = await supabase
          .from('integration_items')
          .select('id, user_id, provider, external_id, title, body, starts_at, due_at, priority, raw')
          .eq('provider', 'teams')
          .in('user_id', memberUserIds)
          .order('starts_at', { ascending: true, nullsFirst: false })

        if (teamsIntegrationItemsError) throw teamsIntegrationItemsError

        teamsItems = buildTeamsMeetingItems(
          Array.isArray(teamsIntegrationItemsData) ? (teamsIntegrationItemsData as IntegrationItemRow[]) : [],
          todayYmd,
          horizonEndYmd,
          timeZone
        )
      } catch (error) {
        logOptionalReminderProviderFailure('teams', error)
      } })(), (async () => { try {
        if (!providerEnabled('waste')) return

        const { data: wasteIntegrationItemsData, error: wasteIntegrationItemsError } = await supabase
          .from('integration_items')
          .select('id, user_id, provider, external_id, title, body, starts_at, due_at, priority, raw')
          .eq('provider', 'waste')
          .in('user_id', memberUserIds)
          .order('starts_at', { ascending: true, nullsFirst: false })

        if (wasteIntegrationItemsError) throw wasteIntegrationItemsError

        wasteItems = buildWasteCollectionItems(
          Array.isArray(wasteIntegrationItemsData) ? (wasteIntegrationItemsData as IntegrationItemRow[]) : [],
          todayYmd,
          horizonEndYmd,
          timeZone,
          includeOverdue
        )
      } catch (error) {
        logOptionalReminderProviderFailure('waste', error)
      } })(), (async () => { try {
        if (!providerEnabled('local-events')) return

        const { data: localEventsData, error: localEventsError } = await supabase
          .from('integration_items')
          .select('id, user_id, provider, external_id, title, body, starts_at, due_at, priority, raw')
          .eq('provider', 'edge-of-norway')
          .eq('device_id', device_id)
          .order('starts_at', { ascending: true, nullsFirst: false })

        if (localEventsError) throw localEventsError

        const { data: localEventsIntegrationData } = await supabase
          .from('user_integrations')
          .select('encrypted_credentials')
          .eq('device_id', device_id)
          .eq('provider', 'edge-of-norway')
          .maybeSingle()
        const selectedLocalEventArea = String(((localEventsIntegrationData?.encrypted_credentials as any)?.areaPreference?.primaryPlaceId) || '').trim()
        const localEventRows = (Array.isArray(localEventsData) ? (localEventsData as IntegrationItemRow[]) : [])
          .filter((row) => !selectedLocalEventArea || (Array.isArray((row.raw as any)?.areaKeys) ? (row.raw as any).areaKeys.includes(selectedLocalEventArea) : String((row.raw as any)?.areaKey || (row.raw as any)?.primaryPlaceId || '').trim() === selectedLocalEventArea))
        const localEventExternalIds = localEventRows.map((row) => String(row.external_id || '').trim()).filter(Boolean)
        let localEventSkipRows: LocalEventSkipRow[] = []

        if (localEventExternalIds.length > 0) {
          const { data: skipsData, error: skipsError } = await supabase
            .from('local_event_frame_skips')
            .select('device_id, provider, external_event_id, skipped')
            .eq('device_id', device_id)
            .eq('provider', 'edge-of-norway')
            .in('external_event_id', Array.from(new Set(localEventExternalIds)))

          if (skipsError) throw skipsError
          localEventSkipRows = Array.isArray(skipsData) ? (skipsData as LocalEventSkipRow[]) : []
        }

        localEventItems = buildLocalEventFrameItem(localEventRows, localEventSkipRows, todayYmd, now)
      } catch (error) {
        logOptionalReminderProviderFailure('local-events', error)
      } })()])
    }

    const integrationItems = [
      ...spondItems,
      ...teamsItems,
      ...wasteItems,
      ...localEventItems,
    ].sort(compareReminderItems)

    const seenKeys = new Set<string>()
    const allItems = [...manualItems, ...integrationItems]
      .sort(compareReminderItems)
      .filter((item) => {
        const key = item.external_id ? `${item.source || 'remind'}:${item.external_id}` : item.reminder_id
        if (seenKeys.has(key)) return false
        seenKeys.add(key)
        return true
      })
    const selectedItems = selectReminderDisplayGroups(allItems, limit)
    const requestedProfiles = String(url.searchParams.get('display_profiles') || url.searchParams.get('display_profile') || 'standard')
      .split(',').map(value => value.trim()).filter((value): value is DisplayCapacityProfile => value === 'compact' || value === 'standard' || value === 'spacious')
    const displayProfiles = [...new Set<DisplayCapacityProfile>(requestedProfiles.length ? requestedProfiles : ['standard'])]
    const optimizerItems = selectedItems.map((item, index) => ({
        id: String(index),
        title: item.title,
        source: item.source,
        displayDate: item.display_date,
        displayTime: item.display_time,
      }))
    const persistentCache = supabaseTitleCache(supabase)
    const optimizedByProfile = new Map(await Promise.all(displayProfiles.map(async displayProfile => {
      const titles = await optimizeFrameContent(optimizerItems, {
        displayProfile, persistentCache, fastBudgetMs: PHYSICAL_AI_TIMEOUT_MS, aiTimeoutMs: 5000,
        defer: work => after(async () => { await work }),
      })
      return [displayProfile, new Map(titles.map(item => [Number(item.id), item.title]))] as const
    })))
    const primaryTitles = optimizedByProfile.get(displayProfiles[0])!
    const physicalItems = selectedItems.map((item, index) => toPhysicalDeviceReminderItem({
      ...item,
      title: primaryTitles.get(index) || item.title,
    })).map((item, index) => displayProfiles.length > 1 ? {
      ...item,
      profile_titles: Object.fromEntries(displayProfiles.map(profile => [profile, optimizedByProfile.get(profile)?.get(index) || item.title])),
    } : item)
    const compactJsonByteSize = Buffer.byteLength(JSON.stringify({ items: physicalItems }), 'utf8')

    console.info('[device/reminders] compact response', {
      device_id,
      selected_item_count: physicalItems.length,
      compact_json_byte_size: compactJsonByteSize,
      includes_local_events: selectedItems.some((item) => item.source === 'local-events'),
      ai_optimized: Boolean(process.env.OPENAI_API_KEY) && String(process.env.FRAME_AI_OPTIMIZATION_ENABLED || '').toLowerCase() !== 'false',
    })

    return NextResponse.json({ items: physicalItems })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load reminders' }, { status: 500 })
  }
}
