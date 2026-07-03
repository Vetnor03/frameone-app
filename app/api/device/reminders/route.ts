// app/api/device/reminders/route.ts

import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { syncSpondIfStaleForUsers } from '@/app/lib/integrations/spond/server'
import { syncTeamsFromStoredConnection } from '@/app/lib/integrations/teams/server'
import { buildSpondReminderItems, buildTeamsMeetingItems, buildWasteCollectionItems, compareReminderItems, selectReminderDisplayGroups, type DeviceReminderItem, type IntegrationItemRow } from '@/app/lib/device/remindersFeed'

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
}

const DEFAULT_TZ = 'Europe/Oslo'
const DEFAULT_LIMIT = 12
const MAX_LIMIT = 12

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

function getTodayYmdInTimeZone(timeZone: string) {
  const now = new Date()
  const { year, month, day } = getDatePartsInTimeZone(now, timeZone)
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function getNowHmInTimeZone(timeZone: string) {
  const now = new Date()
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

    if (!device_id) {
      return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const sharedDeviceIds = await sharedDeviceIdsForFrame(supabase, device_id)

    const { data, error } = await supabase
      .from('reminders')
      .select('id, device_id, title, due_date, due_time, repeat_type, custom_repeat_days, is_done')
      .in('device_id', sharedDeviceIds)
      .order('due_date', { ascending: true })
      .order('due_time', { ascending: true, nullsFirst: false })
      .order('title', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const { data: completionsData, error: completionsError } = await supabase
      .from('reminder_completions')
      .select('reminder_id, occurrence_date')
      .in('device_id', sharedDeviceIds)

    if (completionsError) {
      return NextResponse.json({ error: completionsError.message }, { status: 500 })
    }

    const todayYmd = getTodayYmdInTimeZone(timeZone)
    const nowHm = getNowHmInTimeZone(timeZone)

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

    const { data: membersData, error: membersError } = await supabase
      .from('device_members')
      .select('user_id')
      .eq('device_id', device_id)

    if (membersError) {
      return NextResponse.json({ error: membersError.message }, { status: 500 })
    }

    const memberUserIds = Array.from(new Set(
      (Array.isArray(membersData) ? membersData : [])
        .map((row: { user_id?: unknown }) => String(row.user_id || '').trim())
        .filter(Boolean)
    ))

    let spondItems: DeviceReminderItem[] = []
    let teamsItems: DeviceReminderItem[] = []
    let wasteItems: DeviceReminderItem[] = []
    if (memberUserIds.length > 0) {
      await syncSpondIfStaleForUsers(memberUserIds)

      const { data: integrationItemsData, error: integrationItemsError } = await supabase
        .from('integration_items')
        .select('id, user_id, provider, external_id, title, body, starts_at, due_at, priority, raw')
        .eq('provider', 'spond')
        .in('user_id', memberUserIds)
        .order('priority', { ascending: true })
        .order('starts_at', { ascending: true, nullsFirst: false })

      if (integrationItemsError) {
        return NextResponse.json({ error: integrationItemsError.message }, { status: 500 })
      }

      spondItems = buildSpondReminderItems(
        Array.isArray(integrationItemsData) ? (integrationItemsData as IntegrationItemRow[]) : [],
        todayYmd,
        horizonEndYmd,
        timeZone,
        includeOverdue
      )

      await Promise.allSettled(memberUserIds.map((userId) => syncTeamsFromStoredConnection(userId, { horizonDays })))

      const { data: teamsIntegrationItemsData, error: teamsIntegrationItemsError } = await supabase
        .from('integration_items')
        .select('id, user_id, provider, external_id, title, body, starts_at, due_at, priority, raw')
        .eq('provider', 'teams')
        .in('user_id', memberUserIds)
        .order('starts_at', { ascending: true, nullsFirst: false })

      if (teamsIntegrationItemsError) {
        return NextResponse.json({ error: teamsIntegrationItemsError.message }, { status: 500 })
      }

      teamsItems = buildTeamsMeetingItems(
        Array.isArray(teamsIntegrationItemsData) ? (teamsIntegrationItemsData as IntegrationItemRow[]) : [],
        todayYmd,
        horizonEndYmd,
        timeZone
      )

      const { data: wasteIntegrationItemsData, error: wasteIntegrationItemsError } = await supabase
        .from('integration_items')
        .select('id, user_id, provider, external_id, title, body, starts_at, due_at, priority, raw')
        .eq('provider', 'waste')
        .in('user_id', memberUserIds)
        .order('starts_at', { ascending: true, nullsFirst: false })

      if (wasteIntegrationItemsError) {
        return NextResponse.json({ error: wasteIntegrationItemsError.message }, { status: 500 })
      }

      wasteItems = buildWasteCollectionItems(
        Array.isArray(wasteIntegrationItemsData) ? (wasteIntegrationItemsData as IntegrationItemRow[]) : [],
        todayYmd,
        horizonEndYmd,
        timeZone,
        includeOverdue
      )
    }

    const sortedCandidates = [...teamsItems, ...spondItems, ...wasteItems, ...manualItems].sort(compareReminderItems)
    const items = selectReminderDisplayGroups(sortedCandidates, limit)

    return NextResponse.json({ items })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
