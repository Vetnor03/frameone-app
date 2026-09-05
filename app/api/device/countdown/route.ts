import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { optimizeFrameContent } from '@/app/lib/frameContentOptimizer'

export const runtime = 'nodejs'

type CountdownRow = {
  id: string
  device_id: string
  title: string | null
  target_date: string | null
  pinned: boolean | null
  starter_key?: string | null
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
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

function diffDaysFromYmd(fromYmd: string, toYmd: string) {
  const from = parseYmdToLocalDate(fromYmd)
  const to = parseYmdToLocalDate(toYmd)
  if (!from || !to) return 0

  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())

  return Math.round((toUtc - fromUtc) / 86400000)
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

function getTodayYmdInTimeZone(timeZone: string) {
  const now = new Date()
  const { year, month, day } = getDatePartsInTimeZone(now, timeZone)
  return `${year}-${pad2(month)}-${pad2(day)}`
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

function formatDisplayDate(targetYmd: string, todayYmd: string) {
  if (targetYmd === todayYmd) return 'Today'

  const today = parseYmdToLocalDate(todayYmd)
  const target = parseYmdToLocalDate(targetYmd)
  if (!today || !target) return targetYmd

  const tomorrow = addDaysLocal(today, 1)
  if (toLocalYmd(tomorrow) === targetYmd) return 'Tomorrow'

  return `${pad2(target.getDate())}.${pad2(target.getMonth() + 1)}.${target.getFullYear()}`
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const device_id = String(url.searchParams.get('device_id') || '').trim()
    const timeZone = String(url.searchParams.get('tz') || 'Europe/Oslo').trim() || 'Europe/Oslo'

    if (!device_id) {
      return NextResponse.json({ error: 'Missing device_id' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: events, error: eventsError } = await supabase
      .from('countdown_events')
      .select('id, device_id, title, target_date, pinned, starter_key')
      .in('device_id', await sharedDeviceIdsForFrame(supabase, device_id))
      .order('target_date', { ascending: true })
      .order('title', { ascending: true })

    if (eventsError) {
      return NextResponse.json({ error: eventsError.message }, { status: 500 })
    }

    const todayYmd = getTodayYmdInTimeZone(timeZone)
    const rows = Array.isArray(events) ? (events as CountdownRow[]) : []

    const sourceItems = rows
      .map((row) => {
        const title = String(row.title ?? '').trim()
        let target_date = String(row.target_date ?? '').trim()
        const id = String(row.id ?? '').trim()

        // Starter countdowns are annual normal records. Derive the next view
        // from their saved month/day without rewriting or recreating the row.
        if (row.starter_key && target_date && target_date < todayYmd) {
          const monthDay = target_date.slice(5)
          target_date = `${Number(todayYmd.slice(0, 4))}-${monthDay}`
          if (target_date < todayYmd) target_date = `${Number(todayYmd.slice(0, 4)) + 1}-${monthDay}`
        }

        if (!id || !title || !target_date) return null

        const days_left = diffDaysFromYmd(todayYmd, target_date)

        return {
          id,
          title,
          target_date,
          display_date: formatDisplayDate(target_date, todayYmd),
          days_left,
          is_today: days_left === 0,
          is_past: days_left < 0,
          pinned: !!row.pinned,
        }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        if (a.days_left !== b.days_left) return a.days_left - b.days_left
        if (a.target_date < b.target_date) return -1
        if (a.target_date > b.target_date) return 1
        return a.title.localeCompare(b.title)
      })

    const optimizedTitles = await optimizeFrameContent(sourceItems.map((item: any) => ({
      id: item.id,
      title: item.title,
      contentType: 'countdown',
      displayDate: item.display_date,
    })))
    const optimizedTitleById = new Map(optimizedTitles.map((item) => [item.id, item.title]))
    const items = sourceItems.map((item: any) => ({
      ...item,
      title: optimizedTitleById.get(item.id) || item.title,
    }))

    return NextResponse.json({
      device_id,
      generated_at: new Date().toISOString(),
      timezone: timeZone,
      today_ymd: todayYmd,
      items,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 })
  }
}
