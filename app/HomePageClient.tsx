// app/page.tsx
'use client'

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { findSpotByLabel } from './lib/surf/spots'
import { clampAngleToSector, normalizeAngle, sectorMidpoint } from './lib/surf/customSpotMath'
import SoccerTeamSheet from './components/SoccerTeamSheet'

type CoreTabKey = 'frame' | 'settings'
type ModuleKey = 'date' | 'weather' | 'surf' | 'reminders' | 'countdown' | 'soccer' | 'stocks' | 'groceries'
type CellSize = 'small' | 'medium' | 'large'
type LayoutKey = 'default' | 'pyramid' | 'square' | 'full'
type TabKey = CoreTabKey | ModuleKey

type AppLanguage = 'en' | 'no'
type AppFontSize = 'normal' | 'large'

const UI = {
  en: {
    frame: 'FRAME',
    settings: 'SETTINGS',

    modules: {
      date: 'DATE',
      weather: 'WEATHER',
      surf: 'SURF',
      reminders: 'REMINDERS',
      countdown: 'COUNTDOWN',
      soccer: 'SOCCER',
      stocks: 'INVESTMENTS',
      groceries: 'GROCERIES',
    },

    layouts: {
      default: { title: 'LAYOUT 1', subtitle: 'DEFAULT' },
      pyramid: { title: 'LAYOUT 2', subtitle: 'PYRAMID' },
      square: { title: 'LAYOUT 3', subtitle: 'SQUARE' },
      full: { title: 'LAYOUT 4', subtitle: 'FULL' },
    },

    saved: 'SAVED',
    saving: 'SAVING…',
    update: 'UPDATE',
    loadingFrame: 'LOADING FRAME…',

    selectWidget: 'ADD TILE',
    clearCell: 'CLEAR CELL',

    themeTitle: 'THEME',
    dark: 'DARK',
    light: 'LIGHT',

    languageTitle: 'LANGUAGE',
    english: 'English',
    norwegian: 'Norwegian',

    fontSizeTitle: 'FONT SIZE',
    normal: 'NORMAL',
    large: 'LARGE',

    themeRow: 'Theme',
    languageRow: 'Language',
    fontSizeRow: 'Font size',
    privacyPolicy: 'Privacy policy',
    termsAndConditions: 'Terms and conditions',
    contact: 'Contact',
    shop: 'Shop',
    logout: 'Log out',

    myFrames: 'MY FRAMES',
    addFrame: '+ ADD FRAME',
    noFramesYet: 'No frames yet',
    loading: 'Loading…',
    addFramePrompt: 'Enter 4-character pair code (example: K7D4)',
    invalidPairCode: 'Invalid or expired code.',
    frameAdded: 'Frame added!',

    selectFrameFirst: 'Select a frame first',
    chooseTeam: 'Choose team',
    chooseLocation: 'Choose location',
    change: 'CHANGE',

    slotLabels: {
      default: { 0: 'Top', 1: 'Middle', 2: 'Bottom' },
      pyramid: { 0: 'Top', 1: 'Middle', 2: 'Bottom Left', 3: 'Bottom Right' },
      square: { 0: 'Upper Left', 1: 'Upper Right', 2: 'Lower Left', 3: 'Lower Right' },
      full: { 0: 'Full' },
    },

    soccerTeam: 'Team',
    soccerTeamFor: 'Team',
    stock: 'Investment',
    stockSymbol: 'Symbol',
    chart: 'Chart',
    chartToday: 'Today',
    chartWeek: 'Week',
    chartMonth: 'Month',
    chartYear: 'Year',
    groceriesInputPlaceholder: 'Add grocery item',
    groceriesAdd: 'ADD',
    groceriesSuggestions: 'Suggestions',
    groceriesNoItems: 'No grocery items yet',
    groceriesCheckedLabel: 'Bought',
    groceriesUntickHint: 'You can undo for 10min',
    groceriesQty: 'Qty',

    countdownNoEvents: 'No events yet',
    newEvent: 'NEW EVENT',
    edit: 'EDIT',
    pinToFrame: 'PIN TO FRAME',
    pinned: 'PINNED',
    notPinned: 'NOT PINNED',
    eventTitle: 'Event title',
    title: 'TITLE',
    date: 'DATE',
    cancel: 'CANCEL',
    delete: 'DELETE',
    deleting: 'DELETING…',
    saveChanges: 'SAVE CHANGES',
    saveEvent: 'SAVE EVENT',
    newEventTitle: 'NEW EVENT',
    editEventTitle: 'EDIT EVENT',
    deleteEventTitle: 'DELETE EVENT',
    areYouSure: 'Are you sure?',
    updated: 'Updated',
    savedWord: 'Saved',

    reminders: 'REMINDERS',
    weatherLocation: 'Location',
    surfSpot: 'Spot',
  },

  no: {
    frame: 'FRAME',
    settings: 'INNSTILLINGER',

    modules: {
      date: 'DATO',
      weather: 'VÆR',
      surf: 'SURF',
      reminders: 'PÅMINNELSER',
      countdown: 'NEDTELLING',
      soccer: 'FOTBALL',
      stocks: 'INVESTERINGER',
      groceries: 'HANDLELISTE',
    },

    layouts: {
      default: { title: 'OPPSETT 1', subtitle: 'STANDARD' },
      pyramid: { title: 'OPPSETT 2', subtitle: 'PYRAMIDE' },
      square: { title: 'OPPSETT 3', subtitle: 'RUTE' },
      full: { title: 'OPPSETT 4', subtitle: 'FULL' },
    },

    saved: 'LAGRET',
    saving: 'LAGRER…',
    update: 'OPPDATER',
    loadingFrame: 'LASTER FRAME…',

    selectWidget: 'ADD TILE',
    clearCell: 'TØM FELT',

    themeTitle: 'TEMA',
    dark: 'MØRK',
    light: 'LYS',

    languageTitle: 'SPRÅK',
    english: 'Engelsk',
    norwegian: 'Norsk',

    fontSizeTitle: 'SKRIFTSTØRRELSE',
    normal: 'NORMAL',
    large: 'STOR',

    themeRow: 'Tema',
    languageRow: 'Språk',
    fontSizeRow: 'Skriftstørrelse',
    privacyPolicy: 'Personvern',
    termsAndConditions: 'Vilkår og betingelser',
    contact: 'Kontakt',
    shop: 'Butikk',
    logout: 'Logg ut',

    myFrames: 'MINE FRAMES',
    addFrame: '+ LEGG TIL FRAME',
    noFramesYet: 'Ingen frames ennå',
    loading: 'Laster…',
    addFramePrompt: 'Skriv inn 4-tegns paringskode (eksempel: K7D4)',
    invalidPairCode: 'Ugyldig eller utløpt kode.',
    frameAdded: 'Frame lagt til!',

    selectFrameFirst: 'Velg et frame først',
    chooseTeam: 'Velg lag',
    chooseLocation: 'Velg sted',
    change: 'ENDRE',

    slotLabels: {
      default: { 0: 'Topp', 1: 'Midt', 2: 'Bunn' },
      pyramid: { 0: 'Topp', 1: 'Midt', 2: 'Nede venstre', 3: 'Nede høyre' },
      square: { 0: 'Oppe venstre', 1: 'Oppe høyre', 2: 'Nede venstre', 3: 'Nede høyre' },
      full: { 0: 'Full' },
    },

    soccerTeam: 'Lag',
    soccerTeamFor: 'Lag',
    stock: 'Investering',
    stockSymbol: 'Symbol',
    chart: 'Chart',
    chartToday: 'I dag',
    chartWeek: 'Uke',
    chartMonth: 'Måned',
    chartYear: 'År',
    groceriesInputPlaceholder: 'Legg til vare',
    groceriesAdd: 'LEGG TIL',
    groceriesSuggestions: 'Forslag',
    groceriesNoItems: 'Ingen varer ennå',
    groceriesCheckedLabel: 'Kjøpt',
    groceriesUntickHint: 'Kan angres i 10 min',
    groceriesQty: 'Antall',

    countdownNoEvents: 'Ingen hendelser ennå',
    newEvent: 'NY HENDELSE',
    edit: 'REDIGER',
    pinToFrame: 'FEST TIL FRAME',
    pinned: 'FESTET',
    notPinned: 'IKKE FESTET',
    eventTitle: 'Tittel på hendelse',
    title: 'TITTEL',
    date: 'DATO',
    cancel: 'AVBRYT',
    delete: 'SLETT',
    deleting: 'SLETTER…',
    saveChanges: 'LAGRE ENDRINGER',
    saveEvent: 'LAGRE HENDELSE',
    newEventTitle: 'NY HENDELSE',
    editEventTitle: 'REDIGER HENDELSE',
    deleteEventTitle: 'SLETT HENDELSE',
    areYouSure: 'Er du sikker?',
    updated: 'Oppdatert',
    savedWord: 'Lagret',

    reminders: 'PÅMINNELSER',
    weatherLocation: 'Sted',
    surfSpot: 'Spot',
  },
} as const

function tx(language: AppLanguage) {
  return UI[language]
}

function moduleLabel(language: AppLanguage, key: ModuleKey) {
  return UI[language].modules[key]
}

function moduleLoadingText(language: AppLanguage, key: ModuleKey) {
  const label = moduleLabel(language, key).toLowerCase()
  return language === 'no' ? `Laster ${label}…` : `Loading ${label}…`
}

function allLayouts(language: AppLanguage): { key: LayoutKey; title: string; subtitle: string }[] {
  const t = tx(language)
  return [
    { key: 'default', title: t.layouts.default.title, subtitle: t.layouts.default.subtitle },
    { key: 'pyramid', title: t.layouts.pyramid.title, subtitle: t.layouts.pyramid.subtitle },
    { key: 'square', title: t.layouts.square.title, subtitle: t.layouts.square.subtitle },
    { key: 'full', title: t.layouts.full.title, subtitle: t.layouts.full.subtitle },
  ]
}

type MirrorSurfDaypart = {
  label?: string
  rating?: number
  waveRange?: string
  swellPeriodS?: number
  windSpeedMs?: number
  ratingFromExperience?: boolean
  experienceDiceValue?: number
  dateLocal?: string
  date_local?: string
  wave_height_range_label?: string
  wave_range?: string
  swell_period_s?: number
  wind_speed_ms?: number
  ratingSource?: string
  source?: string
  finalRating?: number
  experienceRating?: number
}

type MirrorWeatherDay = {
  label: string
  lowTemp: string
  highTemp: string
  windLine: string
  precipLine: string
  wmo: number | null
}

type MirrorModuleDetail = {
  primary: string
  secondary?: string
  tertiary?: string
  module?: ModuleKey
  rating?: number
  waveRange?: string
  swellPeriodS?: number
  windSpeedMs?: number
  surfDayparts?: MirrorSurfDaypart[]
  surfDaily?: MirrorSurfDaypart[]
  isTodaysBest?: boolean
  isExperienceBased?: boolean
  ratingFromExperience?: boolean
  experienceDiceValue?: number
  basedOnExperience?: boolean
  ratingSource?: string
  source?: string
  experience?: unknown
  breakdown?: unknown
  picked?: unknown
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
  weatherDays?: MirrorWeatherDay[]
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
  stockChartRange?: StockChartRange
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


type MirrorHoliday = {
  date: string
  name: string
}

type PhysicalFrameSnapshot = {
  theme: 'dark' | 'light'
  language: AppLanguage
  fontSize: AppFontSize
  layoutKey: LayoutKey
  cells: Record<number, ModuleKey | null>
  modulesJson: Record<string, unknown>
  detailsBySlot: Record<string, MirrorModuleDetail>
  updatedAt: string | null
  renderAt: string | null
}

type SettingsJson = {
  theme?: 'dark' | 'light'
  language?: AppLanguage
  fontSize?: AppFontSize
  layout?: LayoutKey
  cells?: { slot: number; module: string }[]
  modules?: Record<string, any>
  pinned_tabs?: ModuleKey[]
  layout_module_memory?: (ModuleKey | null)[]
}

type MemberRow = {
  device_id: string
  role: string | null
  current_version?: string | null
  battery_percent?: number | null
  battery_voltage?: number | null
  is_charging?: boolean | null
  is_usb_present?: boolean | null
}

type DeviceStatusMeta = {
  current_version: string | null
  battery_percent: number | null
  battery_voltage: number | null
  is_charging: boolean | null
  is_usb_present: boolean | null
  last_seen_at: string | null
  last_render_at: string | null
}

type DeviceStatusRow = {
  device_id: string
  current_version: string | null
  battery_percent: number | string | null
  battery_voltage: number | string | null
  is_charging: boolean | string | number | null
  is_usb_present: boolean | string | number | null
  last_seen_at: string | null
  last_render_at: string | null
  last_refresh_at?: string | null
}


function BatteryIcon({ percent, className = 'h-3.5 w-[18px] opacity-80' }: { percent: number; className?: string }) {
  const p = Math.max(0, Math.min(100, percent))
  const bars = p >= 75 ? 3 : p >= 35 ? 2 : p >= 10 ? 1 : 0

  return (
    <svg
      aria-hidden
      viewBox="0 0 20 12"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1" y="1" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
      <rect x="17.4" y="4" width="1.6" height="4" rx="0.8" fill="currentColor" />
      {bars >= 1 && <rect x="3.1" y="3" width="3.2" height="6" rx="0.8" fill="currentColor" />}
      {bars >= 2 && <rect x="7.1" y="3" width="3.2" height="6" rx="0.8" fill="currentColor" />}
      {bars >= 3 && <rect x="11.1" y="3" width="3.2" height="6" rx="0.8" fill="currentColor" />}
    </svg>
  )
}

function ChargingBoltIcon({ className = 'h-3.5 w-2.5 opacity-90' }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 8 12"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4.7 0.9 1.9 6h2l-0.6 5.1 2.8-5.1h-2Z" fill="currentColor" />
    </svg>
  )
}

function normalizeBatteryPercent(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n)
  if (rounded < 0) return 0
  if (rounded > 100) return 100
  return rounded
}

function normalizeBatteryVoltage(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  return Number(n.toFixed(3))
}

function normalizeBoolean(value: boolean | string | number | null | undefined): boolean | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
    return null
  }

  const normalized = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false
  return null
}

function buildLatestStatusMap(rows: DeviceStatusRow[]): Map<string, DeviceStatusMeta> {
  const map = new Map<string, DeviceStatusMeta>()

  for (const row of rows) {
    if (!row?.device_id) continue
    if (map.has(row.device_id)) continue

    map.set(row.device_id, {
      current_version: row.current_version ?? null,
      battery_percent: normalizeBatteryPercent(row.battery_percent),
      battery_voltage: normalizeBatteryVoltage(row.battery_voltage),
      is_charging: normalizeBoolean(row.is_charging),
      is_usb_present: normalizeBoolean(row.is_usb_present),
      last_seen_at: row.last_seen_at ?? row.last_refresh_at ?? null,
      last_render_at: row.last_render_at ?? row.last_refresh_at ?? null,
    })
  }

  return map
}

async function fetchStatusMapFromApi(deviceIds: string[]): Promise<Map<string, DeviceStatusMeta>> {
  const map = new Map<string, DeviceStatusMeta>()
  if (deviceIds.length === 0) return map

  const results = await Promise.all(
    deviceIds.map(async (deviceId) => {
      try {
        const resp = await fetch(`/api/device/status?device_id=${encodeURIComponent(deviceId)}`, { cache: 'no-store' })
        if (!resp.ok) return null

        const data = await resp.json()
        return {
          device_id: deviceId,
          current_version: data?.current_version ?? null,
          battery_percent: normalizeBatteryPercent(data?.battery_percent),
          battery_voltage: normalizeBatteryVoltage(data?.battery_voltage),
          is_charging: normalizeBoolean(data?.is_charging),
          is_usb_present: normalizeBoolean(data?.is_usb_present),
          last_seen_at: data?.last_seen_at ?? null,
          last_render_at: data?.last_render_at ?? null,
        }
      } catch {
        return null
      }
    })
  )

  for (const row of results) {
    if (!row?.device_id) continue
    map.set(row.device_id, row)
  }

  return map
}

async function fetchDeviceStatusMap(deviceIds: string[]): Promise<Map<string, DeviceStatusMeta>> {
  if (deviceIds.length === 0) return new Map<string, DeviceStatusMeta>()

  let directMap = new Map<string, DeviceStatusMeta>()

  try {
    const { data: statuses } = await supabase
      .from('device_status')
      .select(
        'device_id, current_version, battery_percent, battery_voltage, is_charging, is_usb_present, last_seen_at, last_render_at, last_refresh_at'
      )
      .in('device_id', deviceIds)
      .order('last_seen_at', { ascending: false, nullsFirst: false })

    directMap = buildLatestStatusMap((statuses || []) as DeviceStatusRow[])
  } catch {
    directMap = new Map<string, DeviceStatusMeta>()
  }

  const missingIds = deviceIds.filter((id) => !directMap.has(id))
  if (missingIds.length === 0) return directMap

  const apiMap = await fetchStatusMapFromApi(missingIds)
  for (const [id, meta] of apiMap.entries()) {
    directMap.set(id, meta)
  }

  return directMap
}

async function fetchCurrentUserFrames(userId: string): Promise<MemberRow[]> {
  const { data: members, error } = await supabase
    .from('device_members')
    .select('device_id, role')
    .eq('user_id', userId)
    .order('device_id', { ascending: true })

  if (error) throw error

  const memberRows = (members || []) as Array<{ device_id: string; role: string | null }>
  const deviceIds = memberRows.map((m) => m.device_id).filter(Boolean)
  const statusMap = await fetchDeviceStatusMap(deviceIds)

  return memberRows.map((m) => ({
    device_id: m.device_id,
    role: m.role,
    current_version: statusMap.get(m.device_id)?.current_version ?? null,
    battery_percent: statusMap.get(m.device_id)?.battery_percent ?? null,
    battery_voltage: statusMap.get(m.device_id)?.battery_voltage ?? null,
    is_charging: statusMap.get(m.device_id)?.is_charging ?? null,
    is_usb_present: statusMap.get(m.device_id)?.is_usb_present ?? null,
  }))
}

async function claimPairCodeAndLoadFrames(code: string, currentFrames: MemberRow[]) {
  const cleaned = code.trim().toUpperCase()
  const existingDeviceIds = new Set(currentFrames.map((f) => f.device_id))

  const { data, error } = await supabase.rpc('claim_pair_code', { p_code: cleaned })
  if (error) throw error
  if (data !== true) throw new Error('INVALID_PAIR_CODE')

  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session
  if (!session) return { frames: [] as MemberRow[], newlyAddedDeviceId: null as string | null }

  const frames = await fetchCurrentUserFrames(session.user.id)
  const newlyAddedFrame = frames.find((f) => !existingDeviceIds.has(f.device_id))

  return {
    frames,
    newlyAddedDeviceId: newlyAddedFrame?.device_id ?? null,
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}


function isTheme(value: unknown): value is 'dark' | 'light' {
  return value === 'dark' || value === 'light'
}

function isLanguage(value: unknown): value is AppLanguage {
  return value === 'en' || value === 'no'
}

function isFontSize(value: unknown): value is AppFontSize {
  return value === 'normal' || value === 'large'
}

function isLayoutKey(value: unknown): value is LayoutKey {
  return value === 'default' || value === 'pyramid' || value === 'square' || value === 'full'
}

function modulesRecordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function normalizePhysicalFrameSnapshot(settings: unknown, updatedAt: string | null, renderAt: string | null): PhysicalFrameSnapshot {
  const json = modulesRecordFromUnknown(settings)
  const layoutKey = isLayoutKey(json.layout) ? json.layout : 'default'
  const cells = cellsArrayToMap(
    layoutKey,
    Array.isArray(json.cells) ? (json.cells as { slot: number; module: string }[]) : []
  )

  return {
    theme: isTheme(json.theme) ? json.theme : 'dark',
    language: isLanguage(json.language) ? json.language : 'en',
    fontSize: isFontSize(json.fontSize) ? json.fontSize : 'normal',
    layoutKey,
    cells,
    modulesJson: modulesRecordFromUnknown(json.modules),
    detailsBySlot: {},
    updatedAt,
    renderAt,
  }
}

function usePhoneLandscapeMirror() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const query = '(orientation: landscape) and (pointer: coarse) and (max-height: 540px)'
    const mql = window.matchMedia(query)
    const update = () => setEnabled(mql.matches)

    update()
    mql.addEventListener('change', update)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)

    return () => {
      mql.removeEventListener('change', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  return enabled
}

function emptyCellsFor(layout: LayoutKey): Record<number, ModuleKey | null> {
  if (layout === 'default') return { 0: null, 1: null, 2: null }
  if (layout === 'pyramid') return { 0: null, 1: null, 2: null, 3: null }
  if (layout === 'square') return { 0: null, 1: null, 2: null, 3: null }
  return { 0: null }
}

function baseModuleKeyFromStored(moduleStr: string): ModuleKey | null {
  const raw = String(moduleStr || '').trim()
  if (!raw) return null

  const base = raw.split(':')[0].toLowerCase()

  if (
    base === 'date' ||
    base === 'weather' ||
    base === 'surf' ||
    base === 'reminders' ||
    base === 'countdown' ||
    base === 'soccer' ||
    base === 'stocks' ||
    base === 'groceries'
  ) {
    return base as ModuleKey
  }

  return null
}

function cellsMapToArray(
  map: Record<number, ModuleKey | null>,
  options?: { includeEmptySlots?: boolean }
) {
  let weatherCounter = 0
  let surfCounter = 0
  let soccerCounter = 0
  let stocksCounter = 0
  let groceriesCounter = 0

  return Object.entries(map)
    .filter(([, mod]) => options?.includeEmptySlots || !!mod)
    .map(([slot, mod]) => {
      if (!mod) {
        return { slot: Number(slot), module: '' }
      }

      const m = mod as ModuleKey

      if (m === 'weather') {
        weatherCounter += 1
        return { slot: Number(slot), module: `weather:${weatherCounter}` }
      }

      if (m === 'surf') {
        surfCounter += 1
        return { slot: Number(slot), module: `surf:${surfCounter}` }
      }

      if (m === 'soccer') {
        soccerCounter += 1
        return { slot: Number(slot), module: `soccer:${soccerCounter}` }
      }

      if (m === 'stocks') {
        stocksCounter += 1
        return { slot: Number(slot), module: `stocks:${stocksCounter}` }
      }

      if (m === 'groceries') {
        groceriesCounter += 1
        return { slot: Number(slot), module: `groceries:${groceriesCounter}` }
      }

      return { slot: Number(slot), module: m }
    })
}

function cellsArrayToMap(layout: LayoutKey, arr: { slot: number; module: string }[]) {
  const base = emptyCellsFor(layout)

  for (const c of arr || []) {
    if (!c) continue
    if (!Object.prototype.hasOwnProperty.call(base, String(c.slot))) continue

    const mk = baseModuleKeyFromStored(c.module)
    if (mk) base[c.slot] = mk
  }

  return base
}

function makeEmptyCellsByLayout() {
  return {
    default: emptyCellsFor('default'),
    pyramid: emptyCellsFor('pyramid'),
    square: emptyCellsFor('square'),
    full: emptyCellsFor('full'),
  } as Record<LayoutKey, Record<number, ModuleKey | null>>
}

type FeelingChoice = 'flat' | 'poor' | 'poor_fair' | 'fair' | 'good' | 'epic'

const FEELING_OPTIONS: Array<{ key: FeelingChoice; rating: number }> = [
  { key: 'flat', rating: 1 },
  { key: 'poor', rating: 2 },
  { key: 'poor_fair', rating: 3 },
  { key: 'fair', rating: 4 },
  { key: 'good', rating: 5 },
  { key: 'epic', rating: 6 },
]

function feelingLabel(language: AppLanguage, key: FeelingChoice) {
  if (language === 'no') {
    if (key === 'flat') return 'Flatt'
    if (key === 'poor') return 'Svakt'
    if (key === 'poor_fair') return 'Litt liv'
    if (key === 'fair') return 'Verdt turen'
    if (key === 'good') return 'Solid'
    return 'Heilt Texas'
  }

  if (key === 'flat') return 'Flat'
  if (key === 'poor') return 'Poor'
  if (key === 'poor_fair') return 'Poor to Fair'
  if (key === 'fair') return 'Fair'
  if (key === 'good') return 'Good'
  return 'Epic'
}

function roundToNearest5Min(d: Date) {
  const x = new Date(d)
  const mins = x.getMinutes()
  const rounded = Math.round(mins / 5) * 5
  x.setMinutes(rounded, 0, 0)
  return x
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toDateInputValue(d: Date) {
  const x = new Date(d)
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`
}

function formatTimeLabel(language: AppLanguage, d: Date) {
  const x = new Date(d)
  const now = new Date()

  const sameDay =
    x.getFullYear() === now.getFullYear() &&
    x.getMonth() === now.getMonth() &&
    x.getDate() === now.getDate()

  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)

  const isTomorrow =
    x.getFullYear() === tomorrow.getFullYear() &&
    x.getMonth() === tomorrow.getMonth() &&
    x.getDate() === tomorrow.getDate()

  const datePart = sameDay
    ? language === 'no'
      ? 'I dag'
      : 'Today'
    : isTomorrow
      ? language === 'no'
        ? 'I morgen'
        : 'Tomorrow'
      : `${pad2(x.getDate())}.${pad2(x.getMonth() + 1)}.${x.getFullYear()}`

  const timePart = `${pad2(x.getHours())}:${pad2(x.getMinutes())}`

  return `${datePart} ${timePart}`
}

function setDateParts(base: Date, dateYmd: string, hour: number, minute: number) {
  const next = new Date(base)
  const [y, m, d] = String(dateYmd || '').split('-').map((v) => Number(v))
  if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
    next.setFullYear(y, m - 1, d)
  }
  next.setHours(hour, minute, 0, 0)
  return next
}

function feelingToRating(choice: FeelingChoice | null) {
  if (!choice) return null
  return FEELING_OPTIONS.find((x) => x.key === choice)?.rating ?? null
}

function ratingToFeelingChoice(rating: number | null | undefined): FeelingChoice | null {
  const r = Number(rating)
  if (r === 1) return 'flat'
  if (r === 2) return 'poor'
  if (r === 3) return 'poor_fair'
  if (r === 4) return 'fair'
  if (r === 5) return 'good'
  if (r === 6) return 'epic'
  return null
}

function formatFeelingFromRating(language: AppLanguage, rating: number | null | undefined) {
  const choice = ratingToFeelingChoice(rating)
  if (!choice) return '--'
  return feelingLabel(language, choice)
}

function feelingTextColorClass(choice: FeelingChoice | null) {
  if (choice === 'flat') return 'text-[#dc2626]'
  if (choice === 'poor') return 'text-[#d97706]'
  if (choice === 'poor_fair') return 'text-[#facc15]'
  if (choice === 'fair') return 'text-[#84cc16]'
  if (choice === 'good') return 'text-[#15803d]'
  if (choice === 'epic') return 'text-[#a855f7]'
  return 'text-[color:var(--fg-60)]'
}

function isSpotReadyForExperience(spotLabel: string, spotId: string) {
  const label = String(spotLabel || '').trim()
  const id = String(spotId || '').trim()
  if (!label || label === 'Not set') return false
  if (!id) return false
  if (id === '__todays_best__') return false
  return true
}

function ReMindSplash({ language }: { language: AppLanguage }) {
  return (
    <div
      className="flex-1 flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label={tx(language).loadingFrame}
    >
      <div className="remind-splash text-[color:var(--fg)]">
        <svg className="remind-splash-logo" viewBox="0 0 256 256" aria-hidden="true">
          <path className="remind-logo-frame" d="M64 192H82V154H98L122 192H192V77H64V192Z" />
          <path className="remind-logo-r" d="M82 154V112H106C126 112 138 120 138 136S126 154 106 154H82" />
          <text className="remind-logo-e" x="148" y="181">e</text>
          <g className="remind-logo-mind" aria-hidden="true">
            <text x="70" y="226">m</text>
            <text x="110" y="226">i</text>
            <text x="154" y="226">n</text>
            <text x="196" y="226">d</text>
          </g>
        </svg>
      </div>
    </div>
  )
}

export default function HomePage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)
  const [physicalFrameSnapshot, setPhysicalFrameSnapshot] = useState<PhysicalFrameSnapshot | null>(null)
  const physicalFrameSnapshotRef = useRef<PhysicalFrameSnapshot | null>(null)
  const physicalFrameRenderAtRef = useRef<string | null>(null)
  const physicalFrameSnapshotSignatureRef = useRef<string | null>(null)
  const isPhoneLandscapeMirror = usePhoneLandscapeMirror()

  const [activeTab, setActiveTab] = useState<TabKey>('frame')
  const [remindersConnectScreenOpen, setRemindersConnectScreenOpen] = useState(false)
  const [dirty, setDirty] = useState(false)

  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null)
  const [frames, setFrames] = useState<MemberRow[]>([])
  const [authReady, setAuthReady] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [framesLoaded, setFramesLoaded] = useState(false)
  const [isFirstFramePairingComplete, setIsFirstFramePairingComplete] = useState(false)
  const [booting, setBooting] = useState(false)
  const [showSplash, setShowSplash] = useState(false)
  const [shouldRenderApp, setShouldRenderApp] = useState(false)

  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [themePickerOpen, setThemePickerOpen] = useState(false)
  const [language, setLanguage] = useState<AppLanguage>('en')
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false)
  const [fontSize, setFontSize] = useState<AppFontSize>('normal')
  const [fontSizePickerOpen, setFontSizePickerOpen] = useState(false)

  const [cellsByLayout, setCellsByLayout] = useState<Record<LayoutKey, Record<number, ModuleKey | null>>>(
    makeEmptyCellsByLayout()
  )

  const [layoutKey, setLayoutKey] = useState<LayoutKey>('default')

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)

  const [modulesJson, setModulesJson] = useState<Record<string, any>>({})
  const [persisting, setPersisting] = useState(false)
  const [pinnedModuleTabs, setPinnedModuleTabs] = useState<ModuleKey[]>([])

  useEffect(() => {
    physicalFrameSnapshotRef.current = physicalFrameSnapshot
  }, [physicalFrameSnapshot])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme

    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
    if (meta) meta.content = theme === 'dark' ? '#061b24' : '#eef2f6'
  }, [theme])

  useEffect(() => {
    if (!activeDeviceId) return
    if (activeTab !== 'frame' && !isPhoneLandscapeMirror) return

    let statusTimer: number | null = null
    let snapshotTimer: number | null = null

    const isPollingAllowed = () => !isPhoneLandscapeMirror || document.visibilityState === 'visible'

    const refreshStatus = (forceSnapshot = false) => {
      if (!isPollingAllowed()) return
      refreshPhysicalFrameState(activeDeviceId, { forceSnapshot })
    }

    const start = () => {
      if (!isPollingAllowed()) return
      if (statusTimer == null) {
        refreshStatus(true)
        statusTimer = window.setInterval(() => refreshStatus(false), 15000)
      }
      if (snapshotTimer == null) {
        snapshotTimer = window.setInterval(() => refreshStatus(true), 60000)
      }
    }

    const stop = () => {
      if (statusTimer != null) {
        window.clearInterval(statusTimer)
        statusTimer = null
      }
      if (snapshotTimer != null) {
        window.clearInterval(snapshotTimer)
        snapshotTimer = null
      }
    }

    const handleVisibilityChange = () => {
      if (isPollingAllowed()) {
        refreshStatus(true)
        start()
      } else {
        stop()
      }
    }

    start()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleVisibilityChange)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleVisibilityChange)
    }
    // refreshPhysicalFrameState is intentionally omitted so polling is keyed only by device/tab/mirror mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDeviceId, activeTab, isPhoneLandscapeMirror])

  useEffect(() => {
    return () => {
      if (dirtyFrameRef.current != null) window.cancelAnimationFrame(dirtyFrameRef.current)
    }
  }, [])

  const layoutMeta = allLayouts(language).find((l) => l.key === layoutKey) || allLayouts(language)[0]
  const activeFrameStatus = frames.find((frame) => frame.device_id === activeDeviceId) ?? null
  const mirrorSnapshot = useMemo<PhysicalFrameSnapshot | null>(() => {
    const currentCells = cellsByLayout[layoutKey] || emptyCellsFor(layoutKey)
    const currentModulesJson = normalizeModulesForSave(modulesJson)

    if (!physicalFrameSnapshot) {
      return {
        theme,
        language,
        fontSize,
        layoutKey,
        cells: currentCells,
        modulesJson: currentModulesJson,
        detailsBySlot: {},
        updatedAt: null,
        renderAt: null,
      }
    }

    const detailsBySlot = Object.entries(physicalFrameSnapshot.detailsBySlot).reduce<Record<string, MirrorModuleDetail>>(
      (acc, [slotKey, detail]) => {
        const slot = Number(slotKey)
        if (!Number.isFinite(slot)) return acc
        const currentModule = currentCells[slot]
        if (!currentModule) return acc
        if (detail?.module && detail.module !== currentModule) return acc
        if (!detail?.module && physicalFrameSnapshot.cells[slot] !== currentModule) return acc
        acc[slotKey] = detail
        return acc
      },
      {}
    )

    return {
      ...physicalFrameSnapshot,
      theme,
      language,
      fontSize,
      layoutKey,
      cells: currentCells,
      modulesJson: currentModulesJson,
      detailsBySlot,
    }
  }, [cellsByLayout, fontSize, language, layoutKey, modulesJson, physicalFrameSnapshot, theme])

  const stickySettingsRef = useRef(false)
  const preferInstantScrollRef = useRef(false)
  const isLoadedRef = useRef(false)

  const disableLaunchSplash = searchParams?.get('nosplash') === '1'

  useEffect(() => {
    const tab = searchParams?.get('tab')
    if (tab === 'settings') {
      stickySettingsRef.current = true
      preferInstantScrollRef.current = true
      setActiveTab('settings')
    }
  }, [searchParams])

  const dynamicTabs = useMemo(() => {
    const activeModules = Array.from(
      new Set((Object.values(cellsByLayout[layoutKey]).filter(Boolean) as ModuleKey[]).filter((m) => m !== 'date'))
    )

    const pinnedInactive = pinnedModuleTabs.filter((m) => m !== 'date' && !activeModules.includes(m))
    const pinnedActive = pinnedModuleTabs.filter((m) => m !== 'date' && activeModules.includes(m))
    const activeUnpinned = activeModules.filter((m) => !pinnedActive.includes(m))

    return [...pinnedActive, ...activeUnpinned, ...pinnedInactive].map((m) => ({
      key: m as ModuleKey,
      label: moduleLabel(language, m),
    }))
  }, [cellsByLayout, layoutKey, language, pinnedModuleTabs])

  const tabs = useMemo(() => {
    return [
      { key: 'frame' as const, label: tx(language).frame },
      ...dynamicTabs,
      { key: 'settings' as const, label: tx(language).settings },
    ]
  }, [dynamicTabs, language])

  const shouldShowFirstFrameOnboarding =
    authReady &&
    !!userId &&
    framesLoaded &&
    frames.length === 0 &&
    !isFirstFramePairingComplete

  const savedStateRef = useRef<string>('')
  const savedFrameStateRef = useRef<{
    theme: 'dark' | 'light'
    language: AppLanguage
    fontSize: AppFontSize
    layoutKey: LayoutKey
    cellsByLayout: Record<LayoutKey, Record<number, ModuleKey | null>>
  } | null>(null)
  const layoutModuleMemoryRef = useRef<(ModuleKey | null)[]>([])

  function serializeComparableState(args: {
    theme: 'dark' | 'light'
    language: AppLanguage
    fontSize: AppFontSize
    layoutKey: LayoutKey
    cellsByLayout: Record<LayoutKey, Record<number, ModuleKey | null>>
    modulesJson: Record<string, any>
    pinnedModuleTabs: ModuleKey[]
  }) {
    const normalizedModules = normalizeModulesForSave(args.modulesJson)

    return JSON.stringify({
      theme: args.theme,
      language: args.language,
      fontSize: args.fontSize,
      layout: args.layoutKey,
      cells: cellsMapToArray(args.cellsByLayout[args.layoutKey]),
      modules: normalizedModules,
      pinned_tabs: args.pinnedModuleTabs,
    })
  }

  const dirtyFrameRef = useRef<number | null>(null)
  const frameAutoSavePendingRef = useRef(false)
  const persistSettingsRef = useRef<() => Promise<boolean>>(async () => false)
  const pendingDirtyStateRef = useRef<{
    theme?: 'dark' | 'light'
    language?: AppLanguage
    fontSize?: AppFontSize
    layoutKey?: LayoutKey
    cellsByLayout?: Record<LayoutKey, Record<number, ModuleKey | null>>
    modulesJson?: Record<string, any>
    pinnedModuleTabs?: ModuleKey[]
  } | null>(null)

  function refreshDirtyState(next?: {
    theme?: 'dark' | 'light'
    language?: AppLanguage
    fontSize?: AppFontSize
    layoutKey?: LayoutKey
    cellsByLayout?: Record<LayoutKey, Record<number, ModuleKey | null>>
    modulesJson?: Record<string, any>
    pinnedModuleTabs?: ModuleKey[]
  }) {
    const serialized = serializeComparableState({
      theme: next?.theme ?? theme,
      language: next?.language ?? language,
      fontSize: next?.fontSize ?? fontSize,
      layoutKey: next?.layoutKey ?? layoutKey,
      cellsByLayout: next?.cellsByLayout ?? cellsByLayout,
      modulesJson: next?.modulesJson ?? modulesJson,
      pinnedModuleTabs: next?.pinnedModuleTabs ?? pinnedModuleTabs,
    })

    setDirty(serialized !== savedStateRef.current)
  }

  function markDirty(next?: {
    theme?: 'dark' | 'light'
    language?: AppLanguage
    fontSize?: AppFontSize
    layoutKey?: LayoutKey
    cellsByLayout?: Record<LayoutKey, Record<number, ModuleKey | null>>
    modulesJson?: Record<string, any>
    pinnedModuleTabs?: ModuleKey[]
  }) {
    pendingDirtyStateRef.current = next ?? null
    if (dirtyFrameRef.current != null) return
    dirtyFrameRef.current = window.requestAnimationFrame(() => {
      dirtyFrameRef.current = null
      const pending = pendingDirtyStateRef.current
      pendingDirtyStateRef.current = null
      refreshDirtyState(pending ?? undefined)
    })
  }

  function scheduleFrameAutoSave() {
    frameAutoSavePendingRef.current = true
  }


  function orderedSlotsForLayout(targetLayout: LayoutKey) {
    return Object.keys(emptyCellsFor(targetLayout)).map(Number).sort((a, b) => a - b)
  }

  function sanitizeLayoutModuleMemory(value: unknown): (ModuleKey | null)[] {
    if (!Array.isArray(value)) return []

    return value.map((item) => (typeof item === 'string' ? baseModuleKeyFromStored(item) : null))
  }

  function mergeCellsIntoSlotMemory(
    memory: (ModuleKey | null)[],
    layout: LayoutKey,
    cells: Record<number, ModuleKey | null>
  ) {
    const next = [...memory]
    const validSlots = emptyCellsFor(layout)

    Object.keys(validSlots)
      .map(Number)
      .forEach((slot) => {
        while (next.length <= slot) next.push(null)
        next[slot] = cells[slot] ?? null
      })

    return next
  }

  function projectSlotMemoryIntoLayout(moduleMemory: (ModuleKey | null)[], targetLayout: LayoutKey) {
    // We intentionally keep sparse values as null so layout switches preserve slot positions.
    const target = emptyCellsFor(targetLayout)
    const targetSlots = orderedSlotsForLayout(targetLayout)

    targetSlots.forEach((slot) => {
      target[slot] = moduleMemory[slot] ?? null
    })

    return target
  }

  function replaceMemoryAtSlotIndex(
    memory: (ModuleKey | null)[],
    layout: LayoutKey,
    slot: number,
    nextValue: ModuleKey | null
  ) {
    const validSlots = emptyCellsFor(layout)
    if (!Object.prototype.hasOwnProperty.call(validSlots, String(slot))) return memory

    const next = [...memory]
    // Keep sparse slot alignment by extending with nulls before writing.
    while (next.length <= slot) next.push(null)

    next[slot] = nextValue ?? null
    return next
  }

  function formatRelative(iso: string) {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null

    const diffMs = Date.now() - d.getTime()
    const diffSec = Math.floor(diffMs / 1000)

    if (language === 'no') {
      const prefix = 'Sist oppdatert'

      if (diffSec < 10) return `${prefix} akkurat nå`
      if (diffSec < 60) return `${prefix} for ${diffSec} sekunder siden`

      const diffMin = Math.floor(diffSec / 60)
      if (diffMin < 60) return `${prefix} for ${diffMin} minutt${diffMin === 1 ? '' : 'er'} siden`

      const diffHr = Math.floor(diffMin / 60)
      if (diffHr < 24) return `${prefix} for ${diffHr} time${diffHr === 1 ? '' : 'r'} siden`

      const diffDay = Math.floor(diffHr / 24)
      return `${prefix} for ${diffDay} dag${diffDay === 1 ? '' : 'er'} siden`
    }

    const prefix = 'Updated'

    if (diffSec < 10) return `${prefix} just now`
    if (diffSec < 60) return `${prefix} ${diffSec} seconds ago`

    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${prefix} ${diffMin} minute${diffMin === 1 ? '' : 's'} ago`

    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${prefix} ${diffHr} hour${diffHr === 1 ? '' : 's'} ago`

    const diffDay = Math.floor(diffHr / 24)
    return `${prefix} ${diffDay} day${diffDay === 1 ? '' : 's'} ago`
  }

  async function loadDeviceStatus(deviceId: string): Promise<string | null> {
    try {
      const resp = await fetch(`/api/device/status?device_id=${encodeURIComponent(deviceId)}`, { cache: 'no-store' })
      if (!resp.ok) {
        setLastUpdatedAt(null)
        return null
      }

      const data = await resp.json()
      const renderIso = data?.last_render_at ? String(data.last_render_at) : ''
      const status: Omit<MemberRow, 'device_id' | 'role'> = {
        current_version: data?.current_version ?? null,
        battery_percent: normalizeBatteryPercent(data?.battery_percent),
        battery_voltage: normalizeBatteryVoltage(data?.battery_voltage),
        is_charging: normalizeBoolean(data?.is_charging),
        is_usb_present: normalizeBoolean(data?.is_usb_present),
      }

      setFrames((current) =>
        current.map((frame) => (frame.device_id === deviceId ? { ...frame, ...status } : frame))
      )
      setLastUpdatedAt(renderIso ? formatRelative(renderIso) : null)
      return renderIso || null
    } catch {
      setLastUpdatedAt(null)
      return null
    }
  }


  function applyDeviceStatus(deviceId: string, data: Record<string, unknown>) {
    const renderIso = data?.last_render_at ? String(data.last_render_at) : ''
    const status: Omit<MemberRow, 'device_id' | 'role'> = {
      current_version: typeof data?.current_version === 'string' ? data.current_version : null,
      battery_percent: normalizeBatteryPercent(data?.battery_percent as number | string | null | undefined),
      battery_voltage: normalizeBatteryVoltage(data?.battery_voltage as number | string | null | undefined),
      is_charging: normalizeBoolean(data?.is_charging as boolean | string | number | null | undefined),
      is_usb_present: normalizeBoolean(data?.is_usb_present as boolean | string | number | null | undefined),
    }

    setFrames((current) =>
      current.map((frame) => (frame.device_id === deviceId ? { ...frame, ...status } : frame))
    )
    setLastUpdatedAt(renderIso ? formatRelative(renderIso) : null)
    return renderIso || null
  }

  function stableSnapshotString(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => stableSnapshotString(item)).join(',')}]`
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSnapshotString(record[key])}`).join(',')}}`
    }
    return JSON.stringify(value)
  }

  function snapshotSignature(snapshot: PhysicalFrameSnapshot) {
    return stableSnapshotString({
      theme: snapshot.theme,
      language: snapshot.language,
      fontSize: snapshot.fontSize,
      layoutKey: snapshot.layoutKey,
      cells: snapshot.cells,
      modulesJson: snapshot.modulesJson,
      detailsBySlot: snapshot.detailsBySlot,
      updatedAt: snapshot.updatedAt,
      renderAt: snapshot.renderAt,
    })
  }

  async function loadMirrorSnapshot(deviceId: string): Promise<PhysicalFrameSnapshot | null> {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) return null

      const resp = await fetch(`/api/device/mirror-snapshot?device_id=${encodeURIComponent(deviceId)}`, {
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!resp.ok) return null

      const data = await resp.json()
      const status = modulesRecordFromUnknown(data?.status)
      const renderAt = status?.last_render_at ? String(status.last_render_at) : null
      const snapshot = normalizePhysicalFrameSnapshot(
        data?.settings_json,
        data?.updated_at ? String(data.updated_at) : null,
        renderAt
      )

      applyDeviceStatus(deviceId, status)

      return {
        ...snapshot,
        detailsBySlot: modulesRecordFromUnknown(data?.detailsBySlot) as Record<string, MirrorModuleDetail>,
      }
    } catch {
      return null
    }
  }

  async function loadPhysicalFrameSnapshot(deviceId: string, renderAt: string | null) {
    const snapshot = await loadMirrorSnapshot(deviceId)
    if (!snapshot) return

    const nextSnapshot = { ...snapshot, renderAt: snapshot.renderAt ?? renderAt }
    const nextSignature = snapshotSignature(nextSnapshot)
    if (nextSignature !== physicalFrameSnapshotSignatureRef.current) {
      setPhysicalFrameSnapshot(nextSnapshot)
      physicalFrameSnapshotSignatureRef.current = nextSignature
    }
    physicalFrameRenderAtRef.current = nextSnapshot.renderAt
  }

  async function refreshPhysicalFrameState(deviceId: string, options?: { forceSnapshot?: boolean }) {
    const renderAt = await loadDeviceStatus(deviceId)

    if (
      options?.forceSnapshot ||
      !physicalFrameSnapshotRef.current ||
      (renderAt && renderAt !== physicalFrameRenderAtRef.current)
    ) {
      await loadPhysicalFrameSnapshot(deviceId, renderAt)
    }
  }

  async function loadDeviceSettings(deviceId: string) {
    const { data, error } = await supabase
      .from('device_settings')
      .select('settings_json')
      .eq('device_id', deviceId)
      .maybeSingle()

    if (error) return defaultDinnerPlanDays()

    const json = (data?.settings_json || {}) as SettingsJson
    const hasSavedSettings =
      !!data?.settings_json &&
      typeof data.settings_json === 'object' &&
      Object.keys(data.settings_json as Record<string, unknown>).length > 0
    const nextTheme = (json.theme || 'dark') as 'dark' | 'light'
    const nextLanguage = (json.language || 'en') as AppLanguage
    const nextFontSize = (json.fontSize || 'normal') as AppFontSize
    const nextLayout = (json.layout || 'default') as LayoutKey
    const nextCellsForLayout = cellsArrayToMap(nextLayout, json.cells || [])

    const nextCellsByLayout = {
      ...makeEmptyCellsByLayout(),
      [nextLayout]: nextCellsForLayout,
    }

    layoutModuleMemoryRef.current = mergeCellsIntoSlotMemory(
      sanitizeLayoutModuleMemory(json.layout_module_memory),
      nextLayout,
      nextCellsForLayout
    )

    const rawModules =
      json.modules && typeof json.modules === 'object'
        ? (json.modules as Record<string, any>)
        : ({} as Record<string, any>)

    const normalizedModules = normalizeModulesForSave(rawModules)
    const nextPinnedTabs = Array.isArray((json as any).pinned_tabs)
      ? ((json as any).pinned_tabs as ModuleKey[]).filter((m) => m !== 'date')
      : []

    setTheme(nextTheme)
    setLanguage(nextLanguage)
    setFontSize(nextFontSize)
    setCellsByLayout(nextCellsByLayout)
    setLayoutKey(nextLayout)
    setModulesJson(normalizedModules)
    setPinnedModuleTabs(nextPinnedTabs)

    savedStateRef.current = serializeComparableState({
      theme: nextTheme,
      language: nextLanguage,
      fontSize: nextFontSize,
      layoutKey: nextLayout,
      cellsByLayout: nextCellsByLayout,
      modulesJson: normalizedModules,
      pinnedModuleTabs: nextPinnedTabs,
    })
    savedFrameStateRef.current = {
      theme: nextTheme,
      language: nextLanguage,
      fontSize: nextFontSize,
      layoutKey: nextLayout,
      cellsByLayout: nextCellsByLayout,
    }

    setDirty(false)
    await loadDeviceStatus(deviceId)

    if (!stickySettingsRef.current) setActiveTab('frame')

    if (!hasSavedSettings) {
      const initialSettingsJson: SettingsJson = {
        theme: nextTheme,
        language: nextLanguage,
        fontSize: nextFontSize,
        layout: 'default',
        cells: cellsMapToArray(emptyCellsFor('default'), { includeEmptySlots: true }),
        modules: normalizedModules,
        pinned_tabs: nextPinnedTabs,
        layout_module_memory: layoutModuleMemoryRef.current,
      }

      await supabase.rpc('upsert_device_settings', {
        p_device_id: deviceId,
        p_settings: initialSettingsJson,
      })
    }

    isLoadedRef.current = true
  }

  useEffect(() => {
    let unsub: { unsubscribe: () => void } | null = null
    let cancelled = false
    const bootStartedAt = performance.now()

    async function finishBoot() {
      const minimumSplashMs = 1350
      const remaining = minimumSplashMs - (performance.now() - bootStartedAt)
      if (remaining > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remaining))
      }
      if (!cancelled) setBooting(false)
    }

    ;(async () => {
      setAuthReady(false)
      setUserId(null)
      setFramesLoaded(false)
      setIsFirstFramePairingComplete(false)
      setBooting(false)
      setShowSplash(false)
      setShouldRenderApp(false)
      isLoadedRef.current = false

      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session

      if (!session) {
        setAuthReady(true)
        setUserId(null)
        setFramesLoaded(false)
        setFrames([])
        setActiveDeviceId(null)
        isLoadedRef.current = false
        setBooting(false)
        setShowSplash(false)
        setShouldRenderApp(false)
        router.replace('/login')
        return
      }

      setAuthReady(true)
      setUserId(session.user.id)
      setShouldRenderApp(true)
      setShowSplash(!disableLaunchSplash)
      setBooting(!disableLaunchSplash)

      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (!nextSession) {
          setAuthReady(true)
          setUserId(null)
          setFramesLoaded(false)
          setFrames([])
          setActiveDeviceId(null)
          isLoadedRef.current = false
          setIsFirstFramePairingComplete(false)
          setShouldRenderApp(false)
          setShowSplash(false)
          setBooting(false)
          router.replace('/login')
        }
      })
      unsub = data.subscription

      let list: MemberRow[] = []
      try {
        list = await fetchCurrentUserFrames(session.user.id)
      } catch {
        setFrames([])
        setActiveDeviceId(null)
        isLoadedRef.current = false
        setBooting(false)
        setFramesLoaded(false)
        return
      }
      setFrames(list)
      setFramesLoaded(true)
      setIsFirstFramePairingComplete(list.length > 0)

      const saved = typeof window !== 'undefined' ? localStorage.getItem('activeDeviceId') : null
      const savedExists = saved && list.some((x) => x.device_id === saved)
      const selected = savedExists ? saved! : (list[0]?.device_id ?? null)

      setActiveDeviceId(selected)
      setPhysicalFrameSnapshot(null)
      physicalFrameSnapshotRef.current = null
      physicalFrameRenderAtRef.current = null

      if (selected) {
        await loadDeviceSettings(selected)
      }

      if (disableLaunchSplash) {
        setBooting(false)
      } else {
        await finishBoot()
      }
    })()

    return () => {
      cancelled = true
      if (unsub) unsub.unsubscribe()
    }
  }, [disableLaunchSplash, router])

  useEffect(() => {
    if (booting) {
      setShowSplash(true)
      return
    }

    const splashFadeTimer = window.setTimeout(() => setShowSplash(false), 720)
    return () => window.clearTimeout(splashFadeTimer)
  }, [booting])

  async function selectDevice(id: string) {
    isLoadedRef.current = false
    setActiveDeviceId(id)
    setPhysicalFrameSnapshot(null)
    physicalFrameSnapshotRef.current = null
    physicalFrameRenderAtRef.current = null
    if (typeof window !== 'undefined') localStorage.setItem('activeDeviceId', id)
    await loadDeviceSettings(id)
  }

  function handleFramesChanged(nextFrames: MemberRow[]) {
    setFrames(nextFrames)
    setFramesLoaded(true)
    if (nextFrames.length > 0) setIsFirstFramePairingComplete(true)
  }

  async function handleFirstFramePairingComplete(nextFrames: MemberRow[], preferredDeviceId?: string | null) {
    if (nextFrames.length === 0) return

    handleFramesChanged(nextFrames)
    setIsFirstFramePairingComplete(true)

    const nextDeviceId = preferredDeviceId && nextFrames.some((frame) => frame.device_id === preferredDeviceId)
      ? preferredDeviceId
      : nextFrames[0].device_id

    await selectDevice(nextDeviceId)
  }

  function prevLayout() {
    const layouts = allLayouts(language)
    const idx = layouts.findIndex((l) => l.key === layoutKey)
    const next = (idx - 1 + layouts.length) % layouts.length
    const nextLayoutKey = layouts[next].key

    stickySettingsRef.current = false

    const projected = projectSlotMemoryIntoLayout(layoutModuleMemoryRef.current, nextLayoutKey)
    const nextCellsByLayout = {
      ...cellsByLayout,
      [nextLayoutKey]: projected,
    }

    setCellsByLayout(nextCellsByLayout)
    setLayoutKey(nextLayoutKey)
    setActiveTab('frame')
    markDirty({
      layoutKey: nextLayoutKey,
      cellsByLayout: nextCellsByLayout,
    })
    scheduleFrameAutoSave()
  }

  function nextLayout() {
    const layouts = allLayouts(language)
    const idx = layouts.findIndex((l) => l.key === layoutKey)
    const next = (idx + 1) % layouts.length
    const nextLayoutKey = layouts[next].key

    stickySettingsRef.current = false

    const projected = projectSlotMemoryIntoLayout(layoutModuleMemoryRef.current, nextLayoutKey)
    const nextCellsByLayout = {
      ...cellsByLayout,
      [nextLayoutKey]: projected,
    }

    setCellsByLayout(nextCellsByLayout)
    setLayoutKey(nextLayoutKey)
    setActiveTab('frame')
    markDirty({
      layoutKey: nextLayoutKey,
      cellsByLayout: nextCellsByLayout,
    })
    scheduleFrameAutoSave()
  }

  function openPicker(slot: number) {
    stickySettingsRef.current = false
    setPickerSlot(slot)
    setPickerOpen(true)
  }

  function chooseModule(module: ModuleKey) {
    if (pickerSlot == null) return

    layoutModuleMemoryRef.current = replaceMemoryAtSlotIndex(
      layoutModuleMemoryRef.current,
      layoutKey,
      pickerSlot,
      module
    )

    const nextCellsForLayout = projectSlotMemoryIntoLayout(layoutModuleMemoryRef.current, layoutKey)

    const nextCellsByLayout = {
      ...cellsByLayout,
      [layoutKey]: nextCellsForLayout,
    }

    setCellsByLayout(nextCellsByLayout)
    setPickerOpen(false)
    setPickerSlot(null)
    markDirty({ cellsByLayout: nextCellsByLayout })
    scheduleFrameAutoSave()
  }

  function clearCell() {
    if (pickerSlot == null) return

    layoutModuleMemoryRef.current = replaceMemoryAtSlotIndex(
      layoutModuleMemoryRef.current,
      layoutKey,
      pickerSlot,
      null
    )

    const nextCellsForLayout = projectSlotMemoryIntoLayout(layoutModuleMemoryRef.current, layoutKey)

    const nextCellsByLayout = {
      ...cellsByLayout,
      [layoutKey]: nextCellsForLayout,
    }

    setCellsByLayout(nextCellsByLayout)
    setPickerOpen(false)
    setPickerSlot(null)
    markDirty({ cellsByLayout: nextCellsByLayout })
    scheduleFrameAutoSave()
  }

  async function persistSettings() {
    if (!activeDeviceId) return false
    if (persisting) return false

    try {
      setPersisting(true)

      const modulesForSave = normalizeModulesForSave(modulesJson)
      const currentCellsForLayout = cellsByLayout[layoutKey] || emptyCellsFor(layoutKey)
      const nextLayoutModuleMemory = mergeCellsIntoSlotMemory(
        layoutModuleMemoryRef.current,
        layoutKey,
        currentCellsForLayout
      )

      const settingsJson: SettingsJson = {
        theme,
        language,
        fontSize,
        layout: layoutKey,
        cells: cellsMapToArray(currentCellsForLayout),
        modules: modulesForSave,
        pinned_tabs: pinnedModuleTabs,
        layout_module_memory: nextLayoutModuleMemory,
      }

      const { data, error } = await supabase.rpc('upsert_device_settings', {
        p_device_id: activeDeviceId,
        p_settings: settingsJson,
      })

      if (error) throw error
      if (data !== true) throw new Error(language === 'no' ? 'Ikke tilgang til å oppdatere dette framet.' : 'Not allowed to update this frame.')

      const savedCellsForLayout = { ...currentCellsForLayout }

      const nextCellsByLayout = {
        ...makeEmptyCellsByLayout(),
        [layoutKey]: savedCellsForLayout,
      }

      layoutModuleMemoryRef.current = nextLayoutModuleMemory

      setCellsByLayout(nextCellsByLayout)
      setModulesJson(modulesForSave)

      savedStateRef.current = serializeComparableState({
        theme,
        language,
        fontSize,
        layoutKey,
        cellsByLayout: nextCellsByLayout,
        modulesJson: modulesForSave,
        pinnedModuleTabs,
      })
      savedFrameStateRef.current = {
        theme,
        language,
        fontSize,
        layoutKey,
        cellsByLayout: nextCellsByLayout,
      }

      setDirty(false)
      await loadPhysicalFrameSnapshot(activeDeviceId, physicalFrameRenderAtRef.current)

      return true
    } catch (e: any) {
      alert(String(e?.message || e))
      return false
    } finally {
      setPersisting(false)
    }
  }



  useEffect(() => {
    if (!frameAutoSavePendingRef.current || !dirty || persisting) return

    void persistSettingsRef.current().then((saved) => {
      if (saved) frameAutoSavePendingRef.current = false
    })
  }, [dirty, persisting, activeDeviceId, theme, language, fontSize, layoutKey, cellsByLayout, modulesJson, pinnedModuleTabs])

  persistSettingsRef.current = persistSettings

  async function logout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const appBg = 'var(--app-bg)'
  const appText = 'text-[color:var(--fg)]'


async function handleSelectTab(k: TabKey) {
  preferInstantScrollRef.current = false
  stickySettingsRef.current = k === 'settings'
  setRemindersConnectScreenOpen(false)

  setActiveTab(k)
}

  if (isPhoneLandscapeMirror) {
    return (
      <LandscapeFrameMirror
        snapshot={mirrorSnapshot}
        fallbackLanguage={language}
        theme={theme}
        status={activeFrameStatus}
      />
    )
  }

  return (
    <main className={`h-screen overflow-hidden ${appText} flex justify-center`} style={{ background: appBg }}>
      <div className="w-full max-w-[420px] h-full px-5 pt-10 pb-6 flex flex-col relative">
        {shouldShowFirstFrameOnboarding && (
          <FirstFrameOnboarding
            language={language}
            frames={frames}
            onPairingComplete={handleFirstFramePairingComplete}
          />
        )}

        <div
          className={`remind-app-shell ${!shouldRenderApp || shouldShowFirstFrameOnboarding ? 'hidden' : ''} ${booting ? 'remind-app-shell-booting' : 'remind-app-shell-ready'} flex flex-col flex-1 min-h-0`}
          aria-hidden={!shouldRenderApp || booting || shouldShowFirstFrameOnboarding}
        >
          <>
            <TabBar
              tabs={tabs}
              activeTab={activeTab}
              onSelect={handleSelectTab}
              getScrollBehavior={() => {
                const instant = preferInstantScrollRef.current
                preferInstantScrollRef.current = false
                return instant ? 'auto' : 'smooth'
              }}
            />

            <div className="mt-6 flex-1 min-h-0">
              {activeTab === 'frame' && (
                <FrameTab
                  title={layoutMeta.title}
                  subtitle={layoutMeta.subtitle}
                  layoutKey={layoutKey}
                  cells={cellsByLayout[layoutKey]}
                  onPrev={prevLayout}
                  onNext={nextLayout}
                  onCellTap={openPicker}
                  language={language}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsTab
                  language={language}
                  theme={theme}
                  fontSize={fontSize}
                  onOpenTheme={() => setThemePickerOpen(true)}
                  onOpenLanguage={() => setLanguagePickerOpen(true)}
                  onOpenFontSize={() => setFontSizePickerOpen(true)}
                  frames={frames}
                  activeDeviceId={activeDeviceId}
                  onSelectDevice={selectDevice}
                  onFramesChanged={handleFramesChanged}
                  onLogout={logout}
                  onGo={(path) => router.push(path)}
                />
              )}

              {activeTab !== 'frame' && activeTab !== 'settings' && (
                <div className="relative h-full">
                  <div className="absolute right-0 -top-4 z-20 flex items-center gap-2">
                    {activeTab === 'reminders' && !remindersConnectScreenOpen && (
                      <button
                        type="button"
                        onClick={() => setRemindersConnectScreenOpen(true)}
                        className="inline-flex h-7 items-center justify-center rounded-full border border-[color:var(--bd-20)] px-3 text-[10px] tracking-widest text-[color:var(--fg-70)] bg-[color:var(--app-bg)]/80"
                      >
                        {language === 'no' ? 'KOBLE APPER' : 'CONNECT APPS'}
                      </button>
                    )}

                    <button
                      onClick={() => {
                        const module = activeTab as ModuleKey
                        setPinnedModuleTabs((prev) => {
                          const exists = prev.includes(module)
                          const nextPinned = exists ? prev.filter((m) => m !== module) : [...prev, module]
                          markDirty({ pinnedModuleTabs: nextPinned })
                          return nextPinned
                        })
                      }}
                      className="inline-flex items-center justify-center h-7 w-7 rounded-full border border-[color:var(--bd-20)] text-[color:var(--fg-70)]"
                      title={pinnedModuleTabs.includes(activeTab as ModuleKey) ? 'Unpin tab' : 'Pin tab'}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className={`w-4 h-4 ${pinnedModuleTabs.includes(activeTab as ModuleKey) ? 'fill-[#2aa3ff]' : 'fill-none'}`}
                        stroke={pinnedModuleTabs.includes(activeTab as ModuleKey) ? '#2aa3ff' : 'currentColor'}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 17v5" />
                        <path d="M5 3l14 0" />
                        <path d="M7 3l2 7v3l-2 2v1h10v-1l-2-2v-3l2-7" />
                      </svg>
                    </button>
                  </div>

                  {activeTab === 'reminders' && remindersConnectScreenOpen ? (
                    <ConnectAppsScreen
                      language={language}
                      modulesJson={modulesJson}
                      onBack={() => setRemindersConnectScreenOpen(false)}
                    />
                  ) : (
                    <ModuleSettingsTab
                      language={language}
                      module={activeTab as ModuleKey}
                      layoutKey={layoutKey}
                      cells={cellsByLayout[layoutKey]}
                      modulesJson={modulesJson}
                      setModulesJson={setModulesJson}
                      markDirty={markDirty}
                      activeDeviceId={activeDeviceId}
                    />
                  )}
                </div>
              )}
            </div>

            {activeTab === 'frame' && (
              <div className="pt-5 pb-[20px] flex flex-col items-center relative z-20">
                <div className="h-[16px] text-xs tracking-widest text-[color:var(--fg-40)]">
                  {lastUpdatedAt ?? (language === 'no' ? 'Sist oppdatert —' : 'Updated —')}
                </div>
              </div>
            )}

            {pickerOpen && (
              <PickerModal
                language={language}
                onClose={() => {
                  setPickerOpen(false)
                  setPickerSlot(null)
                }}
                onPick={chooseModule}
                onClear={clearCell}
              />
            )}

            {themePickerOpen && (
              <ThemePickerModal
                language={language}
                current={theme}
                onClose={() => setThemePickerOpen(false)}
                onPick={(t) => {
                  setTheme(t)
                  setThemePickerOpen(false)
                  markDirty({ theme: t })
                }}
              />
            )}

            {languagePickerOpen && (
              <LanguagePickerModal
                current={language}
                onClose={() => setLanguagePickerOpen(false)}
                onPick={(next) => {
                  setLanguage(next)
                  setLanguagePickerOpen(false)
                  markDirty({ language: next })
                }}
              />
            )}

            {fontSizePickerOpen && (
              <FontSizePickerModal
                language={language}
                current={fontSize}
                onClose={() => setFontSizePickerOpen(false)}
                onPick={(next) => {
                  setFontSize(next)
                  setFontSizePickerOpen(false)
                  markDirty({ fontSize: next })
                }}
              />
            )}

          </>
        </div>

        {shouldRenderApp && showSplash && (
          <div
            className={`remind-splash-overlay ${booting ? '' : 'remind-splash-overlay-hiding'}`}
            aria-hidden={!booting}
          >
            <ReMindSplash language={language} />
          </div>
        )}
      </div>
    </main>
  )
}

type ConnectAppKey = 'spond' | 'transponder' | 'teams'

function connectAppIsConnected(modulesJson: Record<string, any>, key: ConnectAppKey) {
  const integrations = modulesJson?.integrations
  const candidates = [
    integrations && typeof integrations === 'object' && !Array.isArray(integrations) ? integrations[key] : null,
    Array.isArray(integrations) ? integrations.find((item: any) => String(item?.key ?? item?.name ?? '').toLowerCase() === key) : null,
    modulesJson?.[key],
  ]

  return candidates.some((item) => {
    if (!item || typeof item !== 'object') return false
    return !!(item.connected || item.enabled || item.accessToken || item.access_token || item.refreshToken || item.refresh_token)
  })
}

function ConnectAppsScreen({
  language,
  modulesJson,
  onBack,
}: {
  language: AppLanguage
  modulesJson: Record<string, unknown>
  onBack: () => void
}) {
  const initialTeamsOAuthStatus = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('teams')
  const initialTeamsOAuthMessage = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('message')
  const [statusTone, setStatusTone] = useState<'info' | 'success' | 'error'>(() => initialTeamsOAuthStatus === 'connected' ? 'success' : initialTeamsOAuthStatus === 'error' ? 'error' : 'info')
  const [status, setStatus] = useState<string | null>(() => {
    if (initialTeamsOAuthStatus === 'connected') return language === 'no' ? 'Teams er tilkoblet' : 'Teams connected'
    if (initialTeamsOAuthStatus === 'error') return initialTeamsOAuthMessage || (language === 'no' ? 'Kunne ikke koble til Teams' : 'Could not connect Teams')
    return null
  })
  const [spondConnected, setSpondConnected] = useState(connectAppIsConnected(modulesJson, 'spond'))
  const [spondAccount, setSpondAccount] = useState<string | null>(null)
  const [spondModalOpen, setSpondModalOpen] = useState(false)
  const [spondUsername, setSpondUsername] = useState('')
  const [spondPassword, setSpondPassword] = useState('')
  const [spondLoading, setSpondLoading] = useState(false)
  const [teamsConnected, setTeamsConnected] = useState(initialTeamsOAuthStatus === 'connected' || connectAppIsConnected(modulesJson, 'teams'))
  const [teamsAccount, setTeamsAccount] = useState<string | null>(null)
  const [teamsLoading, setTeamsLoading] = useState(false)

  async function fetchSpondStatus() {
    const accessToken = (await supabase.auth.getSession())?.data?.session?.access_token || ''
    if (!accessToken) return
    const resp = await fetch('/api/integrations/spond/status', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
    if (!resp.ok) return
    const json = await resp.json()
    setSpondConnected(json?.connected === true)
    setSpondAccount(typeof json?.account === 'string' && json.account ? json.account : null)
  }


  async function fetchTeamsStatus() {
    const accessToken = (await supabase.auth.getSession())?.data?.session?.access_token || ''
    if (!accessToken) return
    const resp = await fetch('/api/integrations/teams/status', {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    })
    if (!resp.ok) return
    const json = await resp.json()
    setTeamsConnected(json?.connected === true)
    setTeamsAccount(typeof json?.account === 'string' && json.account ? json.account : null)
  }

  async function connectTeams() {
    if (teamsLoading || teamsConnected) return
    setTeamsLoading(true)
    setStatus(null)
    setStatusTone('info')
    try {
      const accessToken = (await supabase.auth.getSession())?.data?.session?.access_token || ''
      if (!accessToken) throw new Error(language === 'no' ? 'Logg inn for å koble til Teams' : 'Sign in to connect Teams')
      const params = new URLSearchParams({ access_token: accessToken })
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (timeZone) params.set('tz', timeZone)
      window.location.href = `/api/integrations/teams/connect?${params.toString()}`
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : ''
      setTeamsLoading(false)
      setStatusTone('error')
      setStatus(message || (language === 'no' ? 'Kunne ikke starte Teams-tilkobling' : 'Could not start Teams connection'))
    }
  }

  async function connectSpond() {
    const username = spondUsername.trim()
    if (!username || !spondPassword || spondLoading) return
    setSpondLoading(true)
    setStatus(null)
    setStatusTone('info')
    try {
      const accessToken = (await supabase.auth.getSession())?.data?.session?.access_token || ''
      const resp = await fetch('/api/integrations/spond/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ username, password: spondPassword }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(json?.error || 'Failed to connect Spond')
      setSpondConnected(true)
      setSpondAccount(typeof json?.account === 'string' && json.account ? json.account : username)
      setSpondPassword('')
      setSpondModalOpen(false)
      setStatusTone('success')
      setStatus(language === 'no' ? 'Spond er tilkoblet' : 'Spond connected')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : ''
      setStatusTone('error')
      setStatus(message || (language === 'no' ? 'Kunne ikke koble til Spond' : 'Could not connect Spond'))
    } finally {
      setSpondLoading(false)
    }
  }

  async function disconnectSpond() {
    if (spondLoading) return
    setSpondLoading(true)
    setStatus(null)
    setStatusTone('info')
    try {
      const accessToken = (await supabase.auth.getSession())?.data?.session?.access_token || ''
      const resp = await fetch('/api/integrations/spond/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) throw new Error(json?.error || 'Failed to disconnect Spond')
      setSpondConnected(false)
      setSpondAccount(null)
      setStatusTone('success')
      setStatus(language === 'no' ? 'Spond er frakoblet' : 'Spond disconnected')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : ''
      setStatusTone('error')
      setStatus(message || (language === 'no' ? 'Kunne ikke koble fra Spond' : 'Could not disconnect Spond'))
    } finally {
      setSpondLoading(false)
    }
  }

  useEffect(() => {
    fetchSpondStatus()
    fetchTeamsStatus()

    const params = new URLSearchParams(window.location.search)
    if (params.has('teams')) window.history.replaceState({}, '', window.location.pathname)
  }, [])
  const apps: Array<{ key: ConnectAppKey; name: string; description: string }> = [
    {
      key: 'spond',
      name: 'Spond',
      description:
        language === 'no'
          ? 'Vis Spond-meldinger på framen din'
          : 'Show Spond messages on your frame',
    },
    {
      key: 'transponder',
      name: 'Transponder',
      description:
        language === 'no'
          ? 'Vis Transponder-meldinger på framen din'
          : 'Show Transponder messages on your frame',
    },
    {
      key: 'teams',
      name: 'Teams',
      description:
        language === 'no' ? 'Vis dagens møter på framen din' : "Show today's meetings on your frame",
    },
  ]

  return (
    <div className="h-full min-h-0 overflow-y-auto no-scrollbar pr-1 [-webkit-overflow-scrolling:touch]">
      <div className="pt-5 pb-6">
        <div className="flex items-center justify-between gap-3 px-1">
          <button
            type="button"
            onClick={onBack}
            className="h-8 px-3 rounded-xl border border-[color:var(--bd-15)] text-[11px] tracking-widest text-[color:var(--fg-70)]"
          >
            {language === 'no' ? 'TILBAKE' : 'BACK'}
          </button>
          <div className="text-[color:var(--fg-90)] text-sm font-semibold">
            {language === 'no' ? 'Koble til apper' : 'Connect apps'}
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          {apps.map((app) => {
            const connected = app.key === 'spond' ? spondConnected : app.key === 'teams' ? teamsConnected : connectAppIsConnected(modulesJson, app.key)
            return (
              <div
                key={app.key}
                className="rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[color:var(--fg-90)]">{app.name}</div>
                    <div className="mt-1 text-xs leading-snug text-[color:var(--fg-45)]">{app.description}</div>
                  </div>

                  <button
                    type="button"
                    disabled={(app.key === 'teams' && (connected || teamsLoading)) || (app.key !== 'spond' && app.key !== 'teams' && connected) || (app.key === 'spond' && spondLoading)}
                    onClick={() => {
                      if (app.key === 'spond') {
                        if (connected) disconnectSpond()
                        else setSpondModalOpen(true)
                      } else if (app.key === 'teams') {
                        connectTeams()
                      } else {
                        setStatusTone('info')
                        setStatus(`${app.name} ${language === 'no' ? 'kommer snart' : 'coming soon'}`)
                      }
                    }}
                    className={`shrink-0 h-8 px-3 rounded-xl border text-[11px] tracking-widest disabled:opacity-60 ${
                      connected
                        ? app.key === 'spond'
                          ? 'border-[#d94b4b]/35 text-[#d94b4b]'
                          : 'border-[#1f9d4a]/45 bg-[#1f9d4a]/10 text-[#1f9d4a]'
                        : 'border-[color:var(--bd-20)] text-[color:var(--fg-70)]'
                    }`}
                  >
                    {app.key === 'teams' && teamsLoading
                      ? (language === 'no' ? 'KOBLER…' : 'CONNECTING…')
                      : connected && app.key === 'spond'
                        ? (language === 'no' ? 'KOBLE FRA' : 'DISCONNECT')
                        : connected
                          ? (language === 'no' ? 'TILKOBLET' : 'CONNECTED')
                          : (language === 'no' ? 'KOBLE TIL' : 'CONNECT')}
                  </button>
                </div>
                {app.key === 'spond' && spondConnected && (
                  <div className="mt-3 border-t border-[color:var(--bd-10)] pt-3 text-xs text-[color:var(--fg-45)]">
                    {spondAccount ? `${language === 'no' ? 'Konto' : 'Account'}: ${spondAccount}` : (language === 'no' ? 'Tilkoblet sikkert på serveren' : 'Connected securely on the server')}
                  </div>
                )}
                {app.key === 'teams' && teamsConnected && (
                  <div className="mt-3 border-t border-[color:var(--bd-10)] pt-3 text-xs text-[color:var(--fg-45)]">
                    {teamsAccount ? `${language === 'no' ? 'Konto' : 'Account'}: ${teamsAccount}` : (language === 'no' ? 'Kalenderen leses sikkert på serveren' : 'Calendar is read securely on the server')}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {status && (
          <div
            className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${
              statusTone === 'error'
                ? 'border-[#d94b4b]/35 bg-[#d94b4b]/10 text-[#ff7a7a]'
                : statusTone === 'success'
                  ? 'border-[#1f9d4a]/35 bg-[#1f9d4a]/10 text-[#35c76a]'
                  : 'border-[#2aa3ff]/30 bg-[#2aa3ff]/10 text-[#2aa3ff]'
            }`}
          >
            {status}
          </div>
        )}
      </div>

      {spondModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-4 sm:items-center sm:pb-0">
          <div className="w-full max-w-sm rounded-3xl border border-[color:var(--bd-15)] bg-[color:var(--sheet-bg)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-[color:var(--fg-90)]">{language === 'no' ? 'Koble til Spond' : 'Connect Spond'}</div>
                <div className="mt-1 text-xs leading-snug text-[color:var(--fg-45)]">
                  {language === 'no'
                    ? 'Innlogging sendes bare til serveren og lagres kryptert.'
                    : 'Your login is sent only to the server and stored encrypted.'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSpondModalOpen(false)}
                className="h-8 w-8 rounded-full border border-[color:var(--bd-15)] text-[color:var(--fg-60)]"
              >
                ×
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <label className="block">
                <span className="text-[10px] tracking-widest text-[color:var(--fg-45)]">{language === 'no' ? 'E-POST / BRUKERNAVN' : 'EMAIL / USERNAME'}</span>
                <input
                  value={spondUsername}
                  onChange={(e) => setSpondUsername(e.target.value)}
                  autoComplete="username"
                  className="mt-1 h-11 w-full rounded-2xl border border-[color:var(--bd-15)] bg-transparent px-3 text-sm text-[color:var(--fg-90)] outline-none focus:border-[#2aa3ff]"
                />
              </label>
              <label className="block">
                <span className="text-[10px] tracking-widest text-[color:var(--fg-45)]">{language === 'no' ? 'PASSORD' : 'PASSWORD'}</span>
                <input
                  type="password"
                  value={spondPassword}
                  onChange={(e) => setSpondPassword(e.target.value)}
                  autoComplete="current-password"
                  className="mt-1 h-11 w-full rounded-2xl border border-[color:var(--bd-15)] bg-transparent px-3 text-sm text-[color:var(--fg-90)] outline-none focus:border-[#2aa3ff]"
                />
              </label>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setSpondModalOpen(false)}
                className="h-11 flex-1 rounded-2xl border border-[color:var(--bd-15)] text-xs tracking-widest text-[color:var(--fg-70)]"
              >
                {language === 'no' ? 'AVBRYT' : 'CANCEL'}
              </button>
              <button
                type="button"
                onClick={connectSpond}
                disabled={spondLoading || !spondUsername.trim() || !spondPassword}
                className="h-11 flex-1 rounded-2xl border border-[#2aa3ff] text-xs tracking-widest text-[#2aa3ff] disabled:border-[color:var(--bd-20)] disabled:text-[color:var(--fg-35)]"
              >
                {spondLoading ? (language === 'no' ? 'KOBLER…' : 'CONNECTING…') : (language === 'no' ? 'KOBLE TIL' : 'CONNECT')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TabBar({
  tabs,
  activeTab,
  onSelect,
  getScrollBehavior,
}: {
  tabs: { key: TabKey; label: string }[]
  activeTab: TabKey
  onSelect: (k: TabKey) => void
  getScrollBehavior: () => ScrollBehavior
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  function recompute() {
    const el = scrollerRef.current
    if (!el) return

    const maxScrollRaw = el.scrollWidth - el.clientWidth
    const maxScroll = Math.max(0, maxScrollRaw)

    setCanLeft(el.scrollLeft > 6)

    const hasOverflow = el.scrollWidth > el.clientWidth + 1
    setCanRight(hasOverflow && el.scrollLeft < maxScroll - 1)
  }

  useEffect(() => {
    const el = btnRefs.current[String(activeTab)]
    if (!el) return

    const behavior = getScrollBehavior()

    const r1 = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior, block: 'nearest', inline: 'center' })
    })
    const r2 = requestAnimationFrame(() => recompute())

    return () => {
      cancelAnimationFrame(r1)
      cancelAnimationFrame(r2)
    }
  }, [activeTab, tabs.length, getScrollBehavior])

  useEffect(() => {
    recompute()
    const r1 = requestAnimationFrame(() => recompute())
    const r2 = requestAnimationFrame(() => recompute())

    const el = scrollerRef.current
    if (!el) return () => {}

    const onScroll = () => recompute()
    el.addEventListener('scroll', onScroll, { passive: true })

    const ro = new ResizeObserver(() => recompute())
    ro.observe(el)

    return () => {
      cancelAnimationFrame(r1)
      cancelAnimationFrame(r2)
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
    }
  }, [tabs.length])

  return (
    <div className="relative select-none touch-pan-x">
      {canLeft && (
        <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-6 bg-gradient-to-r from-[color:var(--app-bg)] to-transparent" />
      )}
      {canRight && (
        <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-10 bg-gradient-to-l from-[color:var(--app-bg)] to-transparent" />
      )}

      <div ref={scrollerRef} className="flex gap-8 tracking-widest overflow-x-auto overflow-y-hidden tab-scroll pr-6">
        {tabs.map((t) => {
          const isActive = t.key === activeTab
          return (
            <button
              key={t.key}
              ref={(node) => {
                btnRefs.current[String(t.key)] = node
              }}
              onClick={() => onSelect(t.key)}
              className={`pb-2 whitespace-nowrap leading-none transition-[color,font-size,font-weight] duration-150 ${
                isActive
                  ? 'text-[#2aa3ff] border-b-2 border-[#2aa3ff] text-[15px] font-semibold'
                  : 'text-[color:var(--fg-70)] text-[13px] font-normal'
              }`}
            >
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

type FrameCellRenderer = (
  module: ModuleKey | null | undefined,
  slot: number,
  size: CellSize
) => React.ReactNode

function FrameLayoutRenderer({
  layoutKey,
  cells,
  onCellTap,
  language,
  renderCellContent,
  frameClassName,
}: {
  layoutKey: LayoutKey
  cells: Record<number, ModuleKey | null>
  onCellTap?: (slot: number) => void
  language: AppLanguage
  renderCellContent?: FrameCellRenderer
  frameClassName?: string
}) {
  if (layoutKey === 'pyramid') {
    return (
      <LayoutPyramid
        language={language}
        cells={cells}
        onCellTap={onCellTap}
        renderCellContent={renderCellContent}
        frameClassName={frameClassName}
      />
    )
  }
  if (layoutKey === 'square') {
    return (
      <LayoutSquare
        language={language}
        cells={cells}
        onCellTap={onCellTap}
        renderCellContent={renderCellContent}
        frameClassName={frameClassName}
      />
    )
  }
  if (layoutKey === 'full') {
    return (
      <LayoutFull
        language={language}
        cells={cells}
        onCellTap={onCellTap}
        renderCellContent={renderCellContent}
        frameClassName={frameClassName}
      />
    )
  }

  return (
    <LayoutDefault
      language={language}
      cells={cells}
      onCellTap={onCellTap}
      renderCellContent={renderCellContent}
      frameClassName={frameClassName}
    />
  )
}

function FrameTab(props: {
  title: string
  subtitle: string
  layoutKey: LayoutKey
  cells: Record<number, ModuleKey | null>
  onPrev: () => void
  onNext: () => void
  onCellTap: (slot: number) => void
  language: AppLanguage
}) {
  const { title, subtitle, layoutKey, cells, onPrev, onNext, onCellTap, language } = props

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between">
        <button onClick={onPrev} className="w-10 h-10 flex items-center justify-center text-[color:var(--fg-60)] text-3xl">
          ‹
        </button>

        <div className="text-center">
          <div className="text-2xl font-semibold tracking-widest">{title}</div>
          <div className="text-xs text-[color:var(--fg-60)] tracking-widest mt-1">{subtitle}</div>
        </div>

        <button onClick={onNext} className="w-10 h-10 flex items-center justify-center text-[color:var(--fg-60)] text-3xl">
          ›
        </button>
      </div>

      <div className="mt-6 flex-1 min-h-0">
        <FrameLayoutRenderer layoutKey={layoutKey} language={language} cells={cells} onCellTap={onCellTap} />
      </div>
    </div>
  )
}

function LayoutDefault({
  cells,
  onCellTap,
  language,
  renderCellContent,
  frameClassName,
}: {
  cells: Record<number, ModuleKey | null>
  onCellTap?: (slot: number) => void
  language: AppLanguage
  renderCellContent?: FrameCellRenderer
  frameClassName?: string
}) {
  return (
    <FramePreview className={frameClassName}>
      <div className="h-1/2 flex flex-col">
        <div className="flex-1">
          <CellButton language={language} slot={0} size="small" module={cells[0]} onTap={onCellTap} renderCellContent={renderCellContent} />
        </div>
        <HLine />
        <div className="flex-1">
          <CellButton language={language} slot={1} size="small" module={cells[1]} onTap={onCellTap} renderCellContent={renderCellContent} />
        </div>
      </div>

      <HLine />

      <div className="h-1/2">
        <CellButton language={language} slot={2} size="large" module={cells[2]} onTap={onCellTap} renderCellContent={renderCellContent} />
      </div>
    </FramePreview>
  )
}

function LayoutPyramid({
  cells,
  onCellTap,
  language,
  renderCellContent,
  frameClassName,
}: {
  cells: Record<number, ModuleKey | null>
  onCellTap?: (slot: number) => void
  language: AppLanguage
  renderCellContent?: FrameCellRenderer
  frameClassName?: string
}) {
  return (
    <FramePreview className={frameClassName}>
      <div className="h-1/2 flex flex-col">
        <div className="flex-1">
          <CellButton language={language} slot={0} size="small" module={cells[0]} onTap={onCellTap} renderCellContent={renderCellContent} />
        </div>
        <HLine />
        <div className="flex-1">
          <CellButton language={language} slot={1} size="small" module={cells[1]} onTap={onCellTap} renderCellContent={renderCellContent} />
        </div>
      </div>

      <HLine />

      <div className="h-1/2 grid grid-cols-[1fr_auto_1fr]">
        <CellButton language={language} slot={2} size="medium" module={cells[2]} onTap={onCellTap} renderCellContent={renderCellContent} />
        <VLine />
        <CellButton language={language} slot={3} size="medium" module={cells[3]} onTap={onCellTap} renderCellContent={renderCellContent} />
      </div>
    </FramePreview>
  )
}

function LayoutSquare({
  cells,
  onCellTap,
  language,
  renderCellContent,
  frameClassName,
}: {
  cells: Record<number, ModuleKey | null>
  onCellTap?: (slot: number) => void
  language: AppLanguage
  renderCellContent?: FrameCellRenderer
  frameClassName?: string
}) {
  return (
    <FramePreview className={frameClassName}>
      <div className="h-full grid grid-rows-[1fr_auto_1fr]">
        <div className="grid grid-cols-[1fr_auto_1fr]">
          <CellButton language={language} slot={0} size="medium" module={cells[0]} onTap={onCellTap} renderCellContent={renderCellContent} />
          <VLine />
          <CellButton language={language} slot={1} size="medium" module={cells[1]} onTap={onCellTap} renderCellContent={renderCellContent} />
        </div>

        <HLine />

        <div className="grid grid-cols-[1fr_auto_1fr]">
          <CellButton language={language} slot={2} size="medium" module={cells[2]} onTap={onCellTap} renderCellContent={renderCellContent} />
          <VLine />
          <CellButton language={language} slot={3} size="medium" module={cells[3]} onTap={onCellTap} renderCellContent={renderCellContent} />
        </div>
      </div>
    </FramePreview>
  )
}

function LayoutFull({
  cells,
  onCellTap,
  language,
  renderCellContent,
  frameClassName,
}: {
  cells: Record<number, ModuleKey | null>
  onCellTap?: (slot: number) => void
  language: AppLanguage
  renderCellContent?: FrameCellRenderer
  frameClassName?: string
}) {
  return (
    <FramePreview className={frameClassName}>
      <div className="h-full">
        <CellButton language={language} slot={0} size="large" module={cells[0]} onTap={onCellTap} renderCellContent={renderCellContent} />
      </div>
    </FramePreview>
  )
}

function CellButton({
  slot,
  size,
  module,
  onTap,
  language,
  renderCellContent,
}: {
  slot: number
  size: CellSize
  module: ModuleKey | null | undefined
  onTap?: (slot: number) => void
  language: AppLanguage
  renderCellContent?: FrameCellRenderer
}) {
  const content = renderCellContent ? renderCellContent(module, slot, size) : null
  const label = module ? moduleLabel(language, module) : '+'
  const body = content ?? (
    <div
      className={`tracking-widest ${
        module ? 'text-[color:var(--fg)] font-semibold text-lg' : 'text-[color:var(--fg-50)] text-2xl'
      }`}
    >
      {label}
    </div>
  )

  if (!onTap) {
    return <div className="w-full h-full flex items-center justify-center">{body}</div>
  }

  return (
    <button onClick={() => onTap(slot)} className="w-full h-full flex items-center justify-center">
      {body}
    </button>
  )
}


function moduleConfigForSlot(
  module: ModuleKey,
  slot: number,
  cells: Record<number, ModuleKey | null>,
  modulesJson: Record<string, unknown>
): Record<string, unknown> {
  const moduleSlots = Object.keys(cells)
    .map(Number)
    .sort((a, b) => a - b)
    .filter((cellSlot) => cells[cellSlot] === module)
  const instanceId = Math.max(1, moduleSlots.indexOf(slot) + 1)
  const raw = modulesJson[module]

  if (Array.isArray(raw)) {
    const exact = raw.find((item) => modulesRecordFromUnknown(item).id === instanceId)
    return modulesRecordFromUnknown(exact ?? raw[instanceId - 1])
  }

  return modulesRecordFromUnknown(raw)
}

function frameModuleDetail(
  module: ModuleKey,
  slot: number,
  modulesJson: Record<string, unknown>,
  language: AppLanguage,
  cells: Record<number, ModuleKey | null>
): { primary: string; secondary?: string; tertiary?: string } {
  const cfg = moduleConfigForSlot(module, slot, cells, modulesJson)
  const t = tx(language)

  if (module === 'date') {
    return {
      primary: new Intl.DateTimeFormat(language === 'no' ? 'nb-NO' : 'en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(new Date()),
      secondary: language === 'no' ? 'Dato' : 'Date',
    }
  }

  if (module === 'weather') {
    const label = String(cfg.label ?? '').trim()
    return { primary: t.modules.weather, secondary: label || (language === 'no' ? 'Lagret sted' : 'Saved location') }
  }

  if (module === 'surf') {
    const spot = String(cfg.spot ?? cfg.label ?? '').trim()
    return { primary: t.modules.surf, secondary: spot || (language === 'no' ? 'Lagret spot' : 'Saved spot') }
  }

  if (module === 'soccer') {
    const team = String(cfg.teamName ?? cfg.team ?? '').trim()
    const competition = String(cfg.competitionName ?? '').trim()
    return { primary: team || t.modules.soccer, secondary: competition || (language === 'no' ? 'Lagret lag' : 'Saved team') }
  }

  if (module === 'stocks') {
    const symbol = String(cfg.symbol ?? '').trim().toUpperCase()
    const name = String(cfg.name ?? '').trim()
    return { primary: symbol || t.modules.stocks, secondary: name || (language === 'no' ? 'Lagret investering' : 'Saved investment') }
  }

  if (module === 'groceries') {
    return { primary: t.modules.groceries, secondary: language === 'no' ? 'Synkronisert med frame' : 'Synced with frame' }
  }

  if (module === 'countdown') {
    const title = String(cfg.title ?? cfg.name ?? '').trim()
    return { primary: title || t.modules.countdown, secondary: language === 'no' ? 'Lagret nedtelling' : 'Saved countdown' }
  }

  if (module === 'reminders') {
    return { primary: t.modules.reminders, secondary: language === 'no' ? 'Lagrede påminnelser' : 'Saved reminders' }
  }

  return { primary: moduleLabel(language, module) }
}


function formatSmallMirrorDate(language: AppLanguage) {
  const locale = language === 'no' ? 'nb-NO' : 'en-US'
  const now = new Date()
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(now)
  const month = new Intl.DateTimeFormat(locale, { month: 'short' }).format(now)

  return `${weekday} ${now.getDate()}. ${month}`
}

function mirrorMediumDateParts(language: AppLanguage) {
  const locale = language === 'no' ? 'nb-NO' : 'en-US'
  const now = new Date()
  const month = new Intl.DateTimeFormat(locale, { month: 'long' }).format(now)
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(now)

  return {
    year: String(now.getFullYear()),
    month: month.toLocaleUpperCase(locale),
    day: String(now.getDate()),
    weekday: weekday.toLocaleUpperCase(locale),
  }
}

const MIRROR_CALENDAR_WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function mirrorCalendarDays(now = new Date(), monthOffset = 0) {
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const year = target.getFullYear()
  const month = target.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const mondayFirstOffset = (new Date(year, month, 1).getDay() + 6) % 7
  const usedRows = Math.min(6, Math.max(4, Math.ceil((mondayFirstOffset + daysInMonth) / 7)))

  return {
    days: [
      ...Array.from({ length: mondayFirstOffset }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ],
    usedRows,
  }
}

function mirrorIsoWeekNumber(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month, day))
  const weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - weekday)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}


function formatMirrorCountdownTimeLeftLong(days: number) {
  if (days <= 0) return 'today'

  const years = Math.floor(days / 365)
  const rem = days % 365
  const months = Math.floor(rem / 30)
  const d = rem % 30

  if (years > 0) {
    let text = `${years} ${years === 1 ? 'year' : 'years'}`
    if (months > 0) text += ` and ${months} ${months === 1 ? 'month' : 'months'}`
    else if (d > 0) text += ` and ${d} ${d === 1 ? 'day' : 'days'}`
    return text
  }

  if (months > 0) {
    let text = `${months} ${months === 1 ? 'month' : 'months'}`
    if (d > 0) text += ` and ${d} ${d === 1 ? 'day' : 'days'}`
    return text
  }

  return `${d} ${d === 1 ? 'day' : 'days'}`
}

type MirrorCountdownTemplate =
  | 'onlyUntil'
  | 'in'
  | 'leftToGo'
  | 'countingTo'
  | 'isIn'
  | 'comingUp'
  | 'nextStop'
  | 'notLongNow'
  | 'bigDay'
  | 'almostThere'
  | 'lastStretch'
  | 'soonNow'
  | 'closeNow'

function pickMirrorCountdownTemplate(daysLeft: number, now = new Date()): MirrorCountdownTemplate {
  const rotation = Math.floor(now.getTime() / (4 * 60 * 60 * 1000))
  const farSet: MirrorCountdownTemplate[] = ['onlyUntil', 'in', 'leftToGo', 'countingTo', 'isIn', 'comingUp', 'nextStop']
  const midSet: MirrorCountdownTemplate[] = ['onlyUntil', 'in', 'leftToGo', 'countingTo', 'isIn', 'comingUp', 'notLongNow', 'bigDay']
  const nearSet: MirrorCountdownTemplate[] = ['onlyUntil', 'in', 'almostThere', 'soonNow', 'lastStretch', 'closeNow', 'bigDay', 'notLongNow']
  const set = daysLeft <= 7 ? nearSet : daysLeft <= 45 ? midSet : farSet
  return set[((rotation % set.length) + set.length) % set.length]
}

function buildSmallMirrorCountdownLine(title: string, daysLeft: number) {
  const cleanTitle = title.trim() || 'COUNTDOWN'
  const timeLong = formatMirrorCountdownTimeLeftLong(daysLeft)

  if (daysLeft <= 0) return `${cleanTitle} today`

  switch (pickMirrorCountdownTemplate(daysLeft)) {
    case 'onlyUntil':
      return `Only ${timeLong} until ${cleanTitle}`
    case 'in':
      return `${cleanTitle} in ${timeLong}`
    case 'leftToGo':
      return `${timeLong} left to ${cleanTitle}`
    case 'countingTo':
      return `Counting to ${cleanTitle} in ${timeLong}`
    case 'isIn':
      return `${cleanTitle} is in ${timeLong}`
    case 'comingUp':
      return `${cleanTitle} coming up in ${timeLong}`
    case 'nextStop':
      return `Next stop ${cleanTitle} in ${timeLong}`
    case 'notLongNow':
      return `Not long now ${timeLong} until ${cleanTitle}`
    case 'bigDay':
      return `Big day ${cleanTitle} in ${timeLong}`
    case 'almostThere':
      return `Almost there ${timeLong} to ${cleanTitle}`
    case 'soonNow':
      return `${cleanTitle} soon ${timeLong}`
    case 'lastStretch':
      return `Last stretch - ${timeLong} until ${cleanTitle}`
    case 'closeNow':
    default:
      return `${cleanTitle} in ${timeLong}`
  }
}

function formatMirrorCountdownDaysNumber(days: number) {
  return String(Math.max(0, days))
}

function formatMirrorCountdownDaysUnit(days: number) {
  return days === 1 ? 'DAG' : 'DAGER'
}


const MIRROR_MODULE_HEADER_CLASS = "max-w-full shrink-0 truncate border-b border-current px-[clamp(0.24rem,0.72vw,0.55rem)] pb-[clamp(0.06rem,0.18vw,0.12rem)] text-[clamp(0.72rem,1.75vw,1.08rem)] font-medium leading-none tracking-[0.12em] uppercase"

function MirrorModuleHeader({
  title,
  className = '',
  style,
}: {
  title: string
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div className={`${MIRROR_MODULE_HEADER_CLASS}${className ? ` ${className}` : ''}`} style={style} title={title}>
      {title}
    </div>
  )
}

function parseMirrorCountdownDate(date: string | undefined) {
  const match = typeof date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date) : null
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  return new Date(year, month - 1, day)
}

function mirrorCountdownWeekdayName(date: Date) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date)
}

function formatMirrorCountdownShortStatus(daysLeft: number) {
  if (daysLeft <= 0) return 'Today'
  if (daysLeft === 1) return 'Tomorrow'
  return `In ${daysLeft} days`
}

function formatMirrorCountdownMediumBadge(daysLeft: number, targetDate: string | undefined) {
  if (daysLeft <= 0) return 'Today'
  if (daysLeft === 1) return 'Tomorrow'

  const date = parseMirrorCountdownDate(targetDate)
  if (!date) return formatMirrorCountdownShortStatus(daysLeft)

  const weekday = mirrorCountdownWeekdayName(date)

  if (daysLeft <= 6) return weekday
  if (daysLeft <= 13) return `Next ${weekday}`
  if (daysLeft === 14) return 'In 2 weeks'
  if (daysLeft === 21) return 'In 3 weeks'
  if (daysLeft === 28) return 'In 4 weeks'
  if (daysLeft < 30) return `In ${daysLeft} days`
  if (daysLeft < 60) return 'Next month'

  return formatMirrorCountdownShortStatus(daysLeft)
}

function formatMirrorCountdownUpcomingStatus(daysLeft: number, targetDate: string | undefined) {
  if (daysLeft <= 0) return 'Today'
  if (daysLeft === 1) return 'Tomorrow'

  const date = parseMirrorCountdownDate(targetDate)

  if (daysLeft <= 13) {
    if (!date) return `${daysLeft} days`
    const weekday = mirrorCountdownWeekdayName(date)
    return daysLeft <= 6 ? weekday : `Next ${weekday}`
  }

  if (daysLeft === 14) return 'In 2 weeks'

  return `${daysLeft} days`
}

function formatMirrorCountdownUpcomingLine(item: { title: string; targetDate?: string; daysLeft: number }) {
  return `${item.title} - ${formatMirrorCountdownUpcomingStatus(item.daysLeft, item.targetDate)}`
}

function mirrorCountdownYmdNumber(year: number, month: number, day: number) {
  return year * 10000 + (month + 1) * 100 + day
}

function mirrorCountdownTargetParts(targetDate: string | undefined) {
  const date = parseMirrorCountdownDate(targetDate)
  if (!date) return null
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
  }
}

function MirrorCountdownDayMarker({ kind }: { kind: 'crossed' | 'target' }) {
  if (kind === 'target') {
    return (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-[clamp(0.02rem,0.1vw,0.08rem)] rounded-full border-[clamp(0.12rem,0.34vw,0.22rem)] border-current"
      />
    )
  }

  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span className="absolute h-[clamp(0.12rem,0.34vw,0.22rem)] w-[88%] rotate-45 rounded-full bg-current" />
      <span className="absolute h-[clamp(0.12rem,0.34vw,0.22rem)] w-[88%] -rotate-45 rounded-full bg-current" />
    </span>
  )
}

function MirrorCountdownCalendarMonth({
  textColor,
  targetDate,
  monthOffset = 0,
  showWeekdays = true,
}: {
  textColor: string
  targetDate?: string
  monthOffset?: number
  showWeekdays?: boolean
}) {
  const now = new Date()
  const targetMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const { days, usedRows } = mirrorCalendarDays(now, monthOffset)
  const target = mirrorCountdownTargetParts(targetDate)
  const todayKey = mirrorCountdownYmdNumber(now.getFullYear(), now.getMonth(), now.getDate())
  const targetKey = target ? mirrorCountdownYmdNumber(target.year, target.month, target.day) : null
  const monthTitle = new Intl.DateTimeFormat('en-US', { month: 'long' }).format(targetMonth)
  const year = targetMonth.getFullYear()
  const month = targetMonth.getMonth()

  return (
    <div className="flex h-full w-full min-w-0 items-center justify-center overflow-hidden px-[clamp(0.3rem,0.82vw,0.55rem)] py-[clamp(0.26rem,0.72vw,0.48rem)] leading-none">
      <div className="grid h-full max-h-[min(100%,11.25rem)] w-full max-w-[min(100%,15.8rem)] grid-rows-[auto_auto_1fr] gap-[clamp(0.16rem,0.46vw,0.34rem)]">
        <div className="min-w-0 truncate text-center text-[clamp(0.68rem,1.55vw,1rem)] font-bold tracking-[0.08em]">
          {monthTitle}
        </div>

        {showWeekdays ? (
          <div className="grid grid-cols-7 gap-x-[clamp(0.1rem,0.5vw,0.36rem)] text-center text-[clamp(0.54rem,1.18vw,0.78rem)] font-bold tracking-[0.1em]">
            {MIRROR_CALENDAR_WEEKDAYS.map((weekday) => (
              <div key={weekday} className="opacity-80">
                {weekday}
              </div>
            ))}
          </div>
        ) : (
          <div aria-hidden="true" className="h-0" />
        )}

        <div
          className="grid min-h-0 grid-cols-7 items-center gap-x-[clamp(0.1rem,0.5vw,0.36rem)] gap-y-[clamp(0.1rem,0.48vw,0.32rem)] text-center text-[clamp(0.72rem,1.72vw,1.12rem)] font-semibold tracking-[0.02em]"
          style={{ gridTemplateRows: `repeat(${usedRows}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: usedRows * 7 }).map((_, index) => {
            const day = days[index] ?? null
            const dayKey = day == null ? null : mirrorCountdownYmdNumber(year, month, day)
            const isTarget = !!target && target.year === year && target.month === month && target.day === day
            const isCrossed = dayKey !== null && targetKey !== null && dayKey < todayKey && dayKey < targetKey

            return (
              <div key={index} className="flex min-h-0 items-center justify-center">
                {day == null ? null : (
                  <span
                    className="relative flex aspect-square h-[clamp(1.24rem,3.35vw,2.12rem)] items-center justify-center"
                    style={{ color: textColor, opacity: 0.9 }}
                  >
                    <span className="relative z-10">{day}</span>
                    {isCrossed ? <MirrorCountdownDayMarker kind="crossed" /> : null}
                    {isTarget ? <MirrorCountdownDayMarker kind="target" /> : null}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MirrorMediumCountdownCard({
  detail,
  fallbackTitle,
}: {
  detail: MirrorModuleDetail
  fallbackTitle: string
}) {
  const title = detail.countdownTitle || detail.primary || fallbackTitle || 'COUNTDOWN'
  const daysLeft = typeof detail.countdownDaysLeft === 'number' ? detail.countdownDaysLeft : null

  if (daysLeft === null) {
    return (
      <div className="flex h-full w-full items-center justify-center px-4 text-center leading-tight">
        <MirrorModuleHeader title={title} />
      </div>
    )
  }

  const daysNumber = formatMirrorCountdownDaysNumber(daysLeft)
  const daysUnit = formatMirrorCountdownDaysUnit(daysLeft)
  const badge = formatMirrorCountdownMediumBadge(daysLeft, detail.countdownTargetDate)

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden px-[clamp(0.5rem,1.45vw,0.95rem)] py-[clamp(0.45rem,1.2vw,0.8rem)] text-center leading-none">
      <div className="flex max-h-full w-full flex-col items-center justify-center gap-[clamp(0.42rem,1.22vw,0.72rem)] overflow-hidden">
        <MirrorModuleHeader title={title} />

        <div className="max-w-full shrink-0 truncate text-[clamp(2.2rem,7.4vw,4.8rem)] font-semibold tracking-[-0.06em]" title={daysNumber}>
          {daysNumber}
        </div>

        <div className="max-w-full shrink-0 truncate text-[clamp(0.58rem,1.34vw,0.86rem)] font-semibold tracking-[0.16em]" title={daysUnit}>
          {daysUnit}
        </div>

        <div
          className="max-w-[calc(100%-clamp(0.7rem,2vw,1.2rem))] shrink-0 truncate bg-white px-[clamp(0.78rem,2.1vw,1.25rem)] py-[clamp(0.36rem,0.92vw,0.62rem)] text-[clamp(0.72rem,1.65vw,1.08rem)] font-semibold tracking-[0.08em] text-black"
          title={badge}
        >
          {badge}
        </div>
      </div>
    </div>
  )
}

function MirrorLargeCountdownCard({
  detail,
  fallbackTitle,
}: {
  detail: MirrorModuleDetail
  fallbackTitle: string
}) {
  const upcoming = Array.isArray(detail.countdownUpcoming) ? detail.countdownUpcoming : []

  return (
    <div className="grid h-full w-full grid-cols-[1fr_1fr] gap-[clamp(0.45rem,1.45vw,0.95rem)] overflow-hidden">
      <div className="min-w-0 overflow-hidden">
        <MirrorMediumCountdownCard detail={detail} fallbackTitle={fallbackTitle} />
      </div>

      <div className="flex min-w-0 items-center justify-center overflow-hidden px-[clamp(0.25rem,0.75vw,0.5rem)] py-[clamp(0.45rem,1.2vw,0.8rem)] text-center leading-none">
        {upcoming.length === 0 ? (
          <div className="max-w-full truncate text-[clamp(0.78rem,1.8vw,1.18rem)] font-semibold tracking-[0.08em]">
            No more events
          </div>
        ) : (
          <div className="flex max-h-full max-w-full flex-col items-stretch justify-center overflow-hidden">
            <div className="mb-[clamp(0.42rem,1.22vw,0.72rem)] flex shrink-0 justify-center">
              <MirrorModuleHeader title="COMING UP" />
            </div>

            <div className="flex max-w-full flex-col gap-[clamp(0.48rem,1.45vw,0.9rem)] overflow-hidden text-left">
              {upcoming.map((item, index) => {
                const line = formatMirrorCountdownUpcomingLine(item)

                return (
                  <div key={`${item.targetDate}-${item.title}-${index}`} className="flex min-w-0 items-center gap-[clamp(0.34rem,0.9vw,0.55rem)]" title={line}>
                    <span className="h-[clamp(0.28rem,0.7vw,0.42rem)] w-[clamp(0.28rem,0.7vw,0.42rem)] shrink-0 rounded-full bg-current" aria-hidden="true" />
                    <span className="min-w-0 truncate text-[clamp(0.58rem,1.34vw,0.86rem)] font-semibold tracking-[0.04em]">
                      {line}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MirrorXLCountdownCard({
  detail,
  fallbackTitle,
  textColor,
}: {
  detail: MirrorModuleDetail
  fallbackTitle: string
  textColor: string
}) {
  const upcoming = Array.isArray(detail.countdownUpcoming) ? detail.countdownUpcoming : []

  return (
    <div className="grid h-full w-full grid-cols-[1fr_1fr] grid-rows-[1fr_1fr] gap-[clamp(0.52rem,1.55vw,0.9rem)] overflow-hidden">
      <div className="min-h-0 min-w-0 overflow-hidden">
        <MirrorMediumCountdownCard detail={detail} fallbackTitle={fallbackTitle} />
      </div>

      <div className="min-h-0 min-w-0 overflow-hidden">
        <MirrorCountdownCalendarMonth textColor={textColor} targetDate={detail.countdownTargetDate} showWeekdays />
      </div>

      <div className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden px-[clamp(0.25rem,0.75vw,0.5rem)] py-[clamp(0.45rem,1.2vw,0.8rem)] text-center leading-none">
        {upcoming.length === 0 ? (
          <div className="max-w-full truncate text-[clamp(0.78rem,1.8vw,1.18rem)] font-semibold tracking-[0.08em]">
            No more events
          </div>
        ) : (
          <div className="flex max-h-full max-w-full flex-col items-stretch justify-center overflow-hidden">
            <div className="mb-[clamp(0.42rem,1.22vw,0.72rem)] flex shrink-0 justify-center">
              <MirrorModuleHeader title="COMING UP" />
            </div>

            <div className="flex max-w-full flex-col gap-[clamp(0.48rem,1.45vw,0.9rem)] overflow-hidden text-left">
              {upcoming.map((item, index) => {
                const line = formatMirrorCountdownUpcomingLine(item)

                return (
                  <div key={`${item.targetDate}-${item.title}-${index}`} className="flex min-w-0 items-center gap-[clamp(0.34rem,0.9vw,0.55rem)]" title={line}>
                    <span className="h-[clamp(0.28rem,0.7vw,0.42rem)] w-[clamp(0.28rem,0.7vw,0.42rem)] shrink-0 rounded-full bg-current" aria-hidden="true" />
                    <span className="min-w-0 truncate text-[clamp(0.58rem,1.34vw,0.86rem)] font-semibold tracking-[0.04em]">
                      {line}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="min-h-0 min-w-0 overflow-hidden">
        <MirrorCountdownCalendarMonth textColor={textColor} targetDate={detail.countdownTargetDate} monthOffset={1} showWeekdays={false} />
      </div>
    </div>
  )
}

function MirrorMediumDateCard({
  language,
  textColor,
  frameBackground,
}: {
  language: AppLanguage
  textColor: string
  frameBackground: string
}) {
  const dateParts = mirrorMediumDateParts(language)

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden px-[clamp(0.42rem,1.15vw,0.72rem)] py-[clamp(0.28rem,0.76vw,0.52rem)] text-center leading-none">
      <div className="flex h-full max-h-[min(100%,10.35rem)] w-full max-w-[min(100%,8.4rem)] flex-col items-stretch overflow-hidden bg-transparent">
        <div className="flex shrink-0 items-center justify-center px-[clamp(0.26rem,0.75vw,0.5rem)] py-[clamp(0.12rem,0.32vw,0.22rem)] text-[clamp(0.48rem,1.15vw,0.72rem)] font-medium tracking-[0.32em] opacity-75">
          {dateParts.year}
        </div>

        <div className="flex shrink-0 items-center justify-center px-[clamp(0.28rem,0.8vw,0.52rem)] pt-[clamp(0.18rem,0.5vw,0.34rem)] text-[clamp(0.72rem,1.8vw,1.08rem)] font-bold tracking-[0.12em]">
          <span className="max-w-full truncate">{dateParts.month}</span>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center px-[clamp(0.3rem,0.86vw,0.56rem)] text-[clamp(2.25rem,6.8vw,4.35rem)] font-semibold tracking-[-0.08em]">
          {dateParts.day}
        </div>

        <div
          className="flex min-h-[clamp(1.28rem,3.05vw,1.9rem)] shrink-0 items-center justify-center px-[clamp(0.3rem,0.86vw,0.56rem)] py-[clamp(0.28rem,0.72vw,0.5rem)] text-[clamp(0.55rem,1.32vw,0.82rem)] font-bold tracking-[0.18em]"
          style={{ backgroundColor: textColor, color: frameBackground }}
        >
          <span className="max-w-full truncate">{dateParts.weekday}</span>
        </div>
      </div>
    </div>
  )
}

function ymdKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function mirrorHolidaysFromConfig(cfg: Record<string, unknown>): MirrorHoliday[] {
  const raw = Array.isArray(cfg.holidays) ? cfg.holidays : []
  return raw
    .map((item) => {
      const record = modulesRecordFromUnknown(item)
      const date = String(record.date ?? '').slice(0, 10)
      const name = String(record.name ?? '').trim()
      return date && name ? { date, name } : null
    })
    .filter((item): item is MirrorHoliday => !!item)
    .sort((a, b) => a.date.localeCompare(b.date))
}

function isMirrorHoliday(holidays: MirrorHoliday[], year: number, month: number, day: number) {
  const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return holidays.some((holiday) => holiday.date === date)
}

function upcomingMirrorHolidays(holidays: MirrorHoliday[], today = new Date()) {
  const todayKey = ymdKey(today)
  const seenDates = new Set<string>()

  return holidays.filter((holiday) => {
    if (holiday.date < todayKey || seenDates.has(holiday.date)) return false
    seenDates.add(holiday.date)
    return true
  }).slice(0, 5)
}

function formatMirrorHolidayDate(date: string) {
  const [, month = '', day = ''] = date.split('-')
  return `${day.padStart(2, '0')}.${month.padStart(2, '0')}`
}

function MirrorMonthCalendar({
  textColor,
  language,
  monthOffset = 0,
  holidays = [],
  showHolidayDots = false,
  highlightDates = [],
  showMonthTitle = true,
  showWeekNumbers = false,
}: {
  textColor: string
  language: AppLanguage
  monthOffset?: number
  holidays?: MirrorHoliday[]
  showHolidayDots?: boolean
  highlightDates?: string[]
  showMonthTitle?: boolean
  showWeekNumbers?: boolean
}) {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const today = monthOffset === 0 ? now.getDate() : -1
  const { days, usedRows } = mirrorCalendarDays(now, monthOffset)
  const locale = language === 'no' ? 'nb-NO' : 'en-US'
  const monthTitle = new Intl.DateTimeFormat(locale, { month: 'long' }).format(target).toLocaleUpperCase(locale)
  const year = target.getFullYear()
  const month = target.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const highlightedDateCounts = highlightDates.reduce<Record<string, number>>((acc, date) => {
    const key = String(date).slice(0, 10)
    if (key) acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="flex h-full w-full min-w-0 translate-y-[clamp(0.18rem,0.62vw,0.42rem)] items-center justify-center overflow-hidden px-0 py-[clamp(0.16rem,0.44vw,0.32rem)] leading-none">
      <div className="grid h-full max-h-[min(90%,11.1rem)] w-full max-w-[min(100%,15.8rem)] grid-rows-[auto_auto_1fr] gap-[clamp(0.18rem,0.5vw,0.38rem)]">
        {showMonthTitle ? (
          <div className="min-w-0 truncate text-center text-[clamp(0.68rem,1.55vw,1rem)] font-bold tracking-[0.14em]">
            {monthTitle}
          </div>
        ) : (
          <div aria-hidden="true" className="h-0" />
        )}

        <div
          className="grid gap-x-[clamp(0.1rem,0.5vw,0.36rem)] text-center text-[clamp(0.54rem,1.18vw,0.78rem)] font-bold tracking-[0.1em]"
          style={{ gridTemplateColumns: `${showWeekNumbers ? 'minmax(1.15rem, 0.52fr) ' : ''}repeat(7, minmax(0, 1fr))` }}
        >
          {showWeekNumbers ? <div aria-hidden="true" /> : null}
          {MIRROR_CALENDAR_WEEKDAYS.map((weekday, index) => (
            <div key={weekday} className={index >= 5 ? 'opacity-45' : 'opacity-80'}>
              {weekday}
            </div>
          ))}
        </div>

        <div
          className="grid min-h-0 items-center gap-x-[clamp(0.1rem,0.5vw,0.36rem)] gap-y-[clamp(0.1rem,0.48vw,0.32rem)] text-center text-[clamp(0.72rem,1.72vw,1.12rem)] font-semibold tracking-[0.02em]"
          style={{
            gridTemplateColumns: `${showWeekNumbers ? 'minmax(1.15rem, 0.52fr) ' : ''}repeat(7, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${usedRows}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: usedRows }).map((_, rowIndex) => {
            const rowStart = rowIndex * 7
            const rowDays = days.slice(rowStart, rowStart + 7)
            const numberedRowDays = rowDays.filter((day): day is number => day != null)
            const sampleDay = Math.min(daysInMonth, Math.max(1, numberedRowDays[0] ?? 1))

            return (
              <React.Fragment key={`calendar-row-${rowIndex}`}>
                {showWeekNumbers ? (
                  <div className="flex min-h-0 items-center justify-center border-r border-current pr-[clamp(0.12rem,0.34vw,0.22rem)] text-[clamp(0.52rem,1.12vw,0.74rem)] opacity-70">
                    {numberedRowDays.length > 0 ? mirrorIsoWeekNumber(year, month, sampleDay) : null}
                  </div>
                ) : null}

                {rowDays.map((day, weekdayIndex) => {
                  const isWeekend = weekdayIndex >= 5
                  const isToday = day === today
                  const dateKey = day == null ? '' : `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const isHoliday = day != null && showHolidayDots && isMirrorHoliday(holidays, target.getFullYear(), target.getMonth(), day)
                  const highlightCount = day == null ? 0 : Math.min(3, highlightedDateCounts[dateKey] ?? 0)
                  const isHighlighted = highlightCount > 0

                  return (
                    <div key={`${rowIndex}-${weekdayIndex}`} className="flex min-h-0 items-center justify-center">
                      {day == null ? null : (
                        <span
                          className="relative flex aspect-square h-[clamp(1.24rem,3.35vw,2.12rem)] items-center justify-center rounded-full"
                          style={{
                            backgroundColor: isToday ? '#ffffff' : 'transparent',
                            color: isToday ? '#061b24' : textColor,
                            opacity: isToday ? 1 : isWeekend ? 0.42 : 0.88,
                          }}
                        >
                          {day}
                          {isHoliday || isHighlighted ? (
                            <span aria-hidden="true" className="absolute bottom-[clamp(0.1rem,0.32vw,0.2rem)] flex items-center justify-center gap-[clamp(0.05rem,0.16vw,0.1rem)]">
                              {Array.from({ length: isHighlighted ? highlightCount : 1 }).map((_, dotIndex) => (
                                <span
                                  key={dotIndex}
                                  className="h-[clamp(0.1rem,0.3vw,0.2rem)] w-[clamp(0.1rem,0.3vw,0.2rem)] rounded-full"
                                  style={{ backgroundColor: isToday ? '#061b24' : textColor }}
                                />
                              ))}
                            </span>
                          ) : null}
                        </span>
                      )}
                    </div>
                  )
                })}
              </React.Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}


function MirrorHolidayList({ holidays, language }: { holidays: MirrorHoliday[]; language: AppLanguage }) {
  const upcoming = upcomingMirrorHolidays(holidays)
  const emptyLabel = language === 'no' ? 'Ingen helligdager' : 'No holidays'

  if (upcoming.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-hidden px-[clamp(0.8rem,2vw,1.6rem)] text-center text-[clamp(0.76rem,1.9vw,1.2rem)] font-semibold tracking-[0.08em] opacity-75">
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden px-[clamp(0.8rem,2vw,1.6rem)] py-[clamp(0.75rem,1.9vw,1.45rem)]">
      <div className="grid w-fit max-w-full gap-[clamp(0.22rem,0.65vw,0.42rem)]">
        {upcoming.map((holiday) => (
          <div key={`${holiday.date}-${holiday.name}`} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-[clamp(0.5rem,1.45vw,1rem)] leading-none">
            <div className="shrink-0 text-[clamp(0.56rem,1.35vw,0.86rem)] font-medium tracking-[0.08em] opacity-80">
              {formatMirrorHolidayDate(holiday.date)}
            </div>
            <div className="min-w-0 truncate text-[clamp(0.7rem,1.8vw,1.16rem)] font-semibold tracking-[0.02em]">
              {holiday.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MirrorXLDateView({
  language,
  textColor,
  frameBackground,
  holidays,
}: {
  language: AppLanguage
  textColor: string
  frameBackground: string
  holidays: MirrorHoliday[]
}) {
  return (
    <div className="grid h-full w-full grid-rows-[1fr_1fr] gap-[clamp(0.52rem,1.55vw,0.9rem)] overflow-hidden">
      <div className="grid min-h-0 grid-cols-[0.42fr_0.58fr] gap-[clamp(0.52rem,1.55vw,0.9rem)] overflow-hidden">
        <div className="min-w-0 overflow-hidden">
          <MirrorMediumDateCard language={language} textColor={textColor} frameBackground={frameBackground} />
        </div>
        <div className="min-w-0 overflow-hidden">
          <MirrorMonthCalendar textColor={textColor} language={language} holidays={holidays} showHolidayDots />
        </div>
      </div>

      <div className="grid min-h-0 grid-cols-[0.42fr_0.58fr] gap-[clamp(0.52rem,1.55vw,0.9rem)] overflow-hidden">
        <div className="min-w-0 overflow-hidden">
          <MirrorHolidayList holidays={holidays} language={language} />
        </div>
        <div className="min-w-0 overflow-hidden">
          <MirrorMonthCalendar textColor={textColor} language={language} monthOffset={1} holidays={holidays} showHolidayDots />
        </div>
      </div>
    </div>
  )
}

function mirrorSurfRatingWord(rating: number | undefined) {
  switch (Math.round(Number(rating))) {
    case 1: return 'Flat'
    case 2: return 'Poor'
    case 3: return 'Poor to Fair'
    case 4: return 'Fair'
    case 5: return 'Good'
    case 6: return 'Legendary'
    default: return '--'
  }
}

type MirrorSurfTrend = { symbol: '↑' | '−' | '↓'; label: string }

function mirrorOsloHour(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo',
    hour: '2-digit',
    hour12: false,
  }).format(now))

  return Number.isFinite(hour) ? hour : now.getHours()
}

function mirrorCurrentSurfDaypartIndex(now = new Date()) {
  const hour = mirrorOsloHour(now)
  if (hour >= 21) return 0
  if (hour < 10) return 0
  if (hour < 14) return 1
  if (hour < 18) return 2
  return 3
}

function mirrorSurfTrend(detail: MirrorModuleDetail): MirrorSurfTrend | null {
  const rawDayparts = Array.isArray(detail.surfDayparts) ? detail.surfDayparts : []
  const dayparts = rawDayparts
    .map((part, index) => normalizeMirrorLargeSurfDaypart(part, `Daypart ${index + 1}`))
    .filter((part) => part.rating !== undefined)

  if (dayparts.length <= 1) return null

  const currentIndex = Math.min(mirrorCurrentSurfDaypartIndex(), dayparts.length - 1)
  const fromIndex = currentIndex >= dayparts.length - 1 ? dayparts.length - 2 : currentIndex
  const toIndex = Math.min(fromIndex + 1, dayparts.length - 1)
  const fromRating = dayparts[fromIndex]?.rating ?? finiteMirrorNumber(detail.rating ?? detail.primary)
  const compareRating = dayparts[toIndex]?.rating

  if (fromRating === undefined || compareRating === undefined) return null

  const delta = compareRating - fromRating
  if (delta >= 0.5) return { symbol: '↑', label: 'Surf trend: improving' }
  if (delta <= -0.5) return { symbol: '↓', label: 'Surf trend: worsening' }
  return { symbol: '−', label: 'Surf trend: staying steady' }
}

const MIRROR_GROCERIES_EMPTY_MESSAGES: Record<AppLanguage, string[]> = {
  en: ['Fridge is stacked', 'Kitchen looks good', 'Nothing needed', 'Grocery run complete', 'Fully stocked', 'Looking good'],
  no: ['Kjøleskapet er fullt', 'Kjøkkenet ser bra ut', 'Ingenting trengs', 'Handleturen er ferdig', 'Alt er på lager', 'Ser bra ut'],
}

function mirrorGroceriesRotationStep() {
  return Math.floor(Date.now() / (4 * 60 * 60 * 1000))
}

function mirrorGroceriesEmptyMessage(language: AppLanguage) {
  const messages = MIRROR_GROCERIES_EMPTY_MESSAGES[language] ?? MIRROR_GROCERIES_EMPTY_MESSAGES.en
  return messages[mirrorGroceriesRotationStep() % messages.length]
}

function mirrorGroceriesHeader(detail: MirrorModuleDetail, language: AppLanguage) {
  const locale = language === 'no' ? 'nb-NO' : 'en-US'
  const dinnerTitle = typeof detail.dinnerTodayTitle === 'string' ? detail.dinnerTodayTitle.trim() : ''
  if (dinnerTitle) return dinnerTitle.toLocaleUpperCase(locale)
  const listHeader = language === 'no' ? 'Handleliste:' : 'Grocery List:'
  return listHeader.toLocaleUpperCase(locale)
}

function mirrorGroceriesItems(detail: MirrorModuleDetail) {
  const rawItems = Array.isArray(detail.groceryItems) ? detail.groceryItems : []
  return rawItems.map((item) => String(item).trim()).filter(Boolean)
}

function mirrorGroceriesVisibleItems(detail: MirrorModuleDetail, maxVisibleItems = 3) {
  const items = mirrorGroceriesItems(detail)
  const visibleCount = Math.min(items.length, maxVisibleItems)
  if (visibleCount <= 0) return []
  if (items.length <= visibleCount) return items.slice(0, visibleCount)

  const start = mirrorGroceriesRotationStep() % items.length
  return Array.from({ length: visibleCount }, (_, index) => items[(start + index) % items.length])
}

function mirrorGroceriesOverflowLabel(detail: MirrorModuleDetail, language: AppLanguage, maxVisibleItems = 3) {
  const remainingCount = Math.max(0, mirrorGroceriesItems(detail).length - maxVisibleItems)
  if (remainingCount <= 0) return ''

  return language === 'no' ? `+${remainingCount} varer` : `+${remainingCount} items`
}

function mirrorGroceriesUppercase(value: string, language: AppLanguage) {
  const locale = language === 'no' ? 'nb-NO' : 'en-US'
  return value.toLocaleUpperCase(locale)
}

function mirrorGroceriesListHeader(language: AppLanguage) {
  return mirrorGroceriesUppercase(language === 'no' ? 'Handleliste' : 'Grocery List', language)
}

function mirrorGroceriesMediumHeader(detail: MirrorModuleDetail, language: AppLanguage) {
  const dinnerTitle = typeof detail.dinnerTodayTitle === 'string' ? detail.dinnerTodayTitle.trim() : ''
  return mirrorGroceriesUppercase(dinnerTitle || (language === 'no' ? 'Handleliste' : 'Grocery List'), language)
}

function mirrorGroceriesTodayDinnerLabel(language: AppLanguage) {
  return language === 'no' ? 'Middag i dag' : "Today's Dinner"
}

function mirrorGroceriesMediumEmptyLine(language: AppLanguage) {
  return mirrorGroceriesEmptyMessage(language)
}

function mirrorGroceriesRunningLowLine(name: string, label: string) {
  const normalizedLabel = label.trim().toLocaleLowerCase()
  return normalizedLabel ? `${name} · ${normalizedLabel}` : name
}

function mirrorGroceriesRunningLow(detail: MirrorModuleDetail) {
  const rawItems = Array.isArray(detail.groceryRunningLow) ? detail.groceryRunningLow : []
  return rawItems
    .map((item) => ({
      name: String(item?.name ?? '').trim(),
      label: String(item?.label ?? '').trim(),
    }))
    .filter((item) => item.name)
    .slice(0, 3)
}

function mirrorGroceriesMealIdeas(detail: MirrorModuleDetail) {
  const rawItems = Array.isArray(detail.groceryMealIdeas) ? detail.groceryMealIdeas : []
  return rawItems
    .map((item) => ({
      name: String(item?.name ?? '').trim(),
      missing: Array.isArray(item?.missing) ? item.missing.map((value) => String(value).trim()).filter(Boolean).slice(0, 2) : [],
    }))
    .filter((item) => item.name)
    .slice(0, 2)
}

function mirrorGroceriesDinnerPlan(detail: MirrorModuleDetail) {
  const rawItems = Array.isArray(detail.groceryDinnerPlan) ? detail.groceryDinnerPlan : []
  return rawItems
    .map((item) => ({
      date: String(item?.date ?? '').slice(0, 10),
      title: String(item?.title ?? '').trim(),
    }))
    .filter((item) => item.date && item.title)
    .slice(0, 7)
}

function mirrorGroceriesDinnerDayLabel(date: string, language: AppLanguage) {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date.slice(5)
  const locale = language === 'no' ? 'nb-NO' : 'en-US'
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(parsed).replace('.', '')
}

function mirrorGroceriesMediumEmptyInsight(detail: MirrorModuleDetail, language: AppLanguage) {
  const runningLow = mirrorGroceriesRunningLow(detail)
  if (runningLow.length > 0) {
    return {
      title: language === 'no' ? 'Snart lite av' : 'Might be low on',
      lines: runningLow.map((item) => mirrorGroceriesRunningLowLine(item.name, item.label)),
    }
  }

  const mealIdeas = mirrorGroceriesMealIdeas(detail)
  if (mealIdeas.length > 0) {
    return {
      title: language === 'no' ? 'Middagstips' : 'Dinner ideas',
      lines: mealIdeas.map((item) => {
        if (item.missing.length <= 0) return item.name
        const missingPrefix = language === 'no' ? 'mangler' : 'missing'
        return `${item.name} (${missingPrefix}: ${item.missing.join(', ')})`
      }),
    }
  }

  return null
}

function MirrorGroceryMediumList({ items, overflowLabel, mutedColor }: { items: string[]; overflowLabel: string; mutedColor: string }) {
  if (items.length <= 0) return null

  if (items.length <= 6) {
    return (
      <div className="flex min-h-0 flex-1 items-start justify-center pt-[clamp(0.36rem,0.9vw,0.58rem)]">
        <div className="flex w-fit max-w-full flex-col items-start gap-[clamp(0.34rem,0.9vw,0.58rem)]">
          {items.map((item, index) => (
            <div key={`${item}-${index}`} className="grid max-w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-[clamp(0.42rem,1.15vw,0.68rem)] text-left leading-none">
              <span className="h-[clamp(0.28rem,0.62vw,0.4rem)] w-[clamp(0.28rem,0.62vw,0.4rem)] rounded-full bg-current" aria-hidden="true" />
              <span className="min-w-0 truncate text-[clamp(0.64rem,1.45vw,0.9rem)] font-medium tracking-[0.045em]" title={item}>
                {item}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const leftCount = Math.ceil(items.length / 2)
  const columns = [items.slice(0, leftCount), items.slice(leftCount)]

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-start pt-[clamp(0.36rem,0.9vw,0.58rem)]">
      <div className="grid min-h-0 w-full grid-cols-2 gap-x-[clamp(0.42rem,1.1vw,0.72rem)]">
        {columns.map((column, columnIndex) => (
          <div key={columnIndex} className="flex min-w-0 justify-center">
            <div className="flex w-fit max-w-full flex-col items-start gap-[clamp(0.34rem,0.9vw,0.58rem)]">
              {column.map((item, index) => (
                <div key={`${item}-${columnIndex}-${index}`} className="grid max-w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-[clamp(0.42rem,1.15vw,0.68rem)] text-left leading-none">
                  <span className="h-[clamp(0.28rem,0.62vw,0.4rem)] w-[clamp(0.28rem,0.62vw,0.4rem)] rounded-full bg-current" aria-hidden="true" />
                  <span className="min-w-0 truncate text-[clamp(0.64rem,1.45vw,0.9rem)] font-medium tracking-[0.045em]" title={item}>
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {overflowLabel && (
        <div className="mt-[clamp(0.34rem,0.9vw,0.58rem)] max-w-full truncate text-center text-[clamp(0.58rem,1.25vw,0.78rem)] font-medium tracking-[0.055em]" style={{ color: mutedColor }} title={overflowLabel}>
          {overflowLabel}
        </div>
      )}
    </div>
  )
}

function MirrorGroceriesHeader({ header }: { header: string }) {
  return <MirrorModuleHeader title={header} />
}

function MirrorGroceriesMediumPanel({
  detail,
  language,
  mutedColor,
  header,
  showDinnerLabel = false,
  showEmptyInsight = true,
}: {
  detail: MirrorModuleDetail
  language: AppLanguage
  mutedColor: string
  header: string
  showDinnerLabel?: boolean
  showEmptyInsight?: boolean
}) {
  const visibleItems = mirrorGroceriesVisibleItems(detail, 12)
  const overflowLabel = mirrorGroceriesOverflowLabel(detail, language, 12)
  const emptyInsight = visibleItems.length <= 0 && showEmptyInsight ? mirrorGroceriesMediumEmptyInsight(detail, language) : null

  return (
    <div className="flex h-full w-full flex-col items-center overflow-hidden text-center leading-none">
      {showDinnerLabel && (
        <div
          className="max-w-full truncate pb-[clamp(0.22rem,0.58vw,0.4rem)] text-[clamp(0.52rem,1.16vw,0.74rem)] font-medium tracking-[0.055em]"
          style={{ color: mutedColor }}
          title={mirrorGroceriesTodayDinnerLabel(language)}
        >
          {mirrorGroceriesTodayDinnerLabel(language)}
        </div>
      )}

      <MirrorGroceriesHeader header={header} />

      {visibleItems.length <= 0 ? (
        emptyInsight ? (
          <div className="mt-[clamp(0.44rem,1.1vw,0.74rem)] flex min-h-0 w-full flex-1 flex-col items-center justify-start gap-[clamp(0.26rem,0.7vw,0.46rem)] overflow-hidden">
            <div className="max-w-full truncate text-[clamp(0.56rem,1.25vw,0.78rem)] font-semibold tracking-[0.075em]" style={{ color: mutedColor }} title={emptyInsight.title}>
              {emptyInsight.title}
            </div>
            <div className="flex max-w-full flex-col items-center gap-[clamp(0.24rem,0.58vw,0.38rem)]">
              {emptyInsight.lines.map((line, index) => (
                <div key={`${line}-${index}`} className="max-w-full truncate text-[clamp(0.62rem,1.4vw,0.88rem)] font-medium tracking-[0.045em]" title={line}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-[clamp(0.48rem,1.25vw,0.82rem)] max-w-full truncate text-[clamp(0.64rem,1.45vw,0.9rem)] font-medium tracking-[0.045em]" style={{ color: mutedColor }} title={mirrorGroceriesMediumEmptyLine(language)}>
            {mirrorGroceriesMediumEmptyLine(language)}
          </div>
        )
      ) : (
        <MirrorGroceryMediumList items={visibleItems} overflowLabel={overflowLabel} mutedColor={mutedColor} />
      )}
    </div>
  )
}

function MirrorGroceriesMediumCard({
  detail,
  language,
  mutedColor,
}: {
  detail: MirrorModuleDetail
  language: AppLanguage
  mutedColor: string
}) {
  const dinnerTitle = typeof detail.dinnerTodayTitle === 'string' ? detail.dinnerTodayTitle.trim() : ''

  return (
    <div className="flex h-full w-full flex-col px-[clamp(0.62rem,1.7vw,1.2rem)] py-[clamp(0.58rem,1.55vw,0.95rem)]">
      <MirrorGroceriesMediumPanel
        detail={detail}
        language={language}
        mutedColor={mutedColor}
        header={mirrorGroceriesMediumHeader(detail, language)}
        showDinnerLabel={dinnerTitle.length > 0}
      />
    </div>
  )
}

function MirrorGroceriesDinnerPlanList({ detail, language, mutedColor }: { detail: MirrorModuleDetail; language: AppLanguage; mutedColor: string }) {
  const plan = mirrorGroceriesDinnerPlan(detail)

  if (plan.length <= 0) {
    return (
      <div className="mt-[clamp(0.48rem,1.25vw,0.82rem)] max-w-full truncate text-[clamp(0.64rem,1.45vw,0.9rem)] font-medium tracking-[0.045em]" style={{ color: mutedColor }}>
        {language === 'no' ? 'Ingen middager planlagt' : 'No dinners planned'}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center pt-[clamp(0.36rem,0.9vw,0.58rem)]">
      <div className="grid w-fit max-w-full grid-cols-[auto_minmax(0,1fr)] gap-x-[clamp(0.52rem,1.25vw,0.84rem)] gap-y-[clamp(0.34rem,0.9vw,0.58rem)] text-left leading-none">
        {plan.map((item, index) => {
          const label = `${mirrorGroceriesDinnerDayLabel(item.date, language)}:`
          return (
            <React.Fragment key={`${item.date}-${item.title}-${index}`}>
              <div className="max-w-full truncate text-[clamp(0.58rem,1.3vw,0.82rem)] font-semibold tracking-[0.05em]" title={label}>
                {label}
              </div>
              <div className="min-w-0 truncate text-[clamp(0.64rem,1.45vw,0.9rem)] font-medium tracking-[0.045em]" title={item.title}>
                {item.title}
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

function MirrorGroceriesLargeCard({
  detail,
  language,
  mutedColor,
}: {
  detail: MirrorModuleDetail
  language: AppLanguage
  mutedColor: string
}) {
  const dinnerTitle = typeof detail.dinnerTodayTitle === 'string' ? detail.dinnerTodayTitle.trim() : ''
  const rightHeader = mirrorGroceriesUppercase(dinnerTitle || (language === 'no' ? 'Ukemeny' : 'Weekly Menu'), language)

  return (
    <div className="grid h-full w-full grid-cols-2 gap-[clamp(0.75rem,2vw,1.4rem)] overflow-hidden px-[clamp(0.62rem,1.7vw,1.2rem)] py-[clamp(0.58rem,1.55vw,0.95rem)]">
      <MirrorGroceriesMediumPanel
        detail={detail}
        language={language}
        mutedColor={mutedColor}
        header={mirrorGroceriesListHeader(language)}
      />

      <div className="flex h-full w-full flex-col items-center overflow-hidden text-center leading-none">
        {dinnerTitle && (
          <div
            className="max-w-full truncate pb-[clamp(0.22rem,0.58vw,0.4rem)] text-[clamp(0.52rem,1.16vw,0.74rem)] font-medium tracking-[0.055em]"
            style={{ color: mutedColor }}
            title={mirrorGroceriesTodayDinnerLabel(language)}
          >
            {mirrorGroceriesTodayDinnerLabel(language)}
          </div>
        )}
        <MirrorGroceriesHeader header={rightHeader} />
        <MirrorGroceriesDinnerPlanList detail={detail} language={language} mutedColor={mutedColor} />
      </div>
    </div>
  )
}

function MirrorGroceriesRunningLowList({ detail, mutedColor, language }: { detail: MirrorModuleDetail; mutedColor: string; language: AppLanguage }) {
  const runningLow = mirrorGroceriesRunningLow(detail)

  if (runningLow.length <= 0) {
    return (
      <div className="mt-[clamp(0.48rem,1.25vw,0.82rem)] max-w-full truncate text-[clamp(0.64rem,1.45vw,0.9rem)] font-medium tracking-[0.045em]" style={{ color: mutedColor }}>
        {language === 'no' ? 'Alt ser bra ut' : 'All stocked'}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center pt-[clamp(0.36rem,0.9vw,0.58rem)]">
      <div className="flex w-fit max-w-full flex-col items-start gap-[clamp(0.34rem,0.9vw,0.58rem)]">
        {runningLow.map((item, index) => {
          const line = mirrorGroceriesRunningLowLine(item.name, item.label)
          return (
            <div key={`${line}-${index}`} className="grid max-w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-[clamp(0.34rem,0.95vw,0.58rem)] text-left leading-none">
              <span className="h-[clamp(0.2rem,0.46vw,0.3rem)] w-[clamp(0.2rem,0.46vw,0.3rem)] rounded-[0.08rem] bg-current opacity-80" aria-hidden="true" />
              <span className="min-w-0 truncate text-[clamp(0.64rem,1.45vw,0.9rem)] font-medium tracking-[0.045em]" title={line}>
                {line}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MirrorGroceriesMealIdeasList({ detail, mutedColor, language }: { detail: MirrorModuleDetail; mutedColor: string; language: AppLanguage }) {
  const mealIdeas = mirrorGroceriesMealIdeas(detail)

  if (mealIdeas.length <= 0) {
    return (
      <div className="mt-[clamp(0.48rem,1.25vw,0.82rem)] flex max-w-full flex-col items-center gap-[clamp(0.24rem,0.58vw,0.38rem)] text-[clamp(0.64rem,1.45vw,0.9rem)] font-medium tracking-[0.045em]" style={{ color: mutedColor }}>
        <div className="max-w-full truncate" title={language === 'no' ? 'Lærer fortsatt kjøkkenet ditt' : 'Still learning your kitchen'}>
          {language === 'no' ? 'Lærer fortsatt kjøkkenet ditt' : 'Still learning your kitchen'}
        </div>
        <div className="max-w-full truncate" title={language === 'no' ? 'Forslag kommer over tid' : 'Suggestions appear over time'}>
          {language === 'no' ? 'Forslag kommer over tid' : 'Suggestions appear over time'}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 items-start justify-center pt-[clamp(0.36rem,0.9vw,0.58rem)]">
      <div className="flex w-fit max-w-full flex-col items-start gap-[clamp(0.54rem,1.28vw,0.9rem)] text-left leading-none">
        {mealIdeas.map((item, index) => {
          const missingLine = item.missing.length > 0 ? `${language === 'no' ? 'mangler' : 'missing'}: ${item.missing.join(', ')}` : ''
          return (
            <div key={`${item.name}-${index}`} className="grid max-w-full grid-cols-[auto_minmax(0,1fr)] gap-x-[clamp(0.42rem,1.15vw,0.68rem)]">
              <span className="mt-[clamp(0.18rem,0.42vw,0.28rem)] h-[clamp(0.28rem,0.62vw,0.4rem)] w-[clamp(0.28rem,0.62vw,0.4rem)] rounded-full bg-current" aria-hidden="true" />
              <div className="min-w-0">
                <div className="truncate text-[clamp(0.64rem,1.45vw,0.9rem)] font-medium tracking-[0.045em]" title={item.name}>
                  {item.name}
                </div>
                {missingLine && (
                  <div className="mt-[clamp(0.16rem,0.42vw,0.28rem)] truncate text-[clamp(0.54rem,1.15vw,0.74rem)] font-medium tracking-[0.04em]" style={{ color: mutedColor }} title={missingLine}>
                    {missingLine}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MirrorGroceriesXLInsightPanel({
  header,
  children,
}: {
  header: string
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full w-full flex-col items-center overflow-hidden text-center leading-none">
      <MirrorGroceriesHeader header={header} />
      {children}
    </div>
  )
}

function MirrorGroceriesXLCard({ detail, language, mutedColor }: { detail: MirrorModuleDetail; language: AppLanguage; mutedColor: string }) {
  const dinnerTitle = typeof detail.dinnerTodayTitle === 'string' ? detail.dinnerTodayTitle.trim() : ''
  const rightHeader = mirrorGroceriesUppercase(dinnerTitle || (language === 'no' ? 'Ukemeny' : 'Weekly Menu'), language)

  return (
    <div className="grid h-full w-full grid-rows-2 gap-[clamp(1.44rem,3.5vw,2.1rem)] overflow-hidden px-[clamp(0.62rem,1.7vw,1.2rem)] py-[clamp(0.58rem,1.55vw,0.95rem)]">
      <div className="grid min-h-0 w-full grid-cols-2 gap-[clamp(0.75rem,2vw,1.4rem)] overflow-hidden">
        <MirrorGroceriesMediumPanel
          detail={detail}
          language={language}
          mutedColor={mutedColor}
          header={mirrorGroceriesListHeader(language)}
          showEmptyInsight={false}
        />

        <div className="flex h-full w-full flex-col items-center overflow-hidden text-center leading-none">
          {dinnerTitle && (
            <div
              className="max-w-full truncate pb-[clamp(0.22rem,0.58vw,0.4rem)] text-[clamp(0.52rem,1.16vw,0.74rem)] font-medium tracking-[0.055em]"
              style={{ color: mutedColor }}
              title={mirrorGroceriesTodayDinnerLabel(language)}
            >
              {mirrorGroceriesTodayDinnerLabel(language)}
            </div>
          )}
          <MirrorGroceriesHeader header={rightHeader} />
          <MirrorGroceriesDinnerPlanList detail={detail} language={language} mutedColor={mutedColor} />
        </div>
      </div>

      <div className="grid min-h-0 w-full grid-cols-2 gap-[clamp(0.95rem,2.35vw,1.65rem)] overflow-hidden">
        <MirrorGroceriesXLInsightPanel header={mirrorGroceriesUppercase(language === 'no' ? 'Snart tom' : 'Running Low', language)}>
          <MirrorGroceriesRunningLowList detail={detail} mutedColor={mutedColor} language={language} />
        </MirrorGroceriesXLInsightPanel>

        <MirrorGroceriesXLInsightPanel header={mirrorGroceriesUppercase(language === 'no' ? 'Middagstips' : 'Meal Ideas', language)}>
          <MirrorGroceriesMealIdeasList detail={detail} mutedColor={mutedColor} language={language} />
        </MirrorGroceriesXLInsightPanel>
      </div>
    </div>
  )
}

function mirrorRemindersHeader(detail: MirrorModuleDetail, language: AppLanguage) {
  const header = typeof detail.reminderHeader === 'string' ? detail.reminderHeader.trim() : ''
  if (header) return header

  const fallbackDate = typeof detail.tertiary === 'string' ? detail.tertiary.trim() : ''
  return fallbackDate || (language === 'no' ? 'Påminnelser' : 'Reminders')
}

function mirrorReminderItems(detail: MirrorModuleDetail) {
  const rawItems = Array.isArray(detail.reminderItems) ? detail.reminderItems : []
  return rawItems.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
}

function mirrorMediumReminderItems(detail: MirrorModuleDetail) {
  const rawItems = Array.isArray(detail.reminderMediumItems) ? detail.reminderMediumItems : detail.reminderItems
  return (Array.isArray(rawItems) ? rawItems : []).map((item) => String(item).trim()).filter(Boolean).slice(0, 4)
}

function mirrorReminderCalendarDates(detail: MirrorModuleDetail) {
  return (Array.isArray(detail.reminderCalendarDates) ? detail.reminderCalendarDates : [])
    .map((date) => String(date).slice(0, 10))
    .filter(Boolean)
}

function mirrorReminderNextItems(detail: MirrorModuleDetail) {
  return (Array.isArray(detail.reminderNextItems) ? detail.reminderNextItems : [])
    .map((item) => ({
      date: String(item?.date ?? '').slice(0, 10),
      title: String(item?.title ?? '').trim(),
    }))
    .filter((item) => item.date && item.title)
    .slice(0, 5)
}

function formatMirrorReminderListDate(date: string) {
  const [, month = '', day = ''] = String(date).slice(0, 10).split('-')
  return `${day.padStart(2, '0')}.${month.padStart(2, '0')}`
}

function mirrorRemindersEmptyMessage(language: AppLanguage) {
  return language === 'no' ? 'Alt gjort' : 'All done'
}


function MirrorLargeRemindersCard({
  detail,
  language,
  mutedColor,
  frameBackground,
  textColor,
}: {
  detail: MirrorModuleDetail
  language: AppLanguage
  mutedColor: string
  frameBackground: string
  textColor: string
}) {
  return (
    <div className="grid h-full w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-[clamp(0.45rem,1.15vw,0.88rem)] overflow-hidden">
      <div className="min-w-0 overflow-hidden">
        <MirrorMediumRemindersCard
          detail={detail}
          language={language}
          mutedColor={mutedColor}
          frameBackground={frameBackground}
          textColor={textColor}
        />
      </div>
      <div className="min-w-0 overflow-hidden pr-[clamp(0.45rem,1.15vw,0.88rem)]">
        <MirrorMonthCalendar
          textColor={textColor}
          language={language}
          highlightDates={mirrorReminderCalendarDates(detail)}
          showMonthTitle={false}
          showWeekNumbers
        />
      </div>
    </div>
  )
}

function MirrorXLRemindersNextList({ detail, language, mutedColor }: { detail: MirrorModuleDetail; language: AppLanguage; mutedColor: string }) {
  const items = mirrorReminderNextItems(detail)
  const emptyLabel = language === 'no' ? 'Ingen flere påminnelser' : 'No more reminders'

  if (items.length <= 0) {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-hidden px-[clamp(0.8rem,2vw,1.35rem)] text-center text-[clamp(0.7rem,1.55vw,0.98rem)] font-semibold tracking-[0.06em]" style={{ color: mutedColor }}>
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="flex h-full w-full items-end justify-start overflow-hidden px-[clamp(0.8rem,2.05vw,1.35rem)] pb-[clamp(0.72rem,1.85vw,1.2rem)] leading-none">
      <div className="grid w-full max-w-full gap-[clamp(0.28rem,0.82vw,0.5rem)]">
        {items.map((item, index) => (
          <div key={`${item.date}-${item.title}-${index}`} className="grid min-w-0 grid-cols-[clamp(2.1rem,5.3vw,3.15rem)_minmax(0,1fr)] items-baseline gap-[clamp(0.55rem,1.38vw,0.86rem)] text-left" title={`${formatMirrorReminderListDate(item.date)} ${item.title}`}>
            <div className="justify-self-end text-[clamp(0.52rem,1.18vw,0.76rem)] font-semibold tracking-[0.05em]">
              {formatMirrorReminderListDate(item.date)}
            </div>
            <div className="min-w-0 truncate text-[clamp(0.66rem,1.48vw,0.96rem)] font-semibold tracking-[0.025em]">
              {item.title}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MirrorXLRemindersCard({
  detail,
  language,
  mutedColor,
  frameBackground,
  textColor,
}: {
  detail: MirrorModuleDetail
  language: AppLanguage
  mutedColor: string
  frameBackground: string
  textColor: string
}) {
  const highlightDates = mirrorReminderCalendarDates(detail)

  return (
    <div className="grid h-full w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-[clamp(0.52rem,1.55vw,0.9rem)] overflow-hidden">
      <div className="grid min-h-0 grid-rows-2 gap-y-[clamp(0.52rem,1.55vw,0.9rem)] overflow-hidden">
        <div className="min-h-0 overflow-hidden">
          <MirrorMediumRemindersCard
            detail={detail}
            language={language}
            mutedColor={mutedColor}
            frameBackground={frameBackground}
            textColor={textColor}
          />
        </div>
        <div className="min-h-0 overflow-hidden">
          <MirrorXLRemindersNextList detail={detail} language={language} mutedColor={mutedColor} />
        </div>
      </div>

      <div className="grid min-h-0 grid-rows-2 gap-y-[clamp(0.52rem,1.55vw,0.9rem)] overflow-hidden pr-[clamp(0.25rem,0.85vw,0.55rem)]">
        <div className="min-h-0 overflow-hidden">
          <MirrorMonthCalendar textColor={textColor} language={language} highlightDates={highlightDates} showWeekNumbers />
        </div>
        <div className="min-h-0 overflow-hidden">
          <MirrorMonthCalendar textColor={textColor} language={language} monthOffset={1} highlightDates={highlightDates} showWeekNumbers />
        </div>
      </div>
    </div>
  )
}

function MirrorMediumRemindersCard({
  detail,
  language,
  mutedColor,
  frameBackground,
  textColor,
}: {
  detail: MirrorModuleDetail
  language: AppLanguage
  mutedColor: string
  frameBackground: string
  textColor: string
}) {
  const visibleItems = mirrorMediumReminderItems(detail)
  const header = mirrorRemindersHeader(detail, language)
  const headerIsToday = header.trim().toLowerCase() === (language === 'no' ? 'i dag' : 'today')
  const headerIsTomorrow = header.trim().toLowerCase() === (language === 'no' ? 'i morgen' : 'tomorrow')
  const showBottomBadge = !headerIsToday && !headerIsTomorrow
  const overflowCount = Math.max(0, Math.floor(Number(detail.reminderMediumOverflowCount ?? detail.reminderOverflowCount) || 0))
  const tomorrowCount = Math.max(0, Math.floor(Number(detail.reminderTomorrowCount) || 0))
  const moreLabel = overflowCount > 0 ? `+${overflowCount} ${language === 'no' ? 'til' : 'more'}` : ''
  const tomorrowLabel = headerIsToday && tomorrowCount > 0 ? `${language === 'no' ? 'I morgen' : 'Tomorrow'}: ${tomorrowCount}` : ''
  const badgeLabel = typeof detail.reminderDateBadge === 'string' && detail.reminderDateBadge.trim() ? detail.reminderDateBadge.trim() : header

  if (visibleItems.length <= 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-[clamp(0.28rem,0.72vw,0.5rem)] px-[clamp(0.75rem,1.9vw,1.2rem)] py-[clamp(0.7rem,1.7vw,1.1rem)] text-center leading-none">
        <MirrorModuleHeader title={header} />
        <div className="max-w-full truncate text-[clamp(0.72rem,1.45vw,0.96rem)] font-medium tracking-[0.05em]" style={{ color: mutedColor }}>
          {mirrorRemindersEmptyMessage(language)}
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden px-[clamp(0.75rem,1.9vw,1.2rem)] pb-[clamp(0.78rem,1.9vw,1.18rem)] pt-[clamp(0.92rem,2.3vw,1.45rem)] text-center leading-none">
      {moreLabel && (
        <div className="absolute right-[clamp(0.55rem,1.35vw,0.92rem)] top-[clamp(0.5rem,1.25vw,0.78rem)] max-w-[34%] truncate text-[clamp(0.48rem,1vw,0.66rem)] font-medium tracking-[0.04em]" title={moreLabel}>
          {moreLabel}
        </div>
      )}

      <div className="flex shrink-0 justify-center">
        <MirrorModuleHeader title={header} />
      </div>

      <div className={`flex min-h-0 flex-1 items-center justify-center ${showBottomBadge ? 'pb-[clamp(1.35rem,3vw,1.9rem)] pt-[clamp(0.55rem,1.35vw,0.9rem)]' : tomorrowLabel ? 'pb-[clamp(0.95rem,2.2vw,1.35rem)] pt-[clamp(0.62rem,1.55vw,0.98rem)]' : 'pb-[clamp(0.18rem,0.55vw,0.38rem)] pt-[clamp(0.68rem,1.65vw,1.05rem)]'}`}>
        <div className="flex max-w-full flex-col items-start gap-[clamp(0.42rem,1.05vw,0.72rem)] text-left">
          {visibleItems.map((item, index) => (
            <div key={`${item}-${index}`} className="grid max-w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-[clamp(0.42rem,1.05vw,0.68rem)]">
              <span className="h-[clamp(0.24rem,0.55vw,0.36rem)] w-[clamp(0.24rem,0.55vw,0.36rem)] rounded-full bg-current" aria-hidden="true" />
              <span className="min-w-0 truncate text-[clamp(0.7rem,1.5vw,0.98rem)] font-medium tracking-[0.04em]" title={item}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {showBottomBadge && (
        <div className="absolute bottom-[clamp(1.05rem,2.55vw,1.55rem)] left-1/2 max-w-[72%] -translate-x-1/2 truncate px-[clamp(0.55rem,1.35vw,0.88rem)] py-[clamp(0.32rem,0.8vw,0.5rem)] text-[clamp(0.5rem,1.08vw,0.72rem)] font-semibold tracking-[0.045em]" style={{ backgroundColor: frameBackground, color: textColor }} title={badgeLabel}>
          {badgeLabel}
        </div>
      )}

      {tomorrowLabel && (
        <div className="absolute bottom-[clamp(0.62rem,1.55vw,0.95rem)] left-1/2 max-w-[72%] -translate-x-1/2 truncate text-[clamp(0.5rem,1.08vw,0.72rem)] font-medium tracking-[0.04em]" title={tomorrowLabel}>
          {tomorrowLabel}
        </div>
      )}
    </div>
  )
}

function MirrorSmallRemindersCard({ detail, language, borderColor, mutedColor }: { detail: MirrorModuleDetail; language: AppLanguage; borderColor: string; mutedColor: string }) {
  const visibleItems = mirrorReminderItems(detail)
  const header = mirrorRemindersHeader(detail, language)
  const overflowCount = Math.max(0, Math.floor(Number(detail.reminderOverflowCount) || 0))
  const tomorrowCount = Math.max(0, Math.floor(Number(detail.reminderTomorrowCount) || 0))
  const moreLabel = overflowCount > 0 ? `+${overflowCount} ${language === 'no' ? 'til' : 'more'}` : ''
  const tomorrowLabel = tomorrowCount > 0 ? `${language === 'no' ? 'I morgen' : 'Tomorrow'}: ${tomorrowCount}` : ''
  const showTomorrowNote = tomorrowLabel.length > 0

  if (visibleItems.length <= 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-[clamp(0.26rem,0.72vw,0.46rem)] px-[clamp(0.45rem,1.2vw,0.8rem)] py-[clamp(0.35rem,0.9vw,0.55rem)] text-center leading-none">
        <MirrorModuleHeader title={header} />
        <div className="max-w-full truncate text-[clamp(0.68rem,1.55vw,0.92rem)] font-medium tracking-[0.06em]" style={{ color: mutedColor }}>
          {mirrorRemindersEmptyMessage(language)}
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden px-[clamp(0.45rem,1.2vw,0.8rem)] pb-[clamp(0.38rem,0.95vw,0.62rem)] pt-[clamp(0.65rem,1.7vw,1rem)] text-center leading-none">
      {moreLabel && (
        <div className="absolute right-[clamp(0.45rem,1.2vw,0.8rem)] top-[clamp(0.36rem,0.95vw,0.58rem)] max-w-[38%] truncate text-[clamp(0.48rem,1.05vw,0.66rem)] font-medium tracking-[0.04em]" title={moreLabel}>
          {moreLabel}
        </div>
      )}

      <div className="flex shrink-0 justify-center">
        <MirrorModuleHeader title={header} />
      </div>

      <div className={`relative min-h-0 w-full flex-1 ${showTomorrowNote ? 'mb-[clamp(0.78rem,1.75vw,1.08rem)] mt-[clamp(0.44rem,1.1vw,0.68rem)]' : 'mb-[clamp(0.12rem,0.38vw,0.28rem)] mt-[clamp(0.52rem,1.28vw,0.78rem)]'}`}>
        {visibleItems.length > 1 && Array.from({ length: visibleItems.length - 1 }).map((_, index) => (
          <div
            key={index}
            className="pointer-events-none absolute top-[12%] h-[76%] w-px"
            style={{ left: `${((index + 1) * 100) / visibleItems.length}%`, backgroundColor: borderColor }}
            aria-hidden="true"
          />
        ))}
        <div className="grid h-full w-full items-center" style={{ gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}>
          {visibleItems.map((item, index) => (
            <div key={`${item}-${index}`} className="flex min-w-0 items-center justify-center px-[clamp(0.32rem,0.9vw,0.58rem)] text-[clamp(0.68rem,1.6vw,0.96rem)] font-medium tracking-[0.04em]" title={item}>
              <span className="block max-w-full truncate">{item}</span>
            </div>
          ))}
        </div>
      </div>

      {showTomorrowNote && (
        <div className="absolute bottom-[clamp(0.36rem,0.95vw,0.58rem)] left-1/2 max-w-[72%] -translate-x-1/2 truncate text-[clamp(0.48rem,1.05vw,0.66rem)] font-medium tracking-[0.04em]" title={tomorrowLabel}>
          {tomorrowLabel}
        </div>
      )}
    </div>
  )
}



function splitMirrorSoccerKickoff(kickoff: string | undefined) {
  const raw = String(kickoff || '').trim()
  if (!raw) return { day: '--', time: '--:--' }
  const parts = raw.split(/\s+/)
  const time = parts.pop() || '--:--'
  const day = parts.join(' ') || '--'
  return { day, time }
}

function MirrorMediumSoccerCard({ detail, fallback }: { detail: MirrorModuleDetail; fallback: { primary: string; secondary?: string; tertiary?: string } }) {
  const kickoff = splitMirrorSoccerKickoff(detail.soccerKickoffLine)
  const nextDay = detail.soccerNextDayLine || kickoff.day
  const nextTime = detail.soccerNextTimeLine || kickoff.time
  const nextHome = detail.soccerNextHomeLine || detail.soccerFixtureLine?.split(/\s+vs\s+/i)[0] || '---'
  const nextAway = detail.soccerNextAwayLine || detail.soccerFixtureLine?.split(/\s+vs\s+/i)[1] || '---'
  const position = detail.soccerPositionLine || (detail.tertiary ? `Position: ${detail.tertiary.replace(/^#/, '')}` : 'Position: --')
  const points = detail.soccerPointsLine || 'Points: --'
  const lastHome = detail.soccerLastHomeLine || '---'
  const lastAway = detail.soccerLastAwayLine || '---'
  const lastHomeGoals = detail.soccerLastHomeGoalsLine || '--'
  const lastAwayGoals = detail.soccerLastAwayGoalsLine || '--'

  if (!detail.soccerFixtureLine && !detail.soccerNextHomeLine && !detail.soccerPositionLine) {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-hidden px-4 text-center leading-tight">
        <MirrorModuleHeader title={fallback.primary || 'Soccer'} />
      </div>
    )
  }

  return (
    <div className="grid h-full w-full grid-rows-7 overflow-hidden px-[clamp(0.55rem,1.5vw,1.1rem)] py-[clamp(0.62rem,1.65vw,1.1rem)] text-center leading-none">
      <div className="flex min-h-0 items-center justify-center text-[clamp(0.56rem,1.24vw,0.78rem)] font-semibold tracking-[0.07em]">
        <span className="truncate px-[clamp(0.3rem,0.8vw,0.62rem)]" title={nextDay}>{nextDay}</span>
        <span className="truncate px-[clamp(0.3rem,0.8vw,0.62rem)]" title={nextTime}>{nextTime}</span>
      </div>

      <div className="grid min-h-0 grid-cols-[1fr_auto_1fr] items-center gap-[clamp(0.18rem,0.52vw,0.36rem)] text-[clamp(0.82rem,1.95vw,1.2rem)] font-semibold tracking-[0.07em]">
        <div className="truncate text-right" title={nextHome}>{nextHome}</div>
        <div className="px-[clamp(0.12rem,0.34vw,0.24rem)]">vs</div>
        <div className="truncate text-left" title={nextAway}>{nextAway}</div>
      </div>

      <div className="flex min-h-0 items-center justify-center text-[clamp(0.54rem,1.18vw,0.74rem)] font-semibold tracking-[0.045em]">
        <div className="min-w-0 flex-1 truncate pr-[clamp(0.48rem,1.28vw,0.9rem)] text-right" title={position}>{position}</div>
        <div className="h-[clamp(0.76rem,1.55vw,0.98rem)] w-px shrink-0 bg-current" aria-hidden="true" />
        <div className="min-w-0 flex-1 truncate pl-[clamp(0.48rem,1.28vw,0.9rem)] text-left" title={points}>{points}</div>
      </div>

      <div className="relative min-h-0" aria-hidden="true">
        <div className="absolute left-[5%] right-[5%] top-1/2 h-px -translate-y-1/2 bg-current opacity-70" />
      </div>

      <div className="flex min-h-0 items-center justify-center text-[clamp(0.54rem,1.18vw,0.74rem)] font-semibold tracking-[0.07em]">Last</div>

      <div className="grid min-h-0 grid-cols-[1fr_auto_1fr] items-center gap-[clamp(0.16rem,0.46vw,0.32rem)] text-[clamp(0.58rem,1.28vw,0.82rem)] font-semibold tracking-[0.06em]">
        <div className="truncate text-right" title={lastHome}>{lastHome}</div>
        <div className="px-[clamp(0.12rem,0.32vw,0.22rem)]">vs</div>
        <div className="truncate text-left" title={lastAway}>{lastAway}</div>
      </div>

      <div className="grid min-h-0 grid-cols-[1fr_auto_1fr] items-center gap-[clamp(0.16rem,0.46vw,0.32rem)] text-[clamp(0.58rem,1.28vw,0.82rem)] font-semibold tracking-[0.06em]">
        <div className="truncate text-right" title={lastHomeGoals}>{lastHomeGoals}</div>
        <div className="px-[clamp(0.12rem,0.32vw,0.22rem)]">-</div>
        <div className="truncate text-left" title={lastAwayGoals}>{lastAwayGoals}</div>
      </div>
    </div>
  )
}

function mirrorSoccerTableWindow(rows: NonNullable<MirrorModuleDetail['soccerTableRows']>, maxRows: number) {
  if (rows.length <= maxRows) return rows

  const selectedIndex = rows.findIndex((row) => row.isSelected)
  if (selectedIndex < 0) return rows.slice(0, maxRows)

  let start = selectedIndex - Math.floor(maxRows / 2)
  start = Math.max(0, Math.min(start, rows.length - maxRows))
  return rows.slice(start, start + maxRows)
}

function formatMirrorSoccerNumber(value: number | null | undefined, signed = false) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return signed ? '' : '--'
  if (signed && value > 0) return `+${value}`
  return String(value)
}

function MirrorSoccerStandingsTable({ detail, maxRows = 6, variant = 'default' }: { detail: MirrorModuleDetail; maxRows?: number; variant?: 'default' | 'xl' }) {
  const rows = mirrorSoccerTableWindow(Array.isArray(detail.soccerTableRows) ? detail.soccerTableRows : [], maxRows)
  const isXl = variant === 'xl'
  const xlTableTop = 'clamp(1.5rem,3.4vw,2.35rem)'
  const xlTableBottom = 'clamp(0.42rem,0.95vw,0.68rem)'
  const xlHeaderHeight = 'clamp(0.9rem,2.05vw,1.32rem)'
  const xlRowGap = 'clamp(0.02rem,0.08vw,0.06rem)'

  if (rows.length <= 0) {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-hidden px-[clamp(0.35rem,0.9vw,0.65rem)] text-center text-[clamp(0.58rem,1.24vw,0.78rem)] font-semibold tracking-[0.07em]">
        No table
      </div>
    )
  }

  return (
    <div
      className={`${isXl ? 'grid' : 'grid grid-rows-[repeat(7,minmax(0,1fr))] py-[clamp(0.36rem,0.9vw,0.62rem)]'} h-full w-full overflow-hidden text-center leading-none`}
      style={isXl ? { gridTemplateRows: `${xlHeaderHeight} repeat(${rows.length}, minmax(0, 1fr))`, rowGap: xlRowGap, paddingTop: xlTableTop, paddingBottom: xlTableBottom } : undefined}
    >
      <div className="grid min-h-0 grid-cols-[1fr_1fr_1fr_1fr_1fr] items-center gap-[clamp(0.08rem,0.22vw,0.16rem)] text-[clamp(0.5rem,1.02vw,0.66rem)] font-semibold tracking-[0.06em]">
        <div>P</div>
        <div>Team</div>
        <div>Pts</div>
        <div>Gap</div>
        <div>GD</div>
      </div>

      {rows.map((row, index) => (
        <div
          key={`${row.position ?? index}-${row.teamShort}`}
          className="relative grid min-h-0 grid-cols-[1fr_1fr_1fr_1fr_1fr] items-center gap-[clamp(0.08rem,0.22vw,0.16rem)] text-[clamp(0.5rem,1.02vw,0.66rem)] font-semibold tracking-[0.045em]"
        >
          {row.isSelected && (
            <>
              <div className="pointer-events-none absolute left-[4%] right-[4%] top-0 h-px bg-current opacity-70" aria-hidden="true" />
              <div className="pointer-events-none absolute bottom-0 left-[4%] right-[4%] h-px bg-current opacity-70" aria-hidden="true" />
            </>
          )}
          <div className="truncate">{formatMirrorSoccerNumber(row.position)}</div>
          <div className="truncate" title={row.teamShort}>{row.teamShort || '--'}</div>
          <div className="truncate">{formatMirrorSoccerNumber(row.points)}</div>
          <div className="truncate">{row.isSelected ? '' : formatMirrorSoccerNumber(row.gap, true)}</div>
          <div className="truncate">{formatMirrorSoccerNumber(row.goalDifference, true) || '--'}</div>
        </div>
      ))}
    </div>
  )
}

function MirrorLargeSoccerCard({ detail, fallback }: { detail: MirrorModuleDetail; fallback: { primary: string; secondary?: string; tertiary?: string } }) {
  return (
    <div className="grid h-full w-full grid-cols-[49fr_12px_minmax(0,51fr)] overflow-hidden">
      <div className="min-w-0 overflow-hidden">
        <MirrorMediumSoccerCard detail={detail} fallback={fallback} />
      </div>
      <div aria-hidden="true" />
      <div className="min-w-0 overflow-hidden">
        <MirrorSoccerStandingsTable detail={detail} />
      </div>
    </div>
  )
}

function MirrorXLSoccerLeftPanel({ detail, fallback }: { detail: MirrorModuleDetail; fallback: { primary: string; secondary?: string; tertiary?: string } }) {
  const kickoff = splitMirrorSoccerKickoff(detail.soccerKickoffLine)
  const nextDay = detail.soccerNextDayLine || kickoff.day
  const nextTime = detail.soccerNextTimeLine || kickoff.time
  const nextHome = detail.soccerNextHomeLine || detail.soccerFixtureLine?.split(/\s+vs\s+/i)[0] || '---'
  const nextAway = detail.soccerNextAwayLine || detail.soccerFixtureLine?.split(/\s+vs\s+/i)[1] || '---'
  const position = detail.soccerPositionLine || (detail.tertiary ? `Position: ${detail.tertiary.replace(/^#/, '')}` : 'Position: --')
  const points = detail.soccerPointsLine || 'Points: --'
  const lastHome = detail.soccerLastHomeLine || '---'
  const lastAway = detail.soccerLastAwayLine || '---'
  const lastHomeGoals = detail.soccerLastHomeGoalsLine || '--'
  const lastAwayGoals = detail.soccerLastAwayGoalsLine || '--'
  const title = detail.primary || fallback.primary || 'Soccer'
  const leagueLine = detail.soccerLeagueLine || detail.secondary || fallback.secondary || 'Premier League'
  const scorerLine = detail.soccerTopScorerLine || 'Top scorer: --'
  const recordLine = detail.soccerRecordLine || 'Record: --'
  const goalsLine = detail.soccerGoalsLine || 'Goals: --'

  if (!detail.soccerFixtureLine && !detail.soccerNextHomeLine && !detail.soccerPositionLine) {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-hidden px-4 text-center leading-tight">
        <MirrorModuleHeader title={fallback.primary || 'Soccer'} />
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden px-[clamp(0.7rem,1.75vw,1.25rem)] py-[clamp(0.7rem,1.7vw,1.15rem)] text-center leading-none">
      <div className="flex min-h-0 shrink-0 items-center justify-center">
        <MirrorModuleHeader title={title} />
      </div>

      <div className="mt-[clamp(0.7rem,1.65vw,1.08rem)] grid shrink-0 grid-rows-7 text-center" style={{ height: 'clamp(6.1rem,16.2vw,10.6rem)' }}>
        <div className="flex min-h-0 items-center justify-center text-[clamp(0.56rem,1.24vw,0.78rem)] font-semibold tracking-[0.07em]">
          <span className="truncate px-[clamp(0.3rem,0.8vw,0.62rem)]" title={nextDay}>{nextDay}</span>
          <span className="truncate px-[clamp(0.3rem,0.8vw,0.62rem)]" title={nextTime}>{nextTime}</span>
        </div>
        <div className="grid min-h-0 grid-cols-[1fr_auto_1fr] items-center gap-[clamp(0.18rem,0.52vw,0.36rem)] text-[clamp(0.82rem,1.95vw,1.2rem)] font-semibold tracking-[0.07em]">
          <div className="truncate text-right" title={nextHome}>{nextHome}</div>
          <div className="px-[clamp(0.12rem,0.34vw,0.24rem)]">vs</div>
          <div className="truncate text-left" title={nextAway}>{nextAway}</div>
        </div>
        <div className="flex min-h-0 items-center justify-center text-[clamp(0.54rem,1.18vw,0.74rem)] font-semibold tracking-[0.045em]">
          <div className="min-w-0 flex-1 truncate pr-[clamp(0.48rem,1.28vw,0.9rem)] text-right" title={position}>{position}</div>
          <div className="h-[clamp(0.76rem,1.55vw,0.98rem)] w-px shrink-0 bg-current" aria-hidden="true" />
          <div className="min-w-0 flex-1 truncate pl-[clamp(0.48rem,1.28vw,0.9rem)] text-left" title={points}>{points}</div>
        </div>
        <div className="relative min-h-0" aria-hidden="true"><div className="absolute left-[5%] right-[5%] top-1/2 h-px -translate-y-1/2 bg-current opacity-70" /></div>
        <div className="flex min-h-0 items-center justify-center text-[clamp(0.54rem,1.18vw,0.74rem)] font-semibold tracking-[0.07em]">Last</div>
        <div className="grid min-h-0 grid-cols-[1fr_auto_1fr] items-center gap-[clamp(0.16rem,0.46vw,0.32rem)] text-[clamp(0.58rem,1.28vw,0.82rem)] font-semibold tracking-[0.06em]">
          <div className="truncate text-right" title={lastHome}>{lastHome}</div><div className="px-[clamp(0.12rem,0.32vw,0.22rem)]">vs</div><div className="truncate text-left" title={lastAway}>{lastAway}</div>
        </div>
        <div className="grid min-h-0 grid-cols-[1fr_auto_1fr] items-center gap-[clamp(0.16rem,0.46vw,0.32rem)] text-[clamp(0.58rem,1.28vw,0.82rem)] font-semibold tracking-[0.06em]">
          <div className="truncate text-right" title={lastHomeGoals}>{lastHomeGoals}</div><div className="px-[clamp(0.12rem,0.32vw,0.22rem)]">-</div><div className="truncate text-left" title={lastAwayGoals}>{lastAwayGoals}</div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center pt-[clamp(0.65rem,1.45vw,1rem)]">
        <div className="grid w-full shrink-0 grid-rows-4 gap-[clamp(0.18rem,0.42vw,0.3rem)] text-[clamp(0.54rem,1.15vw,0.74rem)] font-semibold tracking-[0.045em]">
          {[leagueLine, scorerLine, recordLine, goalsLine].map((line, index) => (
            <div key={`${line}-${index}`} className="min-h-0 truncate" title={line}>{line}</div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MirrorXLSoccerCard({ detail, fallback }: { detail: MirrorModuleDetail; fallback: { primary: string; secondary?: string; tertiary?: string } }) {
  return (
    <div className="grid h-full w-full grid-cols-[49fr_10px_minmax(0,51fr)] overflow-hidden">
      <div className="min-w-0 overflow-hidden">
        <MirrorXLSoccerLeftPanel detail={detail} fallback={fallback} />
      </div>
      <div aria-hidden="true" />
      <div className="min-w-0 overflow-hidden">
        <MirrorSoccerStandingsTable detail={detail} maxRows={12} variant="xl" />
      </div>
    </div>
  )
}

function MirrorSmallSoccerCard({ detail, fallback }: { detail: MirrorModuleDetail; fallback: { primary: string; secondary?: string; tertiary?: string } }) {
  const fixture = detail.soccerFixtureLine || detail.secondary || fallback.primary || 'Soccer'
  const kickoff = detail.soccerKickoffLine || '-- --:--'
  const position = detail.soccerPositionLine || (detail.tertiary ? `Position: ${detail.tertiary.replace(/^#/, '')}` : 'Position: --')
  const points = detail.soccerPointsLine || 'Points: --'
  const stats = [kickoff, position, points]

  return (
    <div className="flex h-full w-full flex-col items-center justify-center overflow-hidden px-[clamp(0.45rem,1.15vw,0.8rem)] text-center leading-none">
      <MirrorModuleHeader title={fixture} />
      <div className="mt-[clamp(0.8rem,2.15vw,1.2rem)] flex w-full max-w-full items-center justify-center text-[clamp(0.58rem,1.32vw,0.82rem)] font-semibold tracking-[0.045em]">
        {stats.map((item, index) => (
          <React.Fragment key={`${item}-${index}`}>
            {index > 0 && <div className="mx-[clamp(0.18rem,0.55vw,0.42rem)] h-[clamp(0.85rem,1.8vw,1.1rem)] w-px shrink-0 bg-current opacity-90" aria-hidden="true" />}
            <div className="min-w-0 flex-1 truncate px-[clamp(0.12rem,0.38vw,0.28rem)]" title={item}>
              {item}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

function MirrorSurfRatingBars({ rating, muted, compact = false }: { rating: number | undefined; muted: string; compact?: boolean }) {
  const value = Math.max(0, Math.min(6, Math.round(Number(rating) || 0)))
  const gapClass = compact ? 'gap-[clamp(0.1rem,0.3vw,0.22rem)]' : 'gap-[clamp(0.18rem,0.55vw,0.45rem)]'
  const boxClass = compact
    ? 'h-[clamp(0.34rem,0.85vw,0.52rem)] w-[clamp(0.5rem,1.12vw,0.76rem)] rounded-[0.13rem]'
    : 'h-[clamp(0.42rem,1.15vw,0.72rem)] w-[clamp(0.7rem,1.65vw,1.05rem)] rounded-[0.18rem]'

  return (
    <div className={`flex items-center justify-center ${gapClass}`} aria-label={`Surf rating ${value} of 6`}>
      {Array.from({ length: 6 }).map((_, index) => (
        <span
          key={index}
          className={`block border ${boxClass}`}
          style={{
            backgroundColor: index < value ? 'currentColor' : 'transparent',
            borderColor: index < value ? 'currentColor' : muted,
            opacity: index < value ? 0.95 : 0.55,
          }}
        />
      ))}
    </div>
  )
}

type DiceRatingProps = {
  value?: number
  rating?: number
  isExperienceBased: boolean
  muted: string
  paperColor: string
  className?: string
  compact?: boolean
}

const MIRROR_DICE_DOTS: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [[32, 32], [68, 68]],
  3: [[32, 32], [50, 50], [68, 68]],
  4: [[32, 32], [68, 32], [32, 68], [68, 68]],
  5: [[32, 32], [68, 32], [50, 50], [32, 68], [68, 68]],
  6: [[32, 28], [32, 50], [32, 72], [68, 28], [68, 50], [68, 72]],
}

function booleanish(value: unknown) {
  if (value === true) return true
  if (typeof value === 'number') return value > 0
  if (typeof value === 'string') return ['true', '1', 'yes', 'experience', 'user_surf_experiences'].includes(value.trim().toLowerCase())
  return false
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function isSurfExperienceBased(detail: MirrorModuleDetail | undefined) {
  const d = recordFromUnknown(detail)
  if (!Object.keys(d).length) return false
  if (booleanish(d.isExperienceBased) || booleanish(d.ratingFromExperience) || booleanish(d.basedOnExperience)) return true
  const source = String(d.ratingSource ?? d.source ?? '').toLowerCase()
  if (source.includes('experience') || source.includes('user_surf_experiences')) return true

  const experience = recordFromUnknown(d.experience)
  if (booleanish(experience.matched) || booleanish(experience.isExperienceBased)) return true

  const breakdownExperience = recordFromUnknown(recordFromUnknown(d.breakdown).experience)
  if (booleanish(breakdownExperience.matched)) return true

  const pickedExperience = recordFromUnknown(recordFromUnknown(d.picked).experience)
  return booleanish(pickedExperience.matched)
}

function DiceRating({ value, rating, isExperienceBased, muted, paperColor, className = '', compact = false }: DiceRatingProps) {
  const displayRating = rating ?? value
  if (!isExperienceBased) return <MirrorSurfRatingBars rating={displayRating} muted={muted} compact={compact} />

  const normalizedValue = Math.max(0, Math.min(6, Math.round(Number(displayRating) || 0)))
  const gapClass = compact ? 'gap-[clamp(0.08rem,0.24vw,0.16rem)]' : 'gap-[clamp(0.12rem,0.38vw,0.28rem)]'
  const dieClass = compact
    ? 'h-[clamp(0.46rem,1.05vw,0.66rem)] w-[clamp(0.46rem,1.05vw,0.66rem)] rounded-[clamp(0.1rem,0.24vw,0.16rem)]'
    : 'h-[clamp(0.58rem,1.42vw,0.9rem)] w-[clamp(0.58rem,1.42vw,0.9rem)] rounded-[clamp(0.12rem,0.32vw,0.22rem)]'
  const dotClass = compact
    ? 'h-[clamp(0.065rem,0.17vw,0.1rem)] w-[clamp(0.065rem,0.17vw,0.1rem)]'
    : 'h-[clamp(0.085rem,0.24vw,0.15rem)] w-[clamp(0.085rem,0.24vw,0.15rem)]'

  return (
    <div className={`flex items-center justify-center ${gapClass} ${className}`} aria-label={`Experience-based surf rating ${normalizedValue} of 6`}>
      {Array.from({ length: 6 }).map((_, index) => {
        const face = index + 1
        const filled = face <= normalizedValue
        const dots = filled ? MIRROR_DICE_DOTS[face] ?? [] : []
        return (
          <span
            key={face}
            className={`relative block shrink-0 border ${dieClass}`}
            style={{
              backgroundColor: filled ? 'currentColor' : 'transparent',
              borderColor: filled ? 'currentColor' : muted,
              borderWidth: filled ? 1 : 1.25,
              opacity: filled ? 0.96 : 0.6,
            }}
          >
            {dots.map(([left, top], dotIndex) => (
              <span
                key={`${face}-${dotIndex}`}
                className={`absolute rounded-full ${dotClass}`}
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: paperColor,
                }}
              />
            ))}
          </span>
        )
      })}
    </div>
  )
}


function finiteMirrorNumber(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function mirrorSurfString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function mirrorSurfPartExperienceBased(part: Record<string, unknown>) {
  if (booleanish(part.ratingFromExperience) || booleanish(part.isExperienceBased) || booleanish(part.basedOnExperience)) return true
  const source = String(part.ratingSource ?? part.source ?? '').toLowerCase()
  if (source.includes('experience') || source.includes('user_surf_experiences')) return true

  const experience = recordFromUnknown(part.experience)
  if (booleanish(experience.matched) || booleanish(experience.isExperienceBased)) return true

  const breakdownExperience = recordFromUnknown(recordFromUnknown(part.breakdown).experience)
  if (booleanish(breakdownExperience.matched) || booleanish(breakdownExperience.isExperienceBased)) return true

  const pickedExperience = recordFromUnknown(recordFromUnknown(part.picked).experience)
  return booleanish(pickedExperience.matched) || booleanish(pickedExperience.isExperienceBased)
}

function mirrorSurfPartDiceValue(part: Record<string, unknown>, fallbackRating: number | undefined) {
  const breakdownExperience = recordFromUnknown(recordFromUnknown(part.breakdown).experience)
  const topExperience = recordFromUnknown(part.experience)
  const picked = recordFromUnknown(part.picked)
  const pickedBreakdownExperience = recordFromUnknown(recordFromUnknown(picked.breakdown).experience)
  const pickedExperience = recordFromUnknown(picked.experience)
  const candidates = [
    part.experienceDiceValue,
    fallbackRating,
    part.finalRating,
    part.experienceRating,
    breakdownExperience.blended_rating_1_6,
    topExperience.blended_rating_1_6,
    pickedBreakdownExperience.blended_rating_1_6,
    pickedExperience.blended_rating_1_6,
    breakdownExperience.rating_1_6,
    topExperience.rating_1_6,
    pickedBreakdownExperience.rating_1_6,
    pickedExperience.rating_1_6,
  ]

  for (const candidate of candidates) {
    const value = finiteMirrorNumber(candidate)
    if (value !== undefined && value >= 1 && value <= 6) return Math.round(value)
  }

  return undefined
}

type MirrorLargeSurfDaypart = {
  label: string
  rating?: number
  waveRange: string
  swellPeriodS?: number
  windSpeedMs?: number
  ratingFromExperience: boolean
  experienceDiceValue?: number
}

function normalizeMirrorLargeSurfDaypart(part: unknown, fallbackLabel: string): MirrorLargeSurfDaypart {
  const record = recordFromUnknown(part)
  const rating = finiteMirrorNumber(record.rating ?? record.finalRating ?? record.score)
  const waveRange =
    mirrorSurfString(record.waveRange) ||
    mirrorSurfString(record.wave_height_range_label) ||
    mirrorSurfString(record.wave_range) ||
    mirrorSurfString(record.waveHeightRange) ||
    '--'
  const ratingFromExperience = mirrorSurfPartExperienceBased(record)

  return {
    label: mirrorSurfString(record.label) || fallbackLabel,
    rating,
    waveRange,
    swellPeriodS: finiteMirrorNumber(record.swellPeriodS ?? record.swell_period_s ?? record.selectedSwellPeriod),
    windSpeedMs: finiteMirrorNumber(record.windSpeedMs ?? record.wind_speed_ms),
    ratingFromExperience,
    experienceDiceValue: ratingFromExperience ? mirrorSurfPartDiceValue(record, rating) : undefined,
  }
}


function MirrorLargeSurfCard({
  detail,
  mutedColor,
  borderColor,
  frameBackground,
  textColor,
}: {
  detail: MirrorModuleDetail
  mutedColor: string
  borderColor: string
  frameBackground: string
  textColor: string
}) {
  const rating = finiteMirrorNumber(detail.rating ?? detail.primary)
  const spotName = detail.secondary || detail.primary || 'Surf'
  const fallbackWaveRange = detail.waveRange || detail.tertiary || '--'
  const fallbackParts: MirrorLargeSurfDaypart[] = [
    { label: 'Morning', rating, waveRange: fallbackWaveRange, ratingFromExperience: false },
    { label: 'Noon', rating, waveRange: fallbackWaveRange, ratingFromExperience: false },
    { label: 'Afternoon', rating, waveRange: fallbackWaveRange, ratingFromExperience: false },
    { label: 'Evening', rating, waveRange: fallbackWaveRange, ratingFromExperience: false },
  ]
  const rawDayparts = Array.isArray(detail.surfDayparts) ? detail.surfDayparts : []
  const dayparts = fallbackParts.map((fallback, index) => (
    rawDayparts.length > 0 ? normalizeMirrorLargeSurfDaypart(rawDayparts[index], fallback.label) : fallback
  ))

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden px-[clamp(0.55rem,1.35vw,0.9rem)] py-[clamp(0.45rem,1.1vw,0.75rem)] text-center leading-tight">
      {detail.isTodaysBest && (
        <div className="absolute left-[clamp(0.55rem,1.35vw,0.9rem)] top-[clamp(0.36rem,0.9vw,0.6rem)] max-w-[44%] truncate text-[clamp(0.42rem,0.95vw,0.62rem)] font-semibold tracking-[0.15em]" style={{ color: mutedColor }}>
          Best next 4h:
        </div>
      )}

      <MirrorModuleHeader title={spotName} className="mx-auto max-w-[72%]" style={{ borderColor: textColor }} />

      <div className="mt-[clamp(0.55rem,1.35vw,0.92rem)] grid min-h-0 flex-1 grid-cols-4 items-stretch">
        {dayparts.map((part, index) => (
          <div key={`${part.label}-${index}`} className="relative grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_auto] items-center px-[clamp(0.26rem,0.75vw,0.58rem)]">
            <div className="min-w-0 truncate text-[clamp(0.58rem,1.32vw,0.82rem)] font-semibold tracking-[0.12em] uppercase" title={part.label}>
              {part.label}
            </div>

            <div aria-hidden="true" />

            <div className="min-w-0 truncate text-[clamp(0.52rem,1.08vw,0.7rem)] font-semibold tracking-[0.1em] uppercase" title={mirrorSurfRatingWord(part.rating)}>
              {mirrorSurfRatingWord(part.rating)}
            </div>

            <div className="flex min-h-0 min-w-0 items-center justify-center py-[clamp(0.18rem,0.52vw,0.36rem)]">
              <DiceRating
                rating={part.experienceDiceValue ?? part.rating}
                isExperienceBased={Boolean(part.ratingFromExperience)}
                muted={mutedColor}
                paperColor={frameBackground}
                compact
              />
            </div>

            <div className="min-w-0 truncate text-[clamp(0.5rem,1.02vw,0.68rem)] tracking-[0.1em]" title={part.waveRange}>
              {part.waveRange}
            </div>

            <div
              className="min-w-0 truncate pt-[clamp(0.06rem,0.18vw,0.12rem)] text-[clamp(0.42rem,0.86vw,0.56rem)] tracking-[0.08em]"
              style={{ color: mutedColor }}
              title={`${formatMirrorMetric(part.swellPeriodS, 's')} / ${formatMirrorMetric(part.windSpeedMs, 'm/s')}`}
            >
              {formatMirrorMetric(part.swellPeriodS, 's')} · {formatMirrorMetric(part.windSpeedMs, 'm/s')}
            </div>

            {index > 0 && (
              <div className="absolute inset-y-[18%] left-0 w-px" style={{ backgroundColor: borderColor }} aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}


function formatMirrorSurfTemp(value: number | undefined) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '--'
  return String(Math.round(n))
}

function MirrorSurfWaterDropIcon() {
  return (
    <svg className="h-[clamp(1.05rem,2.35vw,1.52rem)] w-[clamp(1.05rem,2.35vw,1.52rem)]" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 4 C16 4 8 14.2 8 21 C8 25.9 11.5 29 16 29 C20.5 29 24 25.9 24 21 C24 14.2 16 4 16 4 Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MirrorSurfSunUpDownIcon() {
  return (
    <svg className="h-[clamp(1.05rem,2.35vw,1.52rem)] w-[clamp(1.05rem,2.35vw,1.52rem)]" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M7 22a9 9 0 0 1 18 0" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M5 23.5h22" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M16 4.6v4M8.4 8.2l2.5 3.1M23.6 8.2l-2.5 3.1M4.9 15.8l3.4 1.5M27.1 15.8l-3.4 1.5" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
    </svg>
  )
}

function MirrorXLSurfWeatherIcon({ wmo }: { wmo: number | null | undefined }) {
  const kind = mirrorWeatherIconKind(wmo)
  const isRain = kind === 'rain' || kind === 'sleet' || kind === 'thunder'
  const isSnow = kind === 'snow' || kind === 'sleet'

  return (
    <svg className="h-[clamp(1.05rem,2.35vw,1.52rem)] w-[clamp(1.05rem,2.35vw,1.52rem)] overflow-visible" viewBox="0 0 32 32" aria-hidden="true">
      {(kind === 'sun' || kind === 'partly') && (
        <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" transform={kind === 'partly' ? 'translate(3 -2) scale(0.72)' : undefined}>
          <circle cx="16" cy="16" r="5.2" />
          <path d="M16 4.5v3M16 24.5v3M4.5 16h3M24.5 16h3M7.9 7.9l2.1 2.1M22 22l2.1 2.1M24.1 7.9 22 10M10 22l-2.1 2.1" />
        </g>
      )}
      {kind !== 'sun' && (
        <path d="M10.2 23.5h12.1c3.3 0 5.7-2.2 5.7-5.2 0-2.8-2.1-5-5-5.3-1-3.8-4.1-6.2-8.1-6.2-3.7 0-6.7 2.1-8 5.4-2.9.4-5 2.8-5 5.6 0 3.2 2.5 5.7 5.8 5.7h2.5Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {isRain && <path d="M11 27l-1.5 3M17 27l-1.5 3M23 27l-1.5 3" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />}
      {isSnow && <path d="M11 28h3M12.5 26.5v3M19 28h3M20.5 26.5v3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
      {kind === 'fog' && <path d="M8 27h16M11 30h10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
    </svg>
  )
}

function MirrorSurfTemperatureRow({
  icon,
  left,
  right,
  borderColor,
}: {
  icon: React.ReactNode
  left: string
  right: string
  borderColor: string
}) {
  return (
    <div className="grid min-w-0 grid-cols-[clamp(1.55rem,3.8vw,2.45rem)_1fr] items-center gap-x-[clamp(0.22rem,0.58vw,0.38rem)]">
      <div className="flex items-center justify-center">{icon}</div>
      <div className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-center text-[clamp(0.66rem,1.5vw,0.96rem)] font-semibold tracking-[0.08em]">
        <div className="truncate text-right">{left}°</div>
        <div className="mx-[clamp(0.2rem,0.55vw,0.38rem)] h-[clamp(0.75rem,1.65vw,1.04rem)] w-px" style={{ backgroundColor: borderColor }} aria-hidden="true" />
        <div className="truncate text-left">{right}°</div>
      </div>
    </div>
  )
}

function MirrorXLSurfCard({
  detail,
  mutedColor,
  borderColor,
  frameBackground,
  textColor,
}: {
  detail: MirrorModuleDetail
  mutedColor: string
  borderColor: string
  frameBackground: string
  textColor: string
}) {
  const rating = finiteMirrorNumber(detail.rating ?? detail.primary)
  const spotName = detail.secondary || detail.primary || 'Surf'
  const waveRange = detail.waveRange || detail.tertiary || '--'
  const rawDaily = Array.isArray(detail.surfDaily) ? detail.surfDaily : []
  const bottomSource = rawDaily.length > 1 ? rawDaily.slice(1, 5) : rawDaily.slice(0, 4)
  const fallbackDays: MirrorLargeSurfDaypart[] = [
    { label: 'Tomorrow', rating, waveRange, ratingFromExperience: false },
    { label: '--', rating, waveRange, ratingFromExperience: false },
    { label: '--', rating, waveRange, ratingFromExperience: false },
    { label: '--', rating, waveRange, ratingFromExperience: false },
  ]
  const daily = fallbackDays.map((fallback, index) => (
    bottomSource[index] ? normalizeMirrorLargeSurfDaypart(bottomSource[index], fallback.label) : fallback
  ))
  const headerLabel = detail.isTodaysBest ? `Best next 4hrs: ${spotName}` : spotName
  const experienceBased = isSurfExperienceBased(detail)
  const diceValue = detail.experienceDiceValue ?? rating
  const swellPeriod = formatMirrorMetric(detail.swellPeriodS, 's')
  const windSpeed = formatMirrorMetric(detail.windSpeedMs, 'm/s')
  const airMin = formatMirrorSurfTemp(detail.surfAirMinC)
  const airMax = formatMirrorSurfTemp(detail.surfAirMaxC)
  const waterMin = formatMirrorSurfTemp(detail.surfWaterMinC)
  const waterMax = formatMirrorSurfTemp(detail.surfWaterMaxC)
  const sunrise = detail.surfSunrise || '--:--'
  const sunset = detail.surfSunset || '--:--'

  return (
    <div className="relative grid h-full w-full grid-rows-[1fr_auto_1fr] overflow-hidden text-center leading-tight">
      <div className="absolute left-[clamp(0.55rem,1.35vw,0.95rem)] top-[clamp(0.42rem,1vw,0.72rem)] z-[1] max-w-[36%] truncate text-[clamp(0.46rem,1.02vw,0.66rem)] font-semibold tracking-[0.08em]" title={headerLabel}>
        {headerLabel}
      </div>

      <div className="grid min-h-0 grid-cols-3 items-stretch px-[clamp(0.42rem,1.05vw,0.75rem)] pt-[clamp(0.62rem,1.45vw,1rem)] pb-[clamp(0.52rem,1.18vw,0.82rem)]">
        <div className="flex min-h-0 items-center justify-center px-[clamp(0.2rem,0.55vw,0.4rem)] pt-[clamp(0.72rem,1.65vw,1.12rem)]">
          <div className="grid w-full translate-y-[clamp(0.12rem,0.36vw,0.25rem)] grid-cols-2 items-center gap-x-[clamp(0.3rem,0.78vw,0.56rem)] gap-y-[clamp(0.1rem,0.3vw,0.22rem)]">
            <div className="flex justify-center text-[clamp(1rem,2.25vw,1.46rem)] leading-none" style={mirrorDirectionToStyle(detail.swellDirectionDeg)}>↑</div>
            <div className="flex justify-center text-[clamp(1rem,2.25vw,1.46rem)] leading-none" style={mirrorDirectionToStyle(detail.windDirectionDeg)}>↑</div>
            <div className="flex justify-center"><MirrorSurfWaveIcon periodSeconds={detail.swellPeriodS} /></div>
            <div className="flex justify-center"><MirrorSurfWindIcon /></div>
            <div className="text-[clamp(0.62rem,1.4vw,0.9rem)] font-semibold tracking-[0.09em]">{swellPeriod}</div>
            <div className="text-[clamp(0.62rem,1.4vw,0.9rem)] font-semibold tracking-[0.09em]">{windSpeed}</div>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-col items-center justify-center px-[clamp(0.35rem,0.9vw,0.64rem)] pt-[clamp(0.28rem,0.75vw,0.5rem)]">
          <div className="absolute inset-y-[34%] left-0 w-px" style={{ backgroundColor: textColor }} aria-hidden="true" />
          <div className="absolute inset-y-[34%] right-0 w-px" style={{ backgroundColor: textColor }} aria-hidden="true" />
          <div className="translate-y-[clamp(0.08rem,0.28vw,0.2rem)]">
            <MirrorModuleHeader title="Today" className="mx-auto inline-block" style={{ borderColor: textColor }} />
            <div className="mt-[clamp(0.32rem,0.78vw,0.56rem)] text-[clamp(0.7rem,1.6vw,1rem)] font-semibold tracking-[0.1em] uppercase">{mirrorSurfRatingWord(rating)}</div>
            <div className="mt-[clamp(0.26rem,0.66vw,0.46rem)] flex min-w-0 items-center justify-center">
              <DiceRating rating={diceValue} isExperienceBased={experienceBased} muted={mutedColor} paperColor={frameBackground} />
            </div>
            <div className="mt-[clamp(0.32rem,0.78vw,0.56rem)] text-[clamp(0.66rem,1.48vw,0.94rem)] font-semibold tracking-[0.1em]" title={waveRange}>{waveRange}</div>
          </div>
        </div>

        <div className="flex min-h-0 items-center justify-center px-[clamp(0.48rem,1.15vw,0.82rem)] pt-[clamp(0.72rem,1.65vw,1.12rem)] text-left">
          <div className="grid w-full translate-y-[clamp(0.12rem,0.36vw,0.25rem)] gap-y-[clamp(0.2rem,0.52vw,0.36rem)]">
            <MirrorSurfTemperatureRow icon={<MirrorXLSurfWeatherIcon wmo={detail.weatherWmo} />} left={airMin} right={airMax} borderColor={borderColor} />
            <MirrorSurfTemperatureRow icon={<MirrorSurfWaterDropIcon />} left={waterMin} right={waterMax} borderColor={borderColor} />
            <div className="grid min-w-0 grid-cols-[clamp(1.55rem,3.8vw,2.45rem)_1fr] items-center gap-x-[clamp(0.22rem,0.58vw,0.38rem)]">
              <div className="flex items-center justify-center"><MirrorSurfSunUpDownIcon /></div>
              <div className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-center text-[clamp(0.66rem,1.5vw,0.96rem)] font-semibold tracking-[0.08em]">
                <div className="truncate text-right">{sunrise}</div>
                <div className="mx-[clamp(0.2rem,0.55vw,0.38rem)] h-[clamp(0.75rem,1.65vw,1.04rem)] w-px" style={{ backgroundColor: borderColor }} aria-hidden="true" />
                <div className="truncate text-left">{sunset}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-[clamp(0.48rem,1.15vw,0.82rem)] h-px" style={{ backgroundColor: textColor }} aria-hidden="true" />

      <div className="grid min-h-0 grid-cols-4 items-stretch px-[clamp(0.35rem,0.95vw,0.7rem)] py-[clamp(0.52rem,1.24vw,0.88rem)]">
        {daily.map((part, index) => (
          <div key={`${part.label}-${index}`} className="relative grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_auto] items-center px-[clamp(0.22rem,0.65vw,0.5rem)]">
            {index > 0 && <div className="absolute inset-y-[6%] left-0 w-px" style={{ backgroundColor: textColor }} aria-hidden="true" />}
            <div className="truncate text-[clamp(0.68rem,1.55vw,1rem)] font-semibold tracking-[0.1em]" title={part.label}>{part.label}</div>
            <div aria-hidden="true" />
            <div className="truncate text-[clamp(0.52rem,1.14vw,0.72rem)] font-semibold tracking-[0.1em] uppercase" title={mirrorSurfRatingWord(part.rating)}>{mirrorSurfRatingWord(part.rating)}</div>
            <div className="flex min-h-0 items-center justify-center py-[clamp(0.18rem,0.52vw,0.38rem)]">
              <DiceRating rating={part.experienceDiceValue ?? part.rating} isExperienceBased={Boolean(part.ratingFromExperience)} muted={mutedColor} paperColor={frameBackground} compact />
            </div>
            <div className="truncate text-[clamp(0.5rem,1.08vw,0.68rem)] tracking-[0.1em]" title={part.waveRange}>{part.waveRange}</div>
            <div className="truncate pt-[clamp(0.04rem,0.14vw,0.1rem)] text-[clamp(0.42rem,0.86vw,0.56rem)] tracking-[0.08em]" style={{ color: mutedColor }} title={`${formatMirrorMetric(part.swellPeriodS, 's')} / ${formatMirrorMetric(part.windSpeedMs, 'm/s')}`}>
              {formatMirrorMetric(part.swellPeriodS, 's')} · {formatMirrorMetric(part.windSpeedMs, 'm/s')}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MirrorSmallSurfCard({
  detail,
  mutedColor,
  borderColor,
  frameBackground,
}: {
  detail: MirrorModuleDetail
  mutedColor: string
  borderColor: string
  frameBackground: string
}) {
  const rating = detail.rating ?? Number(detail.primary)
  const spotName = detail.secondary || detail.primary || 'Surf'
  const waveRange = detail.waveRange || detail.tertiary || '--'

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-[clamp(0.45rem,1.15vw,0.78rem)] py-[clamp(0.35rem,0.9vw,0.58rem)] text-center leading-none">
      {detail.isTodaysBest && (
        <div className="absolute left-[clamp(0.36rem,0.9vw,0.6rem)] top-[clamp(0.26rem,0.66vw,0.44rem)] max-w-[46%] truncate text-[clamp(0.38rem,0.82vw,0.56rem)] font-semibold tracking-[0.14em]" style={{ color: mutedColor }}>
          Best next 4h:
        </div>
      )}

      <MirrorModuleHeader title={spotName} className="max-w-[86%]" />

      <div className="mt-[clamp(0.68rem,1.7vw,1.05rem)] grid w-full min-w-0 grid-cols-[1fr_auto_1fr_auto_1fr] items-center">
        <div className="min-w-0 truncate px-[clamp(0.1rem,0.32vw,0.22rem)] text-[clamp(0.56rem,1.24vw,0.78rem)] font-semibold tracking-[0.08em] uppercase" title={mirrorSurfRatingWord(rating)}>
          {mirrorSurfRatingWord(rating)}
        </div>
        <div className="h-[clamp(0.86rem,1.75vw,1.12rem)] w-px shrink-0" style={{ backgroundColor: borderColor }} aria-hidden="true" />
        <div className="flex min-w-0 items-center justify-center overflow-hidden px-[clamp(0.08rem,0.26vw,0.2rem)]">
          <DiceRating rating={rating} isExperienceBased={isSurfExperienceBased(detail)} muted={mutedColor} paperColor={frameBackground} compact />
        </div>
        <div className="h-[clamp(0.86rem,1.75vw,1.12rem)] w-px shrink-0" style={{ backgroundColor: borderColor }} aria-hidden="true" />
        <div className="min-w-0 truncate px-[clamp(0.1rem,0.32vw,0.22rem)] text-[clamp(0.56rem,1.24vw,0.78rem)] font-semibold tracking-[0.08em]" title={waveRange}>
          {waveRange}
        </div>
      </div>
    </div>
  )
}

function formatMirrorMetric(value: number | undefined, suffix: string) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '--'
  return `${Math.round(n)}${suffix}`
}

function mirrorDirectionToStyle(degreesFrom: number | undefined): React.CSSProperties {
  const n = Number(degreesFrom)
  if (!Number.isFinite(n)) return { opacity: 0.35 }
  return { transform: `rotate(${(n + 180) % 360}deg)` }
}

function mirrorWavePeakCount(periodSeconds: number | undefined) {
  const n = Number(periodSeconds)
  if (!Number.isFinite(n) || n <= 0) return 3
  if (n < 8) return 4
  if (n < 12) return 3
  return 2
}

function MirrorSurfWaveIcon({ periodSeconds, line = false }: { periodSeconds: number | undefined; line?: boolean }) {
  const peaks = mirrorWavePeakCount(periodSeconds)
  const items = Array.from({ length: peaks })
  if (line) {
    return (
      <svg className="h-[clamp(1.05rem,2.35vw,1.52rem)] w-[clamp(1.8rem,3.8vw,2.65rem)]" viewBox="0 0 52 32" aria-hidden="true">
        <path d="M4 20 C9 12, 15 12, 20 20 S31 28, 36 20 S47 12, 50 20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 25 H47" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg className="h-[clamp(1rem,2.2vw,1.45rem)] w-[clamp(2rem,4.2vw,3.2rem)]" viewBox="0 0 64 28" aria-hidden="true">
      {items.map((_, index) => {
        const gap = peaks === 4 ? 2 : 3
        const width = (64 - gap * (peaks - 1)) / peaks
        const x = index * (width + gap)
        return (
          <path
            key={index}
            d={`M ${x} 22 C ${x + width * 0.18} 10, ${x + width * 0.46} 5, ${x + width * 0.72} 10 C ${x + width * 0.56} 12, ${x + width * 0.5} 17, ${x + width * 0.74} 22 Z`}
            fill="currentColor"
          />
        )
      })}
      <rect x="1" y="21" width="62" height="3" rx="1.5" fill="currentColor" />
    </svg>
  )
}

function MirrorSurfWindIcon({ line = false }: { line?: boolean } = {}) {
  if (line) {
    return (
      <svg className="h-[clamp(1.05rem,2.35vw,1.52rem)] w-[clamp(1.8rem,3.8vw,2.65rem)]" viewBox="0 0 52 32" aria-hidden="true">
        <path d="M5 10 H34 C39 10 39 4 34 4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 17 H43 C48 17 48 11 43 11" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 24 H35 C40 24 40 30 35 30" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  return (
    <svg className="h-[clamp(1rem,2.2vw,1.45rem)] w-[clamp(2rem,4.2vw,3.2rem)]" viewBox="0 0 64 28" aria-hidden="true">
      <rect x="4" y="5" width="46" height="4" rx="2" fill="currentColor" />
      <rect x="10" y="13" width="50" height="4" rx="2" fill="currentColor" />
      <rect x="24" y="21" width="32" height="4" rx="2" fill="currentColor" />
    </svg>
  )
}

function mirrorWeatherIconKind(wmo: number | null | undefined) {
  if (wmo === 0) return 'sun'
  if (wmo === 1 || wmo === 2) return 'partly'
  if (wmo === 45 || wmo === 48) return 'fog'
  if (wmo != null && ((wmo >= 51 && wmo <= 65) || (wmo >= 80 && wmo <= 82))) return 'rain'
  if (wmo === 66 || wmo === 67) return 'sleet'
  if (wmo != null && ((wmo >= 71 && wmo <= 77) || wmo === 85 || wmo === 86)) return 'snow'
  if (wmo === 95 || wmo === 96 || wmo === 99) return 'thunder'
  return 'cloud'
}

function mirrorWeatherRainLineCount(wmo: number | null | undefined) {
  if (wmo === 51 || wmo === 53 || wmo === 55) return 2
  if (wmo === 65 || wmo === 82) return 4
  return 3
}

function MirrorWeatherCloud({ mask = false }: { mask?: boolean }) {
  const fill = mask ? 'var(--mirror-bg)' : 'currentColor'
  const stroke = mask ? 'var(--mirror-bg)' : 'currentColor'

  return (
    <path
      d="M27 63 C21.8 63 17.5 58.8 17.5 53.6 C17.5 48.3 21.8 44.1 27.1 44.1 C29.8 34.5 38.5 28.2 49.1 28.2 C60.9 28.2 70.6 36.7 72.5 48 C80.2 49.1 85.8 55.1 85.8 62.4 C85.8 70.4 79.4 76.8 71.1 76.8 H29.1 C22.8 76.8 17.8 71.8 17.8 65.7 C17.8 64.7 17.9 63.8 18.2 62.9 C20.8 63.2 23.8 63.2 27 63 Z"
      fill={fill}
      stroke={stroke}
      strokeWidth={mask ? 10 : 0}
      strokeLinejoin="round"
    />
  )
}

function MirrorWeatherSun({ compact = false }: { compact?: boolean }) {
  const transform = compact ? 'translate(20 -2) scale(0.66)' : undefined

  return (
    <g transform={transform} fill="none" stroke="currentColor" strokeWidth="5.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="50" cy="50" r="15.5" fill="currentColor" stroke="none" />
      <line x1="50" y1="11" x2="50" y2="23" />
      <line x1="50" y1="77" x2="50" y2="89" />
      <line x1="11" y1="50" x2="23" y2="50" />
      <line x1="77" y1="50" x2="89" y2="50" />
      <line x1="22.4" y1="22.4" x2="30.9" y2="30.9" />
      <line x1="69.1" y1="69.1" x2="77.6" y2="77.6" />
      <line x1="77.6" y1="22.4" x2="69.1" y2="30.9" />
      <line x1="30.9" y1="69.1" x2="22.4" y2="77.6" />
    </g>
  )
}

function MirrorWeatherRain({ count }: { count: number }) {
  const drops = count === 4
    ? [29, 43, 57, 71]
    : count === 2
      ? [40, 60]
      : [34, 52, 70]

  return (
    <g fill="none" stroke="currentColor" strokeWidth="5.2" strokeLinecap="round">
      {drops.map((x, index) => (
        <line key={x} x1={x + 4} y1={82 + (index % 2) * 2} x2={x - 1} y2={94 + (index % 2) * 2} />
      ))}
    </g>
  )
}

function MirrorWeatherSnow({ compact = false }: { compact?: boolean }) {
  const flakes = compact ? [{ x: 75, y: 89 }] : [{ x: 33, y: 86 }, { x: 52, y: 91 }, { x: 71, y: 86 }]

  return (
    <g fill="none" stroke="currentColor" strokeWidth="3.8" strokeLinecap="round">
      {flakes.map(({ x, y }) => (
        <g key={`${x}-${y}`}>
          <line x1={x - 5.5} y1={y} x2={x + 5.5} y2={y} />
          <line x1={x} y1={y - 5.5} x2={x} y2={y + 5.5} />
          <circle cx={x} cy={y} r="1.5" fill="currentColor" stroke="none" />
        </g>
      ))}
    </g>
  )
}

function MirrorWeatherFog() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="5.2" strokeLinecap="round">
      <line x1="19" y1="84" x2="83" y2="84" />
      <line x1="27" y1="94" x2="75" y2="94" />
    </g>
  )
}

function MirrorWeatherLightning() {
  return <path d="M54 62 L43 82 H54 L49 95 L68 73 H57 L63 62 Z" fill="currentColor" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
}


function fitMirrorStockTitle(detail: MirrorModuleDetail, fallback: { primary: string; secondary?: string }) {
  const title = String(detail.stockTitle || detail.stockSymbol || detail.secondary || fallback.primary || '').trim()
  return title || 'INVESTMENTS'
}

function MirrorSmallStocksCard({
  detail,
  fallback,
  textColor,
}: {
  detail: MirrorModuleDetail
  fallback: { primary: string; secondary?: string; tertiary?: string }
  textColor: string
}) {
  const title = fitMirrorStockTitle(detail, fallback)
  const hasLiveStockLayoutData = Boolean(detail.stockPrice || detail.stockDayPercent || detail.stockRangePercent)
  const price = detail.stockPrice || '--'
  const dayPercent = detail.stockDayPercent || '--'
  const rangePercent = detail.stockRangePercent || '--'

  if (!hasLiveStockLayoutData) {
    return (
      <div className="flex h-full w-full items-center justify-center px-3 text-center leading-tight">
        <MirrorModuleHeader title={title} />
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden px-[clamp(0.5rem,1.4vw,0.95rem)] py-[clamp(0.52rem,1.45vw,1rem)] text-center leading-tight">
      <MirrorModuleHeader title={title} className="mx-auto" />

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_auto_1fr_auto_1fr] items-center pt-[clamp(0.35rem,1.05vw,0.75rem)] pb-[clamp(0.1rem,0.4vw,0.28rem)]">
        <div className="min-w-0 truncate px-[clamp(0.2rem,0.7vw,0.45rem)] text-[clamp(0.72rem,1.75vw,1.08rem)] font-semibold tracking-[0.08em]">
          {price}
        </div>
        <div className="h-[72%] w-px" style={{ backgroundColor: textColor }} aria-hidden="true" />
        <div className="min-w-0 truncate px-[clamp(0.2rem,0.7vw,0.45rem)] text-[clamp(0.72rem,1.75vw,1.08rem)] font-semibold tracking-[0.08em]">
          {dayPercent}
        </div>
        <div className="h-[72%] w-px" style={{ backgroundColor: textColor }} aria-hidden="true" />
        <div className="min-w-0 truncate px-[clamp(0.2rem,0.7vw,0.45rem)] text-[clamp(0.72rem,1.75vw,1.08rem)] font-semibold tracking-[0.08em]">
          {rangePercent}
        </div>
      </div>
    </div>
  )
}


function mirrorStockRangeLabel(range: StockChartRange | undefined, language: AppLanguage) {
  const labels = language === 'no'
    ? { day: 'I dag', week: 'Uke', month: 'Måned', year: 'År' }
    : { day: 'Day', week: 'Week', month: 'Month', year: 'Year' }
  return labels[range || 'day'] || labels.day
}

const MIRROR_STOCK_CHART_WIDTH = 276
const MIRROR_STOCK_CHART_HEIGHT = 86
const MIRROR_STOCK_LINE_WIDTH = 1.2

type MirrorStockChartGeometry = {
  width: number
  height: number
  min: number
  max: number
  path: string
  referenceY: number | null
  referenceSegments: Array<{ x1: number; x2: number }>
}

function formatMirrorStockChartCoord(value: number) {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function buildStraightMirrorStockChartPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return ''
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${formatMirrorStockChartCoord(point.x)},${formatMirrorStockChartCoord(point.y)}`)
    .join(' ')
}

function buildSmoothedMirrorStockChartPath(points: Array<{ x: number; y: number }>, sourcePointCount: number) {
  if (points.length < 2) return ''
  if (points.length < 3 || sourcePointCount < 3) return buildStraightMirrorStockChartPath(points)

  const deltas: number[] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const dx = points[i + 1].x - points[i].x
    deltas.push(dx === 0 ? 0 : (points[i + 1].y - points[i].y) / dx)
  }

  const tangents: number[] = new Array(points.length).fill(0)
  tangents[0] = deltas[0]
  tangents[points.length - 1] = deltas[deltas.length - 1]
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = deltas[i - 1]
    const next = deltas[i]
    tangents[i] = prev === 0 || next === 0 || Math.sign(prev) !== Math.sign(next) ? 0 : (prev + next) / 2
  }

  for (let i = 0; i < deltas.length; i += 1) {
    const delta = deltas[i]
    if (delta === 0) {
      tangents[i] = 0
      tangents[i + 1] = 0
      continue
    }

    const alpha = tangents[i] / delta
    const beta = tangents[i + 1] / delta
    const magnitude = Math.hypot(alpha, beta)
    if (magnitude > 3) {
      const scale = 3 / magnitude
      tangents[i] = scale * alpha * delta
      tangents[i + 1] = scale * beta * delta
    }
  }

  const commands = [`M${formatMirrorStockChartCoord(points[0].x)},${formatMirrorStockChartCoord(points[0].y)}`]
  for (let i = 0; i < points.length - 1; i += 1) {
    const current = points[i]
    const next = points[i + 1]
    const dx = next.x - current.x
    const cp1x = current.x + dx / 3
    const cp1y = current.y + (tangents[i] * dx) / 3
    const cp2x = next.x - dx / 3
    const cp2y = next.y - (tangents[i + 1] * dx) / 3
    commands.push(
      `C${formatMirrorStockChartCoord(cp1x)},${formatMirrorStockChartCoord(cp1y)} ` +
        `${formatMirrorStockChartCoord(cp2x)},${formatMirrorStockChartCoord(cp2y)} ` +
        `${formatMirrorStockChartCoord(next.x)},${formatMirrorStockChartCoord(next.y)}`,
    )
  }

  return commands.join(' ')
}

function buildMirrorStockChartGeometry(values: number[], baselinePrice?: number | null): MirrorStockChartGeometry {
  const width = MIRROR_STOCK_CHART_WIDTH
  const height = MIRROR_STOCK_CHART_HEIGHT

  let min = Number.isFinite(values[0]) ? values[0] : 0
  let max = min
  for (let i = 1; i < values.length; i += 1) {
    const value = values[i]
    if (!Number.isFinite(value)) continue
    if (value < min) min = value
    if (value > max) max = value
  }

  const seriesMin = min
  const seriesMax = max
  const hasBaselinePrice = typeof baselinePrice === 'number' && Number.isFinite(baselinePrice) && baselinePrice > 0
  const referenceValue = hasBaselinePrice ? baselinePrice : null

  if (hasBaselinePrice) {
    min = Math.min(min, baselinePrice)
    max = Math.max(max, baselinePrice)
  }

  let span = max - min
  if (span < 0.0001) {
    const center = (min + max) / 2
    min = center - 0.5
    max = center + 0.5
    span = max - min
  }

  const padding = span * 0.06
  min -= padding
  max += padding
  span = max - min

  const yForChartValue = (value: number) => height - ((value - min) / span) * (height - 1)
  const yForReferenceValue = (value: number) => height - Math.round(((value - min) / span) * (height - 1))
  const chartPoints: Array<{ x: number; y: number }> = []
  for (let i = 0; i < values.length; i += 1) {
    const x = values.length === 1 ? 0 : (i / (values.length - 1)) * (width - 1)
    chartPoints.push({ x, y: yForChartValue(values[i]) })
  }

  let referenceY: number | null = null
  const hasReferenceValue = typeof referenceValue === 'number' && Number.isFinite(referenceValue) && referenceValue > 0
  const shouldShowReference = hasReferenceValue && (referenceValue >= seriesMin && referenceValue <= seriesMax)
  if (shouldShowReference && max - min >= 0.0001) {
    const y = yForReferenceValue(referenceValue)
    if (y >= 0 && y <= height - 1) referenceY = y
  }

  const referenceSegments: Array<{ x1: number; x2: number }> = []
  if (referenceY != null) {
    for (let x = 0; x <= width - 1; x += 6) {
      const segmentWidth = Math.min(2, width - x)
      if (segmentWidth > 0) referenceSegments.push({ x1: x, x2: x + segmentWidth })
    }
  }

  return {
    width,
    height,
    min,
    max,
    path: buildSmoothedMirrorStockChartPath(chartPoints, values.length),
    referenceY,
    referenceSegments,
  }
}

function MirrorStockChart({
  series,
  baselinePrice,
  textColor,
  moduleId,
  chartRange,
}: {
  series?: number[]
  baselinePrice?: number | null
  textColor: string
  moduleId?: number
  chartRange?: StockChartRange
}) {
  const values = useMemo(() => (series || []).filter((value) => Number.isFinite(value)), [series])

  const geometry = useMemo(() => {
    if (values.length < 2) return null
    return buildMirrorStockChartGeometry(values, baselinePrice)
  }, [values, baselinePrice])

  if (!geometry) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[clamp(0.55rem,1.25vw,0.76rem)] font-semibold tracking-[0.06em]">
        No chart data
      </div>
    )
  }

  const { width, height, path, referenceY, referenceSegments } = geometry

  return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden"
      data-mirror-stock-chart="medium"
      data-module-id={moduleId ?? ''}
      data-chart-range={chartRange ?? ''}
    >
      <svg
        className="block max-h-full max-w-full overflow-hidden"
        style={{ aspectRatio: `${width} / ${height}`, width: '100%', height: 'auto' }}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        {referenceY != null && (
          <g opacity="0.48" stroke={textColor} strokeWidth="1" shapeRendering="crispEdges">
            {referenceSegments.map((segment) => (
              <line key={`${segment.x1}-${segment.x2}`} x1={segment.x1} x2={segment.x2} y1={referenceY} y2={referenceY} />
            ))}
          </g>
        )}
        <path
          d={path}
          fill="none"
          stroke={textColor}
          strokeWidth={MIRROR_STOCK_LINE_WIDTH}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}

function mirrorFrameStockPrice(value: string) {
  return value.replace(/^[A-Z]{3}\s+/, '')
}

function MirrorStockRangeSelector({
  range,
}: {
  range?: StockChartRange
}) {
  const labels = { day: 'Day', week: 'Week', month: 'Month', year: 'Year' }
  const activeRange = range || 'day'

  return (
    <div className="flex items-center justify-center gap-[clamp(0.5rem,1.35vw,1.25rem)] whitespace-nowrap text-[clamp(0.54rem,1.1vw,0.78rem)] font-semibold tracking-[0.06em]">
      {(['day', 'week', 'month', 'year'] as StockChartRange[]).map((item) => {
        const active = activeRange === item
        return (
          <span
            key={item}
            className={active ? 'rounded-[clamp(0.28rem,0.75vw,0.45rem)] bg-[color:var(--mirror-bg-inverse)] px-[clamp(0.28rem,0.75vw,0.48rem)] py-[clamp(0.12rem,0.34vw,0.24rem)] text-[color:var(--mirror-fg-inverse)]' : ''}
          >
            {labels[item]}
          </span>
        )
      })}
    </div>
  )
}

function MirrorLargeStocksCard({
  detail,
  fallback,
  textColor,
}: {
  detail: MirrorModuleDetail
  fallback: { primary: string; secondary?: string; tertiary?: string }
  textColor: string
}) {
  const title = fitMirrorStockTitle(detail, fallback)
  const hasLiveStockLayoutData = Boolean(detail.stockPrice || detail.stockDayPercent || detail.stockRangePercent)
  const rows = [
    { label: 'Open', value: detail.stockOpen || '--' },
    { label: 'High', value: detail.stockHigh || '--' },
    { label: 'Low', value: detail.stockLow || '--' },
    { label: 'Prev close', value: detail.stockPreviousCloseText || '--' },
    { label: 'Change', value: detail.stockChange || '--' },
    { label: detail.stockPositionPercent ? 'Pos %' : 'Range %', value: detail.stockPositionPercent || detail.stockRangePercent || '--' },
  ]

  if (!hasLiveStockLayoutData) {
    return (
      <div className="flex h-full w-full items-center justify-center px-4 text-center leading-tight">
        <MirrorModuleHeader title={title} />
      </div>
    )
  }

  return (
    <div className="grid h-full w-full grid-cols-[1fr_1fr] overflow-hidden px-[clamp(0.65rem,1.65vw,1.25rem)] py-[clamp(0.45rem,1.15vw,0.9rem)] text-center leading-tight">
      <div className="flex min-w-0 flex-col overflow-hidden pr-[clamp(0.35rem,0.95vw,0.8rem)]">
        <MirrorModuleHeader title={title} className="mx-auto" />

        <div className="flex min-h-0 flex-1 flex-col justify-evenly pt-[clamp(0.42rem,1vw,0.72rem)] pb-[clamp(0.08rem,0.3vw,0.22rem)]">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-2 items-center gap-[clamp(0.3rem,0.85vw,0.7rem)] text-[clamp(0.52rem,1.02vw,0.74rem)] font-semibold tracking-[0.055em]">
              <div className="truncate text-right">{row.label}</div>
              <div className="truncate text-left">{row.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-col overflow-hidden pl-[clamp(0.35rem,0.95vw,0.8rem)]">
        <div className="shrink-0 pt-[clamp(0.12rem,0.35vw,0.28rem)]">
          <MirrorStockRangeSelector range={detail.stockChartRange} />
        </div>

        <div className="min-h-0 flex-1 px-[clamp(0.28rem,0.85vw,0.65rem)] pt-[clamp(0.75rem,1.55vw,1.15rem)] pb-[clamp(0.75rem,1.85vw,1.35rem)]">
          <MirrorStockChart
            series={detail.stockSeries}
            baselinePrice={detail.stockBaselinePrice}
            textColor={textColor}
            moduleId={detail.stockModuleId}
            chartRange={detail.stockChartRange}
          />
        </div>
      </div>
    </div>
  )
}

function MirrorXLStocksCard({
  detail,
  fallback,
  textColor,
}: {
  detail: MirrorModuleDetail
  fallback: { primary: string; secondary?: string; tertiary?: string }
  textColor: string
}) {
  const title = fitMirrorStockTitle(detail, fallback)
  const hasLiveStockLayoutData = Boolean(detail.stockPrice || detail.stockDayPercent || detail.stockRangePercent)
  const price = mirrorFrameStockPrice(detail.stockPrice || '--')
  const change = detail.stockChange || '--'
  const dayPercent = detail.stockDayPercent || '--'
  const detailGroups = [
    [
      { label: 'High', value: detail.stockHigh || '--' },
      { label: 'Low', value: detail.stockLow || '--' },
    ],
    [
      { label: 'Open', value: detail.stockOpen || '--' },
      { label: 'Prev', value: detail.stockPreviousCloseText || '--' },
    ],
    [
      { label: 'Change', value: change },
      { label: 'Day', value: dayPercent },
    ],
  ]

  if (!hasLiveStockLayoutData) {
    return (
      <div className="flex h-full w-full items-center justify-center px-5 text-center leading-tight">
        <div className="max-w-full truncate text-[clamp(1.1rem,2.8vw,2rem)] font-semibold tracking-[0.08em]">
          {title}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden px-[clamp(0.85rem,2.2vw,1.55rem)] pt-[clamp(0.85rem,2.15vw,1.55rem)] pb-[clamp(0.7rem,1.8vw,1.35rem)] text-center leading-tight">
      <div className="flex min-h-0 flex-[0_0_47%] flex-col overflow-hidden pb-[clamp(0.2rem,0.65vw,0.5rem)]">
        <MirrorModuleHeader title={title} className="mx-auto" />

        <div className="mx-auto grid w-[calc(100%-clamp(2.5rem,7vw,5rem))] shrink-0 grid-cols-[1fr_auto_1fr_auto_1fr] items-center pt-[clamp(0.8rem,1.9vw,1.25rem)]">
          <div className="min-w-0 truncate px-[clamp(0.25rem,0.75vw,0.55rem)] text-[clamp(0.76rem,1.65vw,1.12rem)] font-semibold tracking-[0.08em]">{price}</div>
          <div className="h-[calc(100%+0.3rem)] w-px" style={{ backgroundColor: textColor }} aria-hidden="true" />
          <div className="min-w-0 truncate px-[clamp(0.25rem,0.75vw,0.55rem)] text-[clamp(0.76rem,1.65vw,1.12rem)] font-semibold tracking-[0.08em]">{change}</div>
          <div className="h-[calc(100%+0.3rem)] w-px" style={{ backgroundColor: textColor }} aria-hidden="true" />
          <div className="min-w-0 truncate px-[clamp(0.25rem,0.75vw,0.55rem)] text-[clamp(0.76rem,1.65vw,1.12rem)] font-semibold tracking-[0.08em]">{dayPercent}</div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-3 items-center gap-[clamp(0.35rem,1vw,0.8rem)] pt-[clamp(0.75rem,1.75vw,1.15rem)]">
          {detailGroups.map((group, index) => (
            <div key={index} className="grid min-w-0 grid-cols-2 gap-x-[clamp(0.5rem,1.3vw,1rem)] gap-y-[clamp(0.44rem,1vw,0.7rem)] text-[clamp(0.54rem,1.12vw,0.76rem)] font-semibold tracking-[0.06em]">
              {group.map((item) => (
                <div key={item.label} className="min-w-0 truncate">{item.label}</div>
              ))}
              {group.map((item) => (
                <div key={`${item.label}-value`} className="min-w-0 truncate">{item.value}</div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-[clamp(0.25rem,0.75vw,0.55rem)]">
        <div className="shrink-0">
          <MirrorStockRangeSelector range={detail.stockChartRange} />
        </div>

        <div className="min-h-0 flex-1 px-[clamp(0.25rem,0.75vw,0.5rem)] pt-[clamp(0.55rem,1.25vw,0.9rem)] pb-[clamp(0.2rem,0.65vw,0.45rem)]">
          <MirrorStockChart
            series={detail.stockSeries}
            baselinePrice={detail.stockBaselinePrice}
            textColor={textColor}
            moduleId={detail.stockModuleId}
            chartRange={detail.stockChartRange}
          />
        </div>
      </div>
    </div>
  )
}

function MirrorMediumStocksCard({
  detail,
  fallback,
  textColor,
  language,
}: {
  detail: MirrorModuleDetail
  fallback: { primary: string; secondary?: string; tertiary?: string }
  textColor: string
  language: AppLanguage
}) {
  const title = fitMirrorStockTitle(detail, fallback)
  const hasLiveStockLayoutData = Boolean(detail.stockPrice || detail.stockDayPercent || detail.stockRangePercent)
  const price = mirrorFrameStockPrice(detail.stockPrice || '--')
  const dayPercent = detail.stockDayPercent || '--'
  const rangePercent = detail.stockRangePercent || '--'

  if (!hasLiveStockLayoutData) {
    return (
      <div className="flex h-full w-full items-center justify-center px-4 text-center leading-tight">
        <MirrorModuleHeader title={title} />
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden px-[clamp(0.75rem,1.9vw,1.5rem)] pt-[clamp(0.75rem,1.95vw,1.45rem)] pb-[clamp(0.8rem,2vw,1.55rem)] text-center leading-tight">
      <MirrorModuleHeader title={title} className="mx-auto" />

      <div className="shrink-0 pt-[clamp(0.55rem,1.25vw,0.95rem)] text-[clamp(0.56rem,1.22vw,0.78rem)] font-semibold tracking-[0.08em]">
        {mirrorStockRangeLabel(detail.stockChartRange, language)}
      </div>

      <div className="min-h-0 flex-1 px-[clamp(0.45rem,1.15vw,0.85rem)] pt-[clamp(0.45rem,1vw,0.8rem)] pb-[clamp(0.55rem,1.35vw,1rem)]">
        <MirrorStockChart
          series={detail.stockSeries}
          baselinePrice={detail.stockBaselinePrice}
          textColor={textColor}
          moduleId={detail.stockModuleId}
          chartRange={detail.stockChartRange}
        />
      </div>

      <div className="mx-auto grid w-[88%] shrink-0 grid-cols-[1fr_auto_1fr_auto_1fr] items-center">
        <div className="min-w-0 truncate px-[clamp(0.2rem,0.65vw,0.45rem)] text-[clamp(0.58rem,1.28vw,0.82rem)] font-semibold tracking-[0.08em]">
          {price}
        </div>
        <div className="h-[calc(100%+0.25rem)] w-px" style={{ backgroundColor: textColor }} aria-hidden="true" />
        <div className="min-w-0 truncate px-[clamp(0.2rem,0.65vw,0.45rem)] text-[clamp(0.58rem,1.28vw,0.82rem)] font-semibold tracking-[0.08em]">
          {dayPercent}
        </div>
        <div className="h-[calc(100%+0.25rem)] w-px" style={{ backgroundColor: textColor }} aria-hidden="true" />
        <div className="min-w-0 truncate px-[clamp(0.2rem,0.65vw,0.45rem)] text-[clamp(0.58rem,1.28vw,0.82rem)] font-semibold tracking-[0.08em]">
          {rangePercent}
        </div>
      </div>
    </div>
  )
}


function formatMirrorSmallWeatherTempRange(low: string | undefined, high: string | undefined) {
  const lo = String(low || '').trim()
  const hi = String(high || '').trim()
  if (!lo && !hi) return '--°'
  if (!hi || lo === hi) return lo || hi

  const loMatch = lo.match(/^(-?\d+)°([CF])$/)
  const hiMatch = hi.match(/^(-?\d+)°([CF])$/)
  if (loMatch && hiMatch && loMatch[2] === hiMatch[2]) {
    return `${loMatch[1]} to ${hiMatch[1]}°${hiMatch[2]}`
  }

  return `${lo} to ${hi}`
}


function MirrorWeatherTempPair({
  low,
  high,
  textColor,
  className = '',
}: {
  low: string | undefined
  high: string | undefined
  textColor: string
  className?: string
}) {
  return (
    <div className={`flex max-w-full items-center justify-center border-current font-semibold tracking-[0.06em] ${className}`}>
      <span className="min-w-0 truncate px-[clamp(0.12rem,0.38vw,0.28rem)]">{low || '--'}</span>
      <span className="h-[clamp(0.86rem,1.8vw,1.18rem)] w-px shrink-0" style={{ backgroundColor: textColor }} aria-hidden="true" />
      <span className="min-w-0 truncate px-[clamp(0.12rem,0.38vw,0.28rem)]">{high || low || '--'}</span>
    </div>
  )
}

function MirrorWeatherSunRangeLine({ line, textColor }: { line: string | undefined; textColor: string }) {
  const raw = String(line || '').trim()
  const match = /^Sun\s+([^/]+)\s*\/\s*(.+)$/i.exec(raw)
  const left = match ? `Sun ${match[1].trim() || '--:--'}` : 'Sun --:--'
  const right = match ? match[2].trim() || '--:--' : '--:--'

  return (
    <div className="flex max-w-full items-center justify-center font-medium tracking-[0.055em]">
      <span className="min-w-0 truncate px-[clamp(0.08rem,0.3vw,0.22rem)]">{left}</span>
      <span className="h-[clamp(0.72rem,1.45vw,0.92rem)] w-px shrink-0" style={{ backgroundColor: textColor }} aria-hidden="true" />
      <span className="min-w-0 truncate px-[clamp(0.08rem,0.3vw,0.22rem)]">{right}</span>
    </div>
  )
}

function MirrorXLWeatherMiniDay({ day, textColor }: { day: MirrorWeatherDay; textColor: string }) {
  return (
    <div className="flex h-full min-w-0 flex-col items-center justify-between overflow-hidden px-[clamp(0.24rem,0.78vw,0.62rem)] py-[clamp(0.22rem,0.66vw,0.48rem)] text-center leading-none">
      <div className="max-w-full shrink-0 truncate text-[clamp(0.58rem,1.24vw,0.84rem)] font-semibold tracking-[0.08em]" title={day.label}>
        {day.label}
      </div>

      <div className="flex min-h-0 w-full flex-1 items-center justify-center py-[clamp(0.14rem,0.44vw,0.3rem)]">
        <div className="aspect-square h-[clamp(1.75rem,4.8vw,3.25rem)] max-h-full max-w-[58%] overflow-hidden">
          <MirrorWeatherIcon wmo={day.wmo} />
        </div>
      </div>

      <MirrorWeatherTempPair
        low={day.lowTemp}
        high={day.highTemp}
        textColor={textColor}
        className="shrink-0 text-[clamp(0.56rem,1.2vw,0.82rem)]"
      />

      <div className="mt-[clamp(0.2rem,0.55vw,0.38rem)] flex w-full shrink-0 flex-col items-center gap-[clamp(0.1rem,0.28vw,0.2rem)] text-[clamp(0.45rem,0.96vw,0.64rem)] font-medium tracking-[0.035em]">
        <div className="max-w-full truncate" title={day.windLine}>{day.windLine || 'Calm winds'}</div>
        <div className="max-w-full truncate" title={day.precipLine}>{day.precipLine || 'Mostly dry'}</div>
      </div>
    </div>
  )
}

function MirrorXLWeatherCard({
  detail,
  textColor,
}: {
  detail: MirrorModuleDetail
  textColor: string
}) {
  const fallbackDay: MirrorWeatherDay = {
    label: 'Today',
    lowTemp: detail.weatherLowTemp || detail.tertiary?.split('/')[0]?.trim() || '--',
    highTemp: detail.weatherHighTemp || detail.tertiary?.split('/')[1]?.trim() || detail.weatherLowTemp || '--',
    windLine: detail.weatherWindLine || 'Calm winds',
    precipLine: detail.weatherPrecipLine || 'Mostly dry',
    wmo: detail.weatherWmo ?? null,
  }
  const allDays = Array.isArray(detail.weatherDays) && detail.weatherDays.length > 0 ? detail.weatherDays : [fallbackDay]
  const tomorrowDays = allDays.slice(1, 5)

  while (tomorrowDays.length < 4) {
    tomorrowDays.push({
      label: '--',
      lowTemp: '--',
      highTemp: '--',
      windLine: 'Calm winds',
      precipLine: 'Mostly dry',
      wmo: null,
    })
  }

  const currentTemp = String(detail.primary || detail.weatherHighTemp || '--').trim()
  const locationName = String(detail.secondary || 'Weather').trim()
  const windLine = detail.weatherWindLine || fallbackDay.windLine || 'Calm winds'
  const precipLine = detail.weatherPrecipLine || fallbackDay.precipLine || 'Mostly dry'
  const sunLine = detail.weatherSunLine || 'Sun --:-- / --:--'
  const humidityLine = detail.weatherHumidityLine || 'Humidity --%'
  const advice = detail.weatherAdvice || ''

  return (
    <div className="flex h-full w-full flex-col overflow-hidden text-center leading-none">
      <div className="relative grid h-1/2 min-h-0 grid-cols-3 items-stretch overflow-hidden px-[clamp(0.45rem,1.2vw,0.85rem)] pt-[clamp(0.38rem,1vw,0.7rem)] pb-[clamp(0.48rem,1.2vw,0.8rem)]">
        <div className="absolute bottom-0 left-[2.5%] right-[2.5%] h-px" style={{ backgroundColor: textColor }} aria-hidden="true" />

        <div className="flex min-w-0 flex-col overflow-hidden pr-[clamp(0.25rem,0.75vw,0.55rem)]">
          <div className="shrink-0 truncate text-left text-[clamp(0.48rem,1.04vw,0.7rem)] font-medium tracking-[0.055em]" title={locationName}>
            {locationName}
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div className="flex max-w-full flex-col items-center gap-[clamp(0.12rem,0.34vw,0.24rem)] text-[clamp(0.48rem,1.02vw,0.68rem)]">
              <MirrorWeatherTempPair low={detail.weatherLowTemp} high={detail.weatherHighTemp} textColor={textColor} className="text-[clamp(0.5rem,1.08vw,0.72rem)]" />
              <div className="max-w-full truncate font-medium tracking-[0.055em]" title={windLine}>{windLine}</div>
              <div className="max-w-full truncate font-medium tracking-[0.055em]" title={precipLine}>{precipLine}</div>
              <MirrorWeatherSunRangeLine line={sunLine} textColor={textColor} />
              <div className="max-w-full truncate font-medium tracking-[0.055em]" title={humidityLine}>{humidityLine}</div>
            </div>
          </div>
        </div>

        <div className="relative flex min-w-0 flex-col items-center overflow-hidden px-[clamp(0.35rem,0.95vw,0.72rem)]">
          <div className="absolute bottom-[clamp(0.45rem,1.15vw,0.8rem)] left-0 top-[clamp(1.65rem,4.1vw,2.7rem)] w-px" style={{ backgroundColor: textColor }} aria-hidden="true" />
          <div className="absolute bottom-[clamp(0.45rem,1.15vw,0.8rem)] right-0 top-[clamp(1.65rem,4.1vw,2.7rem)] w-px" style={{ backgroundColor: textColor }} aria-hidden="true" />

          <MirrorModuleHeader title="Today" />

          <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center pt-[clamp(0.28rem,0.8vw,0.52rem)]">
            <div className="aspect-square h-[clamp(2.45rem,7vw,4.75rem)] max-h-[72%] max-w-[52%] overflow-hidden">
              <MirrorWeatherIcon wmo={detail.weatherWmo} />
            </div>
            <div className="mt-[clamp(0.16rem,0.45vw,0.32rem)] truncate text-[clamp(0.98rem,2.45vw,1.65rem)] font-semibold tracking-[0.06em]">
              {currentTemp}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-center overflow-hidden pl-[clamp(0.32rem,0.95vw,0.72rem)] pr-[clamp(0.1rem,0.35vw,0.25rem)]">
          <div className="line-clamp-5 max-w-full text-[clamp(0.5rem,1.08vw,0.74rem)] font-medium leading-snug tracking-[0.035em]" title={advice}>
            {advice}
          </div>
        </div>
      </div>

      <div className="grid h-1/2 min-h-0 grid-cols-4 items-stretch overflow-hidden px-[clamp(0.18rem,0.55vw,0.4rem)] py-[clamp(0.24rem,0.72vw,0.5rem)]">
        {tomorrowDays.map((day, index) => (
          <div key={`${day.label}-${index}`} className="relative min-w-0 overflow-hidden">
            {index > 0 && (
              <div className="absolute bottom-[clamp(0.12rem,0.36vw,0.26rem)] left-0 top-[clamp(0.12rem,0.36vw,0.26rem)] w-px" style={{ backgroundColor: textColor }} aria-hidden="true" />
            )}
            <MirrorXLWeatherMiniDay day={day} textColor={textColor} />
          </div>
        ))}
      </div>
    </div>
  )
}

function MirrorLargeWeatherCard({
  detail,
  textColor,
}: {
  detail: MirrorModuleDetail
  textColor: string
}) {
  const locationName = String(detail.secondary || detail.primary || 'Weather').trim()
  const fallbackDay: MirrorWeatherDay = {
    label: 'Today',
    lowTemp: detail.weatherLowTemp || detail.tertiary?.split('/')[0]?.trim() || '--',
    highTemp: detail.weatherHighTemp || detail.tertiary?.split('/')[1]?.trim() || detail.weatherLowTemp || '--',
    windLine: detail.weatherWindLine || 'Calm winds',
    precipLine: detail.weatherPrecipLine || 'Mostly dry',
    wmo: detail.weatherWmo ?? null,
  }
  const days = (Array.isArray(detail.weatherDays) && detail.weatherDays.length > 0 ? detail.weatherDays : [fallbackDay])
    .slice(0, 4)

  while (days.length < 4) {
    days.push({
      label: '--',
      lowTemp: '--',
      highTemp: '--',
      windLine: 'Calm winds',
      precipLine: 'Mostly dry',
      wmo: null,
    })
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden px-[clamp(0.7rem,1.9vw,1.35rem)] pt-[clamp(0.55rem,1.4vw,0.95rem)] pb-[clamp(0.55rem,1.35vw,0.9rem)] text-center leading-none">
      <MirrorModuleHeader title={locationName} className="mx-auto max-w-[86%]" />

      <div className="mt-[clamp(0.5rem,1.25vw,0.82rem)] grid min-h-0 w-full flex-1 grid-cols-4 items-stretch">
        {days.map((day, index) => (
          <div key={`${day.label}-${index}`} className="relative flex min-w-0 flex-col items-center justify-between px-[clamp(0.25rem,0.85vw,0.7rem)] py-[clamp(0.16rem,0.45vw,0.3rem)]">
            {index > 0 && (
              <div
                className="absolute bottom-[clamp(0.12rem,0.34vw,0.25rem)] left-0 top-[clamp(0.12rem,0.34vw,0.25rem)] w-px"
                style={{ backgroundColor: textColor }}
                aria-hidden="true"
              />
            )}

            <div className="max-w-full shrink-0 truncate text-[clamp(0.66rem,1.5vw,0.98rem)] font-semibold tracking-[0.08em]" title={day.label}>
              {day.label}
            </div>

            <div className="flex min-h-0 w-full flex-1 items-center justify-center py-[clamp(0.18rem,0.55vw,0.4rem)]">
              <div className="aspect-square h-[clamp(2.15rem,6.1vw,4.2rem)] max-h-full max-w-[70%] overflow-hidden">
                <MirrorWeatherIcon wmo={day.wmo} />
              </div>
            </div>

            <div className="flex max-w-full shrink-0 items-center justify-center border-current text-[clamp(0.64rem,1.5vw,0.96rem)] font-semibold tracking-[0.06em]">
              <span className="min-w-0 truncate px-[clamp(0.12rem,0.38vw,0.28rem)]">{day.lowTemp}</span>
              <span className="h-[clamp(0.86rem,1.8vw,1.18rem)] w-px shrink-0" style={{ backgroundColor: textColor }} aria-hidden="true" />
              <span className="min-w-0 truncate px-[clamp(0.12rem,0.38vw,0.28rem)]">{day.highTemp}</span>
            </div>

            <div className="mt-[clamp(0.32rem,0.85vw,0.56rem)] flex w-full shrink-0 flex-col items-center gap-[clamp(0.18rem,0.48vw,0.32rem)] text-[clamp(0.52rem,1.14vw,0.74rem)] font-medium tracking-[0.035em]">
              <div className="max-w-full truncate" title={day.windLine}>{day.windLine}</div>
              <div className="max-w-full truncate" title={day.precipLine}>{day.precipLine}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MirrorWeatherIcon({ wmo }: { wmo: number | null | undefined }) {
  const kind = mirrorWeatherIconKind(wmo)

  return (
    <svg className="h-full w-full overflow-visible" viewBox="0 0 100 100" aria-hidden="true">
      {(kind === 'sun' || kind === 'partly') && <MirrorWeatherSun compact={kind === 'partly'} />}
      {kind !== 'sun' && (
        <g>
          {kind === 'partly' && <MirrorWeatherCloud mask />}
          <MirrorWeatherCloud />
        </g>
      )}
      {kind === 'rain' && <MirrorWeatherRain count={mirrorWeatherRainLineCount(wmo)} />}
      {kind === 'sleet' && (
        <>
          <MirrorWeatherRain count={2} />
          <MirrorWeatherSnow compact />
        </>
      )}
      {kind === 'snow' && <MirrorWeatherSnow />}
      {kind === 'thunder' && <MirrorWeatherLightning />}
      {kind === 'fog' && <MirrorWeatherFog />}
    </svg>
  )
}

function LandscapeFrameMirror({
  snapshot,
  fallbackLanguage,
  theme,
  status,
}: {
  snapshot: PhysicalFrameSnapshot | null
  fallbackLanguage: AppLanguage
  theme: 'dark' | 'light'
  status: MemberRow | null
}) {
  const language = snapshot?.language ?? fallbackLanguage
  const isDark = theme === 'dark'
  const background = isDark ? '#061b24' : '#eef2f6'
  const frameBackground = background
  const textColor = isDark ? '#eef8ff' : '#07141c'
  const mutedColor = isDark ? 'rgba(238,248,255,0.58)' : 'rgba(7,20,28,0.58)'
  const borderColor = isDark ? 'rgba(238,248,255,0.18)' : 'rgba(7,20,28,0.16)'
  const batteryPercent = normalizeBatteryPercent(status?.battery_percent)
  const isCharging = status?.is_usb_present === true || status?.is_charging === true
  const batteryLabel = language === 'no' ? 'Batteri' : 'Battery'
  const inverseColor = isDark ? '#07141c' : '#eef2f6'
  const mirrorStyle: React.CSSProperties & Record<'--fg' | '--fg-50' | '--bd-15' | '--mirror-bg' | '--mirror-bg-inverse' | '--mirror-fg-inverse', string> = {
    background,
    color: textColor,
    '--fg': textColor,
    '--fg-50': mutedColor,
    '--bd-15': borderColor,
    '--mirror-bg': frameBackground,
    '--mirror-bg-inverse': textColor,
    '--mirror-fg-inverse': inverseColor,
  }

  const renderMirrorCell: FrameCellRenderer = (module, slot, size) => {
    if (!snapshot || !module) {
      return <div className="text-sm tracking-widest opacity-35">—</div>
    }

    const liveDetail = snapshot.detailsBySlot[String(slot)]
    if (!liveDetail && module !== 'date') {
      return <div className="text-sm text-[color:var(--fg-50)]">{moduleLoadingText(language, module)}</div>
    }

    const detail = liveDetail ?? frameModuleDetail(module, slot, snapshot.modulesJson, language, snapshot.cells)
    const cfg = moduleConfigForSlot(module, slot, snapshot.cells, snapshot.modulesJson)

    if (module === 'weather' && size === 'small' && detail.weatherLowTemp && detail.weatherHighTemp) {
      const locationName = String(detail.secondary || detail.primary || 'Weather').trim()
      const tempRange = formatMirrorSmallWeatherTempRange(detail.weatherLowTemp, detail.weatherHighTemp)
      const windLine = detail.weatherWindLine || 'Calm winds'
      const precipLine = detail.weatherPrecipLine || 'Mostly dry'

      return (
        <div className="flex h-full w-full flex-col items-center justify-center overflow-hidden px-[clamp(0.7rem,1.9vw,1.25rem)] py-[clamp(0.46rem,1.2vw,0.8rem)] text-center leading-none">
          <MirrorModuleHeader title={locationName} className="max-w-[86%]" />

          <div className="mt-[clamp(0.55rem,1.42vw,0.95rem)] grid w-full max-w-[96%] shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center overflow-hidden text-[clamp(0.56rem,1.24vw,0.8rem)] font-medium tracking-[0.045em]">
            <div className="min-w-0 truncate px-[clamp(0.08rem,0.34vw,0.28rem)] text-center" title={tempRange}>{tempRange}</div>
            <div className="h-[clamp(0.72rem,1.45vw,0.92rem)] w-px" style={{ backgroundColor: textColor }} aria-hidden="true" />
            <div className="min-w-0 truncate px-[clamp(0.08rem,0.34vw,0.28rem)] text-center" title={windLine}>{windLine}</div>
            <div className="h-[clamp(0.72rem,1.45vw,0.92rem)] w-px" style={{ backgroundColor: textColor }} aria-hidden="true" />
            <div className="min-w-0 truncate px-[clamp(0.08rem,0.34vw,0.28rem)] text-center" title={precipLine}>{precipLine}</div>
          </div>
        </div>
      )
    }

    if (module === 'weather' && size === 'large' && detail.weatherLowTemp && detail.weatherHighTemp) {
      if (snapshot.layoutKey === 'full') {
        return <MirrorXLWeatherCard detail={detail} textColor={textColor} />
      }

      return <MirrorLargeWeatherCard detail={detail} textColor={textColor} />
    }

    if (module === 'weather' && size === 'medium' && detail.weatherLowTemp && detail.weatherHighTemp) {
      return (
        <div className="flex h-full w-full flex-col items-center overflow-hidden px-[clamp(0.55rem,1.7vw,1.2rem)] pt-[clamp(0.55rem,1.45vw,0.95rem)] pb-[clamp(0.55rem,1.45vw,0.95rem)] text-center leading-tight">
          <div className="flex shrink-0 items-center justify-center border-b border-current pb-[clamp(0.06rem,0.18vw,0.12rem)] text-[clamp(0.88rem,2.05vw,1.35rem)] font-semibold tracking-[0.08em]">
            <span className="min-w-0 truncate px-[clamp(0.32rem,0.8vw,0.62rem)]">{detail.weatherLowTemp}</span>
            <span className="h-[clamp(1.05rem,2.25vw,1.45rem)] w-px shrink-0" style={{ backgroundColor: textColor }} aria-hidden="true" />
            <span className="min-w-0 truncate px-[clamp(0.32rem,0.8vw,0.62rem)]">{detail.weatherHighTemp}</span>
          </div>

          <div className="mt-[clamp(0.28rem,0.75vw,0.5rem)] flex min-h-[clamp(1.7rem,4.2vw,2.55rem)] w-full shrink-0 items-center justify-center px-[clamp(0.25rem,0.8vw,0.55rem)] text-[clamp(0.66rem,1.55vw,1rem)] font-medium tracking-[0.035em]">
            <div className="line-clamp-2 max-w-full">{detail.weatherAdvice}</div>
          </div>

          <div className="flex min-h-0 w-full flex-1 items-center justify-center py-[clamp(0.14rem,0.45vw,0.35rem)]">
            <div className="aspect-square h-[clamp(2.4rem,7vw,4.8rem)] max-h-full max-w-[34%] overflow-hidden">
              <MirrorWeatherIcon wmo={detail.weatherWmo} />
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-center justify-center gap-[clamp(0.1rem,0.35vw,0.24rem)] text-[clamp(0.55rem,1.25vw,0.82rem)] font-medium tracking-[0.06em]">
            <div className="max-w-full truncate">{detail.weatherWindLine || 'Calm winds'}</div>
            <div className="max-w-full truncate">{detail.weatherPrecipLine || 'Mostly dry'}</div>
          </div>
        </div>
      )
    }

    if (module === 'date' && size === 'large' && snapshot.layoutKey === 'full') {
      return (
        <MirrorXLDateView
          language={language}
          textColor={textColor}
          frameBackground={frameBackground}
          holidays={mirrorHolidaysFromConfig(cfg)}
        />
      )
    }

    if (module === 'date' && size === 'large') {
      return (
        <div className="grid h-full w-full grid-cols-[0.42fr_0.58fr] items-stretch overflow-hidden">
          <div className="min-w-0 overflow-hidden">
            <MirrorMediumDateCard language={language} textColor={textColor} frameBackground={frameBackground} />
          </div>
          <div className="min-w-0 overflow-hidden">
            <MirrorMonthCalendar textColor={textColor} language={language} />
          </div>
        </div>
      )
    }

    if (module === 'date' && size === 'medium') {
      return <MirrorMediumDateCard language={language} textColor={textColor} frameBackground={frameBackground} />
    }

    if (module === 'date' && size === 'small') {
      return (
        <div className="flex h-full w-full items-center justify-center px-3 text-center leading-tight">
          <div className="max-w-full text-[clamp(0.95rem,2.6vw,1.55rem)] font-semibold tracking-[0.08em]">
            {formatSmallMirrorDate(language)}
          </div>
        </div>
      )
    }

    if (module === 'soccer' && size === 'large') {
      const fallback = frameModuleDetail(module, slot, snapshot.modulesJson, language, snapshot.cells)
      if (snapshot.layoutKey === 'full') {
        return <MirrorXLSoccerCard detail={detail} fallback={fallback} />
      }
      return <MirrorLargeSoccerCard detail={detail} fallback={fallback} />
    }

    if (module === 'soccer' && size === 'medium') {
      const fallback = frameModuleDetail(module, slot, snapshot.modulesJson, language, snapshot.cells)
      return <MirrorMediumSoccerCard detail={detail} fallback={fallback} />
    }

    if (module === 'soccer' && size === 'small') {
      const fallback = frameModuleDetail(module, slot, snapshot.modulesJson, language, snapshot.cells)
      return <MirrorSmallSoccerCard detail={detail} fallback={fallback} />
    }

    if (module === 'stocks' && size === 'large') {
      const fallback = frameModuleDetail(module, slot, snapshot.modulesJson, language, snapshot.cells)
      if (snapshot.layoutKey === 'full') {
        return <MirrorXLStocksCard detail={detail} fallback={fallback} textColor={textColor} />
      }
      return <MirrorLargeStocksCard detail={detail} fallback={fallback} textColor={textColor} />
    }

    if (module === 'stocks' && size === 'medium') {
      const fallback = frameModuleDetail(module, slot, snapshot.modulesJson, language, snapshot.cells)
      return <MirrorMediumStocksCard detail={detail} fallback={fallback} textColor={textColor} language={language} />
    }

    if (module === 'stocks' && size === 'small') {
      const fallback = frameModuleDetail(module, slot, snapshot.modulesJson, language, snapshot.cells)
      return <MirrorSmallStocksCard detail={detail} fallback={fallback} textColor={textColor} />
    }

    if (module === 'groceries' && size === 'large' && snapshot.layoutKey === 'full') {
      return <MirrorGroceriesXLCard detail={detail} language={language} mutedColor={mutedColor} />
    }

    if (module === 'groceries' && size === 'large') {
      return <MirrorGroceriesLargeCard detail={detail} language={language} mutedColor={mutedColor} />
    }

    if (module === 'groceries' && size === 'medium') {
      return <MirrorGroceriesMediumCard detail={detail} language={language} mutedColor={mutedColor} />
    }

    if (module === 'reminders' && size === 'large') {
      if (snapshot.layoutKey === 'full') {
        return <MirrorXLRemindersCard detail={detail} language={language} mutedColor={mutedColor} frameBackground={frameBackground} textColor={textColor} />
      }
      return <MirrorLargeRemindersCard detail={detail} language={language} mutedColor={mutedColor} frameBackground={frameBackground} textColor={textColor} />
    }

    if (module === 'reminders' && size === 'medium') {
      return <MirrorMediumRemindersCard detail={detail} language={language} mutedColor={mutedColor} frameBackground={frameBackground} textColor={textColor} />
    }

    if (module === 'reminders' && size === 'small') {
      return <MirrorSmallRemindersCard detail={detail} language={language} borderColor={borderColor} mutedColor={mutedColor} />
    }

    if (module === 'groceries' && size === 'small') {
      const visibleItems = mirrorGroceriesVisibleItems(detail)
      const overflowLabel = mirrorGroceriesOverflowLabel(detail, language)
      const header = mirrorGroceriesHeader(detail, language)
      const emptyMessage = mirrorGroceriesEmptyMessage(language)

      const hasVisibleItems = visibleItems.length > 0
      const headerOffsetStyle = {
        transform: hasVisibleItems
          ? 'translateY(clamp(5px, 0.7vw, 8px))'
          : 'translateY(clamp(1px, 0.25vw, 3px))',
      }
      const contentOffsetStyle = { transform: 'translateY(clamp(3px, 0.45vw, 5px))' }

      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-[clamp(0.22rem,0.65vw,0.42rem)] px-[clamp(0.45rem,1.2vw,0.8rem)] py-[clamp(0.35rem,0.9vw,0.55rem)] text-center leading-none">
          <MirrorModuleHeader title={header} style={headerOffsetStyle} />

          {visibleItems.length <= 0 ? (
            <div className="max-w-full truncate text-[clamp(0.68rem,1.55vw,0.92rem)] font-medium tracking-[0.08em]" style={{ ...contentOffsetStyle, color: mutedColor }}>
              {emptyMessage}
            </div>
          ) : (
            <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col items-stretch justify-center gap-[clamp(0.08rem,0.22vw,0.16rem)]" style={contentOffsetStyle}>
              <div className="flex min-h-0 w-full min-w-0 flex-1 items-center justify-center">
                {visibleItems.map((item, index) => (
                  <React.Fragment key={`${item}-${index}`}>
                    {index > 0 && (
                      <div
                        className="pointer-events-none h-[46%] w-px shrink-0"
                        style={{ backgroundColor: borderColor }}
                        aria-hidden="true"
                      />
                    )}
                    <div
                      className="flex min-w-0 flex-1 items-center justify-center truncate px-[clamp(0.3rem,0.85vw,0.55rem)] text-center text-[clamp(0.68rem,1.6vw,0.96rem)] font-medium tracking-[0.06em]"
                      title={item}
                    >
                      <span className="block max-w-full truncate">{item}</span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
              {overflowLabel && (
                <div className="grid w-full shrink-0 grid-cols-3 text-[clamp(0.5rem,1.18vw,0.72rem)] font-medium tracking-[0.06em]" style={{ color: mutedColor }}>
                  <div className="col-start-2 min-w-0 truncate px-[clamp(0.3rem,0.85vw,0.55rem)] text-center" title={overflowLabel}>
                    {overflowLabel}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )
    }


    if (module === 'countdown' && size === 'large') {
      const fallbackTitle = String(cfg.title ?? cfg.name ?? '').trim() || tx(language).modules.countdown
      if (snapshot.layoutKey === 'full') {
        return <MirrorXLCountdownCard detail={detail} fallbackTitle={fallbackTitle} textColor={textColor} />
      }
      return <MirrorLargeCountdownCard detail={detail} fallbackTitle={fallbackTitle} />
    }

    if (module === 'countdown' && size === 'medium') {
      const fallbackTitle = String(cfg.title ?? cfg.name ?? '').trim() || tx(language).modules.countdown
      return <MirrorMediumCountdownCard detail={detail} fallbackTitle={fallbackTitle} />
    }

    if (module === 'countdown' && size === 'small') {
      const title = detail.countdownTitle || detail.primary || String(cfg.title ?? cfg.name ?? '').trim() || tx(language).modules.countdown
      const daysLeft = typeof detail.countdownDaysLeft === 'number' ? detail.countdownDaysLeft : null
      const line = daysLeft === null ? title : buildSmallMirrorCountdownLine(title, daysLeft)

      return (
        <div className="flex h-full w-full items-center justify-center px-[clamp(0.45rem,1.2vw,0.8rem)] text-center leading-tight">
          <div className="max-w-full truncate text-[clamp(0.72rem,1.8vw,1.08rem)] font-semibold tracking-[0.08em]" title={line}>
            {line}
          </div>
        </div>
      )
    }

    if (module === 'surf' && size === 'small') {
      return <MirrorSmallSurfCard detail={detail} mutedColor={mutedColor} borderColor={borderColor} frameBackground={frameBackground} />
    }

    if (module === 'surf' && size === 'large') {
      if (snapshot.layoutKey === 'full') {
        return (
          <MirrorXLSurfCard
            detail={detail}
            mutedColor={mutedColor}
            borderColor={borderColor}
            frameBackground={frameBackground}
            textColor={textColor}
          />
        )
      }

      return (
        <MirrorLargeSurfCard
          detail={detail}
          mutedColor={mutedColor}
          borderColor={borderColor}
          frameBackground={frameBackground}
          textColor={textColor}
        />
      )
    }

    if (module === 'surf' && size === 'medium') {
      const rating = detail.rating ?? Number(detail.primary)
      const waveRange = detail.waveRange || detail.tertiary || '--'
      const spotName = detail.secondary || detail.primary || 'Surf'
      const trend = mirrorSurfTrend(detail)

      return (
        <div className="relative flex h-full w-full flex-col px-[clamp(0.7rem,2.2vw,1.6rem)] py-[clamp(0.45rem,1.5vw,1.1rem)] text-center leading-tight">
          {detail.isTodaysBest && (
            <div className="absolute left-[clamp(0.45rem,1.4vw,0.9rem)] top-[clamp(0.3rem,0.9vw,0.65rem)] max-w-[52%] truncate text-[clamp(0.45rem,1vw,0.68rem)] font-semibold tracking-[0.16em]" style={{ color: mutedColor }}>
              Best next 4h:
            </div>
          )}

          {trend && (
            <div
              className="absolute right-[clamp(0.45rem,1.4vw,0.9rem)] top-[clamp(0.3rem,0.9vw,0.65rem)] text-[clamp(0.45rem,1vw,0.68rem)] font-semibold leading-none tracking-[0.16em]"
              style={{ color: mutedColor }}
              title={trend.label}
              aria-label={trend.label}
            >
              {trend.symbol}
            </div>
          )}

          <MirrorModuleHeader title={spotName} className="mx-auto max-w-[78%]" style={{ borderColor: textColor }} />

          <div className="grid min-h-0 flex-1 grid-cols-[1fr_auto_1fr] grid-rows-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center pt-[clamp(0.45rem,1.1vw,0.75rem)] pb-[clamp(0.16rem,0.45vw,0.32rem)]">
            <div className="col-start-1 row-start-1 min-w-0 pr-[clamp(0.45rem,1.25vw,0.9rem)]">
              <div className="max-w-full truncate text-[clamp(0.66rem,1.55vw,1rem)] font-semibold tracking-[0.14em] uppercase">
                {mirrorSurfRatingWord(rating)}
              </div>
            </div>

            <div className="col-start-1 row-start-3 flex min-w-0 items-center justify-center self-center pr-[clamp(0.45rem,1.25vw,0.9rem)]">
              <DiceRating rating={rating} isExperienceBased={isSurfExperienceBased(detail)} muted={mutedColor} paperColor={frameBackground} />
            </div>

            <div className="col-start-1 row-start-5 min-w-0 pr-[clamp(0.45rem,1.25vw,0.9rem)]">
              <div className="max-w-full truncate text-[clamp(0.58rem,1.25vw,0.8rem)] tracking-[0.12em]">
                {waveRange}
              </div>
            </div>

            <div className="col-start-2 row-span-5 row-start-1 mx-[clamp(0.35rem,1vw,0.8rem)] h-full w-px" style={{ backgroundColor: borderColor }} />

            <div className="col-start-3 row-start-1 min-w-0 pl-[clamp(0.45rem,1.25vw,0.9rem)] text-[clamp(0.66rem,1.55vw,1rem)] font-semibold tracking-[0.14em] uppercase">
              Details:
            </div>

            <div className="col-start-3 row-start-3 grid min-w-0 grid-cols-2 items-center gap-x-[clamp(0.35rem,1vw,0.8rem)] pl-[clamp(0.45rem,1.25vw,0.9rem)]">
              <div className="flex min-w-0 justify-center text-[clamp(1rem,2.4vw,1.55rem)] leading-none" style={mirrorDirectionToStyle(detail.swellDirectionDeg)}>↑</div>
              <div className="flex min-w-0 justify-center text-[clamp(1rem,2.4vw,1.55rem)] leading-none" style={mirrorDirectionToStyle(detail.windDirectionDeg)}>↑</div>
            </div>

            <div className="col-start-3 row-start-4 grid min-w-0 grid-cols-2 items-center gap-x-[clamp(0.35rem,1vw,0.8rem)] self-center pl-[clamp(0.45rem,1.25vw,0.9rem)]">
              <div className="flex min-w-0 justify-center" title="Wave period">
                <MirrorSurfWaveIcon periodSeconds={detail.swellPeriodS} />
              </div>
              <div className="flex min-w-0 justify-center" title="Wind strength">
                <MirrorSurfWindIcon />
              </div>
            </div>

            <div className="col-start-3 row-start-5 grid min-w-0 grid-cols-2 items-center gap-x-[clamp(0.35rem,1vw,0.8rem)] pl-[clamp(0.45rem,1.25vw,0.9rem)] text-[clamp(0.58rem,1.25vw,0.8rem)] tracking-[0.12em]">
              <div className="truncate">{formatMirrorMetric(detail.swellPeriodS, 's')}</div>
              <div className="truncate">{formatMirrorMetric(detail.windSpeedMs, 'm/s')}</div>
            </div>
          </div>
        </div>
      )
    }

    const secondarySize = size === 'large' ? 'text-[clamp(0.85rem,2vw,1.4rem)]' : 'text-[clamp(0.65rem,1.6vw,1rem)]'

    return (
      <div className="max-w-full px-3 text-center leading-tight">
        <MirrorModuleHeader title={detail.primary} />
        {detail.secondary && (
          <div className={`${secondarySize} mt-2 tracking-[0.18em] uppercase truncate`} style={{ color: mutedColor }}>
            {detail.secondary}
          </div>
        )}
        {detail.tertiary && (
          <div className="mt-1 text-[clamp(0.6rem,1.3vw,0.9rem)] tracking-[0.12em] truncate" style={{ color: mutedColor }}>
            {detail.tertiary}
          </div>
        )}
      </div>
    )
  }

  return (
    <main
      className="fixed inset-0 z-[100] overflow-hidden"
      style={mirrorStyle}
    >
      <div className="relative w-screen h-screen overflow-hidden" style={{ background: frameBackground }}>
        <div
          className="pointer-events-none absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.65rem,calc(env(safe-area-inset-top)+0.15rem))] z-10 inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
          aria-label={
            batteryPercent !== null
              ? `${batteryLabel} ${batteryPercent}%${isCharging ? ' charging' : ''}`
              : `${batteryLabel} unavailable`
          }
          style={{ color: mutedColor }}
        >
          <span className="text-[clamp(0.6rem,1.45vw,0.78rem)] font-medium leading-none tracking-[0.06em] opacity-80">
            {batteryPercent !== null ? `${batteryPercent}%` : '--%'}
          </span>
          <BatteryIcon percent={batteryPercent ?? 0} className="h-[clamp(0.65rem,1.55vw,0.85rem)] w-[clamp(1.05rem,2.55vw,1.35rem)] opacity-75" />
          {isCharging && <ChargingBoltIcon className="h-[clamp(0.7rem,1.65vw,0.9rem)] w-[clamp(0.5rem,1.15vw,0.65rem)] opacity-75" />}
        </div>

        {snapshot ? (
          <FrameLayoutRenderer
            layoutKey={snapshot.layoutKey}
            cells={snapshot.cells}
            language={language}
            renderCellContent={renderMirrorCell}
            frameClassName="pointer-events-none select-none"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm tracking-[0.35em] uppercase" style={{ color: mutedColor }}>
            {tx(language).loadingFrame}
          </div>
        )}
      </div>
    </main>
  )
}

function PickerModal({
  onClose,
  onPick,
  onClear,
  language,
}: {
  onClose: () => void
  onPick: (m: ModuleKey) => void
  onClear: () => void
  language: AppLanguage
}) {
  const options: ModuleKey[] = ['date', 'weather', 'surf', 'reminders', 'countdown', 'soccer', 'stocks', 'groceries']
  const sortedOptions = [...options].sort((a, b) =>
    moduleLabel(language, a).localeCompare(moduleLabel(language, b), language === 'no' ? 'nb' : 'en')
  )
  const t = tx(language)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--overlay-55)]">
      <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] px-5 pt-5 pb-8">
        <div className="flex items-center justify-between">
          <div className="tracking-widest text-sm text-[color:var(--fg-70)]">{t.selectWidget}</div>
          <button onClick={onClose} className="text-[color:var(--fg-60)] text-xl">
            ✕
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {sortedOptions.map((m) => (
            <button
              key={m}
              onClick={() => onPick(m)}
              className="h-12 rounded-2xl border border-[color:var(--bd-15)] text-[color:var(--fg-80)] tracking-widest"
            >
              {moduleLabel(language, m)}
            </button>
          ))}
        </div>

        <div className="mt-5 flex justify-center">
          <button
            onClick={onClear}
            className="h-12 w-full rounded-2xl border border-[color:var(--bd-15)] text-[color:var(--fg-50)] tracking-widest"
          >
            {t.clearCell}
          </button>
        </div>
      </div>
    </div>
  )
}

function ThemePickerModal({
  current,
  onClose,
  onPick,
  language,
}: {
  current: 'dark' | 'light'
  onClose: () => void
  onPick: (t: 'dark' | 'light') => void
  language: AppLanguage
}) {
  const t = tx(language)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--overlay-55)]">
      <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] px-5 pt-5 pb-8">
        <div className="flex items-center justify-between">
          <div className="tracking-widest text-sm text-[color:var(--fg-70)]">{t.themeTitle}</div>
          <button onClick={onClose} className="text-[color:var(--fg-60)] text-xl">
            ✕
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={() => onPick('dark')}
            className={`h-12 rounded-2xl border tracking-widest ${
              current === 'dark' ? 'border-[#2aa3ff] text-[#2aa3ff]' : 'border-[color:var(--bd-15)] text-[color:var(--fg-80)]'
            }`}
          >
            {t.dark}
          </button>

          <button
            onClick={() => onPick('light')}
            className={`h-12 rounded-2xl border tracking-widest ${
              current === 'light' ? 'border-[#2aa3ff] text-[#2aa3ff]' : 'border-[color:var(--bd-15)] text-[color:var(--fg-80)]'
            }`}
          >
            {t.light}
          </button>
        </div>
      </div>
    </div>
  )
}

function LanguagePickerModal({
  current,
  onClose,
  onPick,
}: {
  current: AppLanguage
  onClose: () => void
  onPick: (t: AppLanguage) => void
}) {
  const t = tx(current)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--overlay-55)]">
      <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] px-5 pt-5 pb-8">
        <div className="flex items-center justify-between">
          <div className="tracking-widest text-sm text-[color:var(--fg-70)]">{t.languageTitle}</div>
          <button onClick={onClose} className="text-[color:var(--fg-60)] text-xl">
            ✕
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={() => onPick('en')}
            className={`h-12 rounded-2xl border tracking-widest ${
              current === 'en' ? 'border-[#2aa3ff] text-[#2aa3ff]' : 'border-[color:var(--bd-15)] text-[color:var(--fg-80)]'
            }`}
          >
            {current === 'no' ? 'Engelsk' : 'English'}
          </button>

          <button
            onClick={() => onPick('no')}
            className={`h-12 rounded-2xl border tracking-widest ${
              current === 'no' ? 'border-[#2aa3ff] text-[#2aa3ff]' : 'border-[color:var(--bd-15)] text-[color:var(--fg-80)]'
            }`}
          >
            {current === 'no' ? 'Norsk' : 'Norwegian'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FontSizePickerModal({
  current,
  onClose,
  onPick,
  language,
}: {
  current: AppFontSize
  onClose: () => void
  onPick: (t: AppFontSize) => void
  language: AppLanguage
}) {
  const t = tx(language)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--overlay-55)]">
      <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] px-5 pt-5 pb-8">
        <div className="flex items-center justify-between">
          <div className="tracking-widest text-sm text-[color:var(--fg-70)]">{t.fontSizeTitle}</div>
          <button onClick={onClose} className="text-[color:var(--fg-60)] text-xl">
            ✕
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={() => onPick('normal')}
            className={`h-12 rounded-2xl border tracking-widest ${
              current === 'normal' ? 'border-[#2aa3ff] text-[#2aa3ff]' : 'border-[color:var(--bd-15)] text-[color:var(--fg-80)]'
            }`}
          >
            {t.normal}
          </button>

          <button
            onClick={() => onPick('large')}
            className={`h-12 rounded-2xl border tracking-widest ${
              current === 'large' ? 'border-[#2aa3ff] text-[#2aa3ff]' : 'border-[color:var(--bd-15)] text-[color:var(--fg-80)]'
            }`}
          >
            {t.large}
          </button>
        </div>
      </div>
    </div>
  )
}

function SettingsTab({
  language,
  theme,
  fontSize,
  onOpenTheme,
  onOpenLanguage,
  onOpenFontSize,
  frames,
  activeDeviceId,
  onSelectDevice,
  onFramesChanged,
  onLogout,
  onGo,
}: {
  language: AppLanguage
  theme: 'dark' | 'light'
  fontSize: AppFontSize
  onOpenTheme: () => void
  onOpenLanguage: () => void
  onOpenFontSize: () => void
  frames: MemberRow[]
  activeDeviceId: string | null
  onSelectDevice: (id: string) => void
  onFramesChanged: (frames: MemberRow[]) => void
  onLogout: () => void
  onGo: (path: string) => void
}) {
  const from = '?from=settings'
  const t = tx(language)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)

  function updateFadeState() {
    const el = scrollRef.current
    if (!el) {
      setShowTopFade(false)
      setShowBottomFade(false)
      return
    }

    const hasOverflow = el.scrollHeight > el.clientHeight + 1
    if (!hasOverflow) {
      setShowTopFade(false)
      setShowBottomFade(false)
      return
    }

    setShowTopFade(el.scrollTop > 2)
    setShowBottomFade(el.scrollTop + el.clientHeight < el.scrollHeight - 2)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    updateFadeState()

    const onScroll = () => updateFadeState()
    el.addEventListener('scroll', onScroll, { passive: true })

    const ro = new ResizeObserver(() => updateFadeState())
    ro.observe(el)

    const t1 = window.setTimeout(updateFadeState, 50)
    const t2 = window.setTimeout(updateFadeState, 180)

    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [frames.length, activeDeviceId, theme, language, fontSize])

  const languageValue = language === 'en' ? 'English' : 'Norsk'
  const fontSizeValue = fontSize === 'large' ? (language === 'no' ? 'Stor' : 'Large') : (language === 'no' ? 'Normal' : 'Normal')

  return (
    <>
      <style jsx>{`
        .settings-scroll {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .settings-scroll::-webkit-scrollbar {
          display: none;
        }
      `}</style>

      <div className="h-full flex flex-col min-h-0">
        <div className="relative flex-1 min-h-0">
          {showTopFade && (
            <div className="pointer-events-none absolute top-0 left-0 right-0 z-10 h-6 bg-gradient-to-b from-[color:var(--app-bg)] to-transparent" />
          )}

          {showBottomFade && (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-12 bg-gradient-to-t from-[color:var(--app-bg)] to-transparent" />
          )}

          <div ref={scrollRef} className="settings-scroll h-full overflow-y-auto pr-1 pb-4">
            <div className="mt-2 space-y-2">
              <SettingRow label={t.themeRow} value={theme === 'dark' ? (language === 'no' ? 'Mørk' : 'Dark') : (language === 'no' ? 'Lys' : 'Light')} onClick={onOpenTheme} />
              <SettingRow label={t.languageRow} value={languageValue} onClick={onOpenLanguage} />
              <SettingRow label={t.fontSizeRow} value={fontSizeValue} onClick={onOpenFontSize} />
              <SettingRow label={t.privacyPolicy} value="" onClick={() => onGo(`/privacy${from}`)} />
              <SettingRow label={t.termsAndConditions} value="" onClick={() => onGo(`/terms${from}`)} />
              <SettingRow label={t.contact} value="" onClick={() => onGo(`/contact${from}`)} />
              <SettingRow label={t.shop} value="" onClick={() => onGo('/shop')} />
            </div>

            <div className="mt-8">
              <MyFramesSection
                language={language}
                frames={frames}
                activeDeviceId={activeDeviceId}
                onSelectDevice={onSelectDevice}
                onFramesChanged={onFramesChanged}
              />
            </div>
          </div>
        </div>

        <div className="shrink-0 pt-3 pb-[6px]">
          <div className="border-t border-[color:var(--bd-10)] mb-2" />
          <SettingRow label={t.logout} value="" onClick={onLogout} variant="danger" />
        </div>
      </div>
    </>
  )
}

function SettingRow({
  label,
  value,
  onClick,
  variant = 'normal',
}: {
  label: string
  value: string
  onClick?: () => void
  variant?: 'normal' | 'danger'
}) {
  const isDanger = variant === 'danger'
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between py-4 text-left transition ${
        isDanger ? 'border-b border-[color:var(--danger-bd)] hover:bg-[color:var(--danger-bg)]' : 'border-b border-[color:var(--bd-10)] hover:bg-[color:var(--panel-05)]'
      }`}
      disabled={!onClick}
    >
      <div className={isDanger ? 'text-[color:var(--danger)]' : 'text-[color:var(--fg-70)]'}>{label}</div>
      <div className={isDanger ? 'text-[color:var(--danger)] opacity-70' : 'text-[color:var(--fg-50)]'}>{value}</div>
    </button>
  )
}

function PairFrameForm({
  language,
  frames,
  onPairingComplete,
  compact = false,
}: {
  language: AppLanguage
  frames: MemberRow[]
  onPairingComplete: (frames: MemberRow[], preferredDeviceId?: string | null) => void | Promise<void>
  compact?: boolean
}) {
  const [code, setCode] = useState('')
  const [pairing, setPairing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageKind, setMessageKind] = useState<'ok' | 'error'>('ok')
  const t = tx(language)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pairing) return

    const cleaned = code.trim().toUpperCase()
    if (!cleaned) return

    try {
      setPairing(true)
      setMessage(null)

      const result = await claimPairCodeAndLoadFrames(cleaned, frames)
      if (result.frames.length === 0) throw new Error(t.invalidPairCode)

      await onPairingComplete(result.frames, result.newlyAddedDeviceId)
      setCode('')
      setMessageKind('ok')
      setMessage(t.frameAdded)
    } catch (e: unknown) {
      setMessageKind('error')
      const message = errorMessage(e)
      setMessage(message === 'INVALID_PAIR_CODE' ? t.invalidPairCode : message)
    } finally {
      setPairing(false)
    }
  }

  return (
    <form onSubmit={submit} className={compact ? 'space-y-3' : 'w-full space-y-4'}>
      <label className="block text-left">
        <span className="block mb-2 text-xs uppercase tracking-[0.24em] text-[color:var(--fg-50)]">
          {language === 'no' ? 'Paringskode' : 'Pair code'}
        </span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoComplete="one-time-code"
          inputMode="text"
          maxLength={12}
          placeholder="K7D4"
          className="w-full h-14 rounded-2xl border border-[color:var(--bd-20)] bg-[color:var(--panel-05)] px-4 text-center text-xl tracking-[0.32em] text-[color:var(--fg)] outline-none focus:border-[#2aa3ff]"
          disabled={pairing}
        />
      </label>

      <button
        type="submit"
        disabled={pairing || code.trim().length === 0}
        className="w-full h-14 rounded-2xl border border-[#2aa3ff] bg-[#2aa3ff] text-white tracking-[0.24em] text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pairing ? t.loading : (language === 'no' ? 'LEGG TIL FRAME' : 'ADD FRAME')}
      </button>

      {message && (
        <div className={`text-sm ${messageKind === 'ok' ? 'text-[#2aa3ff]' : 'text-[color:var(--danger)]'}`} role="status">
          {message}
        </div>
      )}
    </form>
  )
}

function FirstFrameOnboarding({
  language,
  frames,
  onPairingComplete,
}: {
  language: AppLanguage
  frames: MemberRow[]
  onPairingComplete: (frames: MemberRow[], preferredDeviceId?: string | null) => void | Promise<void>
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[color:var(--app-bg)] px-5 text-[color:var(--fg)]">
      <div className="w-full max-w-[360px] rounded-[28px] border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-6 py-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.18)] backdrop-blur">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-[color:var(--bd-15)] text-xl tracking-[-0.08em] text-[color:var(--fg-80)]">
          R
        </div>
        <h1 className="text-2xl font-medium tracking-[-0.03em] text-[color:var(--fg)]">Add your first frame</h1>
        <p className="mt-3 mb-7 text-sm leading-6 text-[color:var(--fg-60)]">
          Pair your RE:MIND frame to start using the app.
        </p>

        <PairFrameForm
          language={language}
          frames={frames}
          onPairingComplete={onPairingComplete}
        />
      </div>
    </div>
  )
}

function MyFramesSection({
  language,
  frames,
  activeDeviceId,
  onSelectDevice,
  onFramesChanged,
}: {
  language: AppLanguage
  frames: MemberRow[]
  activeDeviceId: string | null
  onSelectDevice: (id: string) => void
  onFramesChanged: (frames: MemberRow[]) => void
}) {
  const [loading, setLoading] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareCode, setShareCode] = useState('')
  const [shareError, setShareError] = useState<string | null>(null)
  const [copyDone, setCopyDone] = useState(false)

  const t = tx(language)
  const batteryLabel = language === 'no' ? 'Batteri' : 'Battery'

  async function reload() {
    setLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session

      if (!session) {
        onFramesChanged([])
        return
      }

      onFramesChanged(await fetchCurrentUserFrames(session.user.id))
    } finally {
      setLoading(false)
    }
  }

  async function addFrame() {
    const existingDeviceIds = new Set(frames.map((f) => f.device_id))

    const code = prompt(t.addFramePrompt)
    if (!code) return

    try {
      const result = await claimPairCodeAndLoadFrames(code, frames)
      onFramesChanged(result.frames)

      const newlyAddedFrame = result.newlyAddedDeviceId
        ? result.frames.find((f) => f.device_id === result.newlyAddedDeviceId)
        : result.frames.find((f) => !existingDeviceIds.has(f.device_id))
      if (newlyAddedFrame) {
        onSelectDevice(newlyAddedFrame.device_id)
      }

      alert(t.frameAdded)
    } catch (e: unknown) {
      const message = errorMessage(e)
      alert(message === 'INVALID_PAIR_CODE' ? t.invalidPairCode : message)
    }
  }

  async function openShare() {
    if (!activeDeviceId) return

    try {
      setShareOpen(true)
      setShareLoading(true)
      setShareError(null)
      setShareCode('')
      setCopyDone(false)

      const { data, error } = await supabase.rpc('create_member_pair_code', {
        p_device_id: activeDeviceId,
      })

      if (error) throw error

      const code = String(data || '').trim().toUpperCase()
      if (!code) throw new Error(language === 'no' ? 'Kunne ikke lage kode' : 'Could not create code')

      setShareCode(code)
    } catch (e: any) {
      setShareError(String(e?.message || e))
    } finally {
      setShareLoading(false)
    }
  }

  async function copyCode() {
    if (!shareCode) return

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareCode)
      } else {
        const ta = document.createElement('textarea')
        ta.value = shareCode
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        ta.style.pointerEvents = 'none'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }

      setCopyDone(true)
      window.setTimeout(() => setCopyDone(false), 1200)
    } catch (e) {
      setShareError(language === 'no' ? 'Klarte ikke kopiere koden' : 'Could not copy the code')
    }
  }

  async function nativeShare() {
    if (!shareCode) return

    const text =
      language === 'no'
        ? `Bruk denne koden for å legge til Frame i appen: ${shareCode}`
        : `Use this code to add the Frame in the app: ${shareCode}`

    try {
      if (navigator.share) {
        await navigator.share({
          title: language === 'no' ? 'Del Frame' : 'Share Frame',
          text,
        })
        return
      }

      await copyCode()
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      await copyCode()
    }
  }

  return (
    <>
      <div className="border border-[color:var(--bd-10)] rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="tracking-widest text-sm text-[color:var(--fg-70)]">{t.myFrames}</div>

          <div className="flex items-center gap-2">
            <button
              onClick={addFrame}
              className="px-3 py-1 border border-[color:var(--bd-20)] rounded-lg text-xs tracking-widest text-[color:var(--fg-70)]"
            >
              {t.addFrame}
            </button>

            <button
              onClick={openShare}
              disabled={!activeDeviceId}
              className={`px-3 py-1 border rounded-lg text-xs tracking-widest ${
                activeDeviceId
                  ? 'border-[color:var(--bd-20)] text-[color:var(--fg-70)]'
                  : 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]'
              }`}
            >
              {language === 'no' ? '+ DEL FRAME' : '+ SHARE FRAME'}
            </button>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {loading && <div className="text-[color:var(--fg-50)] text-sm">{t.loading}</div>}
          {!loading && frames.length === 0 && <div className="text-[color:var(--fg-40)] text-sm">{t.noFramesYet}</div>}

          {frames.map((f) => {
            const selected = f.device_id === activeDeviceId
            const batteryPercent = normalizeBatteryPercent(f.battery_percent)
            const hasBattery = batteryPercent !== null
            const isCharging = f.is_usb_present === true || f.is_charging === true
            return (
              <button
                key={f.device_id}
                onClick={() => onSelectDevice(f.device_id)}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-xl border text-left ${
                  selected ? 'border-[#2aa3ff] text-[#2aa3ff]' : 'border-[color:var(--bd-10)] text-[color:var(--fg-70)]'
                }`}
              >
                <div className="min-w-0">
                  <div className="tracking-widest text-sm">{f.device_id}</div>
                  {!!f.current_version && (
                    <div className="text-xs opacity-60 mt-1 normal-case tracking-normal">
                      {f.current_version}
                    </div>
                  )}
                </div>

                <div
                  className="shrink-0 inline-flex items-center gap-1.5 text-xs opacity-70 normal-case tracking-normal"
                  aria-label={hasBattery ? `${batteryLabel} ${batteryPercent}%${isCharging ? ' charging' : ''}` : `${batteryLabel} unavailable`}
                >
                  {isCharging && <ChargingBoltIcon />}
                  <BatteryIcon percent={batteryPercent ?? 0} />
                  <span>{hasBattery ? `${batteryPercent}%` : '--%'}</span>
                </div>

                <div className="shrink-0 text-xs opacity-70">{(f.role || 'member').toUpperCase()}</div>
              </button>
            )
          })}
        </div>
      </div>

      {shareOpen && (
        <ShareFrameCodeSheet
          language={language}
          code={shareCode}
          loading={shareLoading}
          error={shareError}
          copied={copyDone}
          onClose={() => {
            setShareOpen(false)
            setShareCode('')
            setShareError(null)
            setCopyDone(false)
          }}
          onCopy={copyCode}
        />
      )}
    </>
  )
}

function ShareFrameCodeSheet({
  language,
  code,
  loading,
  error,
  copied,
  onClose,
  onCopy,
}: {
  language: 'en' | 'no'
  code: string
  loading: boolean
  error: string | null
  copied: boolean
  onClose: () => void
  onCopy: () => void
}) {
  const isNo = language === 'no'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--overlay-55)]">
      <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] px-5 pt-5 pb-8">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="tracking-widest text-sm text-[color:var(--fg-70)]">
            {isNo ? 'DEL FRAME' : 'SHARE FRAME'}
          </div>
          <button onClick={onClose} className="text-[color:var(--fg-60)] text-xl">
            ✕
          </button>
        </div>

        {/* Main explanation */}
        <div className="mt-4 text-[color:var(--fg-80)] text-sm leading-relaxed space-y-2">
          <p>
            {isNo
              ? 'Del denne koden for å gi tilgang til din Frame.'
              : 'Share this code to give access to your Frame.'}
          </p>

          <p className="text-[color:var(--fg-60)] text-xs">
            {isNo
              ? 'Den andre brukeren åpner appen, logger inn, trykker "Legg til Frame" og skriver inn koden.'
              : 'The other user opens the app, logs in, taps "+ Add Frame" and enters the code.'}
          </p>
        </div>

        {/* Code box */}
        <div className="mt-5 rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-4 py-4 text-center">

        {loading ? (
            <div className="text-[color:var(--fg-50)] text-sm">
              {isNo ? 'Laster…' : 'Loading…'}
            </div>
          ) : error ? (
            <div className="text-[color:var(--danger)] text-sm">
              {error}
            </div>
          ) : (
            <div className="text-3xl tracking-widest font-semibold text-[color:var(--fg-95)]">
              {code || '----'}
            </div>
          )}
        </div>

        {/* Status */}
        <div className="mt-3 min-h-[18px] text-xs text-center">
          {copied ? (
            <span className="text-[#2aa3ff]">
              {isNo ? 'Kopiert!' : 'Copied!'}
            </span>
          ) : (
            <span> </span>
          )}
        </div>

        {/* Copy button */}
        <div className="mt-5">
          <button
            onClick={onCopy}
            disabled={loading || !!error}
            className={`w-full h-12 rounded-2xl border tracking-widest text-sm ${
              loading || error
                ? 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]'
                : 'border-[#2aa3ff] text-[#2aa3ff]'
            }`}
          >
            {copied
              ? isNo
                ? 'KOPIERT'
                : 'COPIED'
              : isNo
                ? 'KOPIER'
                : 'COPY'}
          </button>
        </div>

        {/* Close button */}
        <div className="mt-3">
          <button
            onClick={onClose}
            className="w-full h-12 rounded-2xl border border-[color:var(--bd-15)] text-[color:var(--fg-60)] tracking-widest text-sm"
          >
            {isNo ? 'LUKK' : 'CLOSE'}
          </button>
        </div>
      </div>
    </div>
  )
}

function slotLabel(language: AppLanguage, layoutKey: LayoutKey, slot: number) {
  const map = UI[language].slotLabels as any
  return map[layoutKey]?.[slot] ?? `Slot ${slot}`
}

type FuelPenaltyCfg = {
  enabled?: boolean
  homeAddress?: string
  homeLat?: number
  homeLon?: number
  formatted?: string
}

type SurfCfg = {
  id: number
  spot?: string
  spotId?: string
  lat?: number
  lon?: number
  fuelPenalty?: FuelPenaltyCfg
}

type SurfSettingsCfg = {
  fuelPenalty?: boolean
  homeLat?: number
  homeLon?: number
  homeLabel?: string
}

type SurfExperienceRowData = {
  id: string
  spot_id: string
  spot: string
  logged_at: string
  rating_1_6: number | null
  wave_height_m?: number | null
  wave_period_s?: number | null
  wave_dir_from_deg?: number | null
  wind_speed_ms?: number | null
  wind_dir_from_deg?: number | null
}

type SoccerCfg = {
  id: number
  teamId?: string
  teamName?: string
  competitionId?: string
  competitionName?: string
}

type StockChartRange = 'day' | 'week' | 'month' | 'year'

type StockCfg = {
  id: number
  symbol?: string
  name?: string
  assetType?: 'stock' | 'etf' | 'fund' | 'unknown'
  purchasePrice?: number
  currency?: string
  refresh?: number
  chartRange?: StockChartRange
}

type StockSearchResult = {
  symbol: string
  displayName: string
  exchange: string
  country: string
  assetType?: 'stock' | 'etf' | 'fund' | 'unknown'
}

function normalizeSoccerList(raw: any): SoccerCfg[] {
  const arr = Array.isArray(raw) ? raw : []

  return arr
    .filter((x) => x && typeof x === 'object')
    .map((x) => {
      const id = Number(x.id)
      const teamId = String(x.teamId ?? '').trim().slice(0, 80)
      const teamName = String(x.teamName ?? '').trim().slice(0, 80)
      const competitionId = String(x.competitionId ?? '').trim().slice(0, 40)
      const competitionName = String(x.competitionName ?? '').trim().slice(0, 80)

      const out: SoccerCfg = { id }

      if (teamId) out.teamId = teamId
      if (teamName) out.teamName = teamName
      if (competitionId) out.competitionId = competitionId
      if (competitionName) out.competitionName = competitionName

      return out
    })
    .filter((x) => Number.isFinite(x.id) && x.id >= 1 && x.id <= 255)
}

function normalizeStocksList(raw: any): StockCfg[] {
  const arr = Array.isArray(raw) ? raw : []
  const allowedChartRanges: StockChartRange[] = ['day', 'week', 'month', 'year']
  const allowedAssetTypes = new Set(['stock', 'etf', 'fund', 'unknown'])

  return arr
    .filter((x) => x && typeof x === 'object')
    .map((x) => {
      const id = Number(x.id)
      const symbol = String(x.symbol ?? '').trim().slice(0, 24)
      const name = String(x.name ?? '').trim().slice(0, 80)
      const refreshRaw = Number(x.refresh)
      const refresh = Number.isFinite(refreshRaw) && refreshRaw > 0 ? Math.round(refreshRaw) : 900000
      const chartRangeRaw = String(x.chartRange ?? '').trim().toLowerCase()
      const chartRange: StockChartRange = allowedChartRanges.includes(chartRangeRaw as StockChartRange)
        ? (chartRangeRaw as StockChartRange)
        : 'day'
      const assetTypeRaw = String(x.assetType ?? '').trim().toLowerCase()
      const assetType = allowedAssetTypes.has(assetTypeRaw) ? (assetTypeRaw as StockCfg['assetType']) : 'stock'
      const purchasePriceRaw = Number(x.purchasePrice)
      const purchasePrice = Number.isFinite(purchasePriceRaw) && purchasePriceRaw > 0 ? purchasePriceRaw : undefined
      const currencyRaw = String(x.currency ?? '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 8)
      const currency = currencyRaw || 'USD'

      const out: StockCfg = { id, refresh, chartRange }

      if (symbol) out.symbol = symbol
      if (name) out.name = name
      if (assetType) out.assetType = assetType
      if (purchasePrice != null) out.purchasePrice = purchasePrice
      out.currency = currency

      return out
    })
    .filter((x) => Number.isFinite(x.id) && x.id >= 1 && x.id <= 255)
}

function isTodaysBestLabel(spot: string | null | undefined) {
  const s = String(spot ?? '').trim().toLowerCase()
  return s === "today's best" || s === 'todays best' || s === 'dagens beste'
}

function sanitizeFuelPenalty(x: any): FuelPenaltyCfg | undefined {
  if (!x || typeof x !== 'object') return undefined
  const enabled = !!x.enabled
  const homeAddress = String(x.homeAddress ?? '').trim().slice(0, 140)
  const formatted = String(x.formatted ?? '').trim().slice(0, 140)

  const homeLat = Number(x.homeLat)
  const homeLon = Number(x.homeLon)

  const out: FuelPenaltyCfg = { enabled }

  if (homeAddress) out.homeAddress = homeAddress
  if (formatted) out.formatted = formatted
  if (Number.isFinite(homeLat)) out.homeLat = homeLat
  if (Number.isFinite(homeLon)) out.homeLon = homeLon

  if (out.enabled) return out

  if (out.homeAddress || out.formatted || Number.isFinite(out.homeLat) || Number.isFinite(out.homeLon)) return out

  return { enabled: false }
}

function deriveSurfSettingsFromModules(mods: Record<string, any>): SurfSettingsCfg {
  const surfList: SurfCfg[] = Array.isArray(mods?.surf) ? (mods.surf as SurfCfg[]) : []

  const best = surfList.find((x) => isTodaysBestLabel(String(x?.spot ?? ''))) || null
  const fp = best ? sanitizeFuelPenalty((best as any).fuelPenalty) : undefined

  const fuelPenalty = !!fp?.enabled
  const homeLat = Number(fp?.homeLat)
  const homeLon = Number(fp?.homeLon)
  const homeLabel = String(fp?.formatted || fp?.homeAddress || '').trim().slice(0, 140)

  return {
    fuelPenalty,
    homeLat: Number.isFinite(homeLat) ? homeLat : 0,
    homeLon: Number.isFinite(homeLon) ? homeLon : 0,
    homeLabel: homeLabel || '',
  }
}

function normalizeModulesForSave(mods: Record<string, any>) {
  const safe = mods && typeof mods === 'object' ? { ...mods } : {}

  safe.surf_settings = deriveSurfSettingsFromModules(safe)

  return safe
}

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

type ReminderTag = 'work' | 'personal' | 'sports' | 'chores' | 'event'
type ReminderTagFilter = 'all' | ReminderTag

type ReminderUiItem = {
  id: string
  title: string
  date: string
  time?: any
  tag: ReminderTag | null
  repeat: ReminderRepeatKey
  customRepeatDays?: number | null
}

type ReminderCompletionItem = {
  reminderId: string
  occurrenceDate: string
}

type ReminderListItem = ReminderUiItem & { displayDate: string }

type ReminderEditState = {
  reminder: ReminderUiItem
  occurrenceDate: string
} | null

const REMINDER_REPEAT_OPTIONS: Array<{ key: ReminderRepeatKey; label: string; labelNo: string }> = [
  { key: 'none', label: 'None', labelNo: 'Ingen' },
  { key: 'daily', label: 'Daily', labelNo: 'Daglig' },
  { key: 'weekly', label: 'Weekly', labelNo: 'Ukentlig' },
  { key: '2weeks', label: 'Every 2 weeks', labelNo: 'Hver 2. uke' },
  { key: '4weeks', label: 'Every 4 weeks', labelNo: 'Hver 4. uke' },
  { key: 'monthly', label: 'Monthly', labelNo: 'Månedlig' },
  { key: 'halfyear', label: 'Half year', labelNo: 'Halvårlig' },
  { key: 'yearly', label: 'Yearly', labelNo: 'Årlig' },
  { key: '2years', label: 'Every 2 years', labelNo: 'Hvert 2. år' },
  { key: 'custom', label: 'Custom days', labelNo: 'Egendefinerte dager' },
]

const REMINDER_TAG_OPTIONS: Array<{ key: ReminderTag | null; label: string; labelNo: string }> = [
  { key: null, label: 'No tag', labelNo: 'Ingen tag' },
  { key: 'work', label: 'Work', labelNo: 'Jobb' },
  { key: 'personal', label: 'Personal', labelNo: 'Personlig' },
  { key: 'sports', label: 'Sports', labelNo: 'Sport' },
  { key: 'chores', label: 'Chores', labelNo: 'Gjøremål' },
  { key: 'event', label: 'Event', labelNo: 'Hendelse' },
]

function reminderRepeatOptionLabel(language: AppLanguage, key: ReminderRepeatKey) {
  const found = REMINDER_REPEAT_OPTIONS.find((x) => x.key === key)
  if (!found) return language === 'no' ? 'Ingen' : 'None'
  return language === 'no' ? found.labelNo : found.label
}

function reminderTagOptionLabel(language: AppLanguage, key: ReminderTag | null) {
  const found = REMINDER_TAG_OPTIONS.find((x) => x.key === key)
  if (!found) return language === 'no' ? 'Ingen tag' : 'No tag'
  return language === 'no' ? found.labelNo : found.label
}

function reminderTagFilterLabel(language: AppLanguage, key: ReminderTagFilter) {
  if (key === 'all') return language === 'no' ? 'Alle' : 'All'
  return reminderTagOptionLabel(language, key)
}

function isReminderRepeatKey(v: any): v is ReminderRepeatKey {
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

function isReminderTag(v: any): v is ReminderTag {
  return v === 'work' || v === 'personal' || v === 'sports' || v === 'chores' || v === 'event'
}

function normalizeReminderItems(raw: any): ReminderUiItem[] {
  const arr = Array.isArray(raw) ? raw : []

  return arr
    .filter((x) => x && typeof x === 'object')
    .map((x, idx) => {
      const id = String(x.id ?? `reminder-${idx + 1}`).trim() || `reminder-${idx + 1}`
      const title = String(x.title ?? '').trim().slice(0, 120)
      const date = String(x.date ?? '').trim()
      const time = normalizeReminderTime(x.time)
      const tag = isReminderTag(x.tag) ? x.tag : null
      const repeat = isReminderRepeatKey(x.repeat) ? x.repeat : 'none'
      const customRepeatDaysRaw = Number(x.customRepeatDays)

      return {
        id,
        title,
        date,
        time,
        tag,
        repeat,
        customRepeatDays:
          Number.isFinite(customRepeatDaysRaw) && customRepeatDaysRaw > 0
            ? customRepeatDaysRaw
            : null,
      }
    })
    .filter((x) => x.title && x.date)
}

function toLocalYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function parseYmdToLocalDate(ymd: string) {
  const [y, m, d] = String(ymd || '').split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  return new Date(y, m - 1, d)
}
function normalizeReminderTime(value: any) {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  const m = raw.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null

  const hh = Number(m[1])
  const mm = Number(m[2])

  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null

  return `${pad2(hh)}:${pad2(mm)}`
}

function formatReminderTitleWithTime(item: { title: string; time?: string | null }) {
  const t = normalizeReminderTime(item.time)
  return t ? `${item.title} ${t}` : item.title
}

function formatReminderDateLabel(language: AppLanguage, ymd: string) {
  const dt = parseYmdToLocalDate(ymd)
  if (!dt) return ymd || '--'

  const now = new Date()
  const todayYmd = toLocalYmd(now)

  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const tomorrowYmd = toLocalYmd(tomorrow)

  const valueYmd = toLocalYmd(dt)

  if (valueYmd === todayYmd) return language === 'no' ? 'I dag' : 'Today'
  if (valueYmd === tomorrowYmd) return language === 'no' ? 'I morgen' : 'Tomorrow'

  return `${pad2(dt.getDate())}.${pad2(dt.getMonth() + 1)}.${dt.getFullYear()}`
}

function reminderRepeatLabel(language: AppLanguage, key: ReminderRepeatKey, customRepeatDays?: number | null) {
  if (key === 'custom' && Number.isFinite(Number(customRepeatDays)) && Number(customRepeatDays) > 0) {
    const n = Number(customRepeatDays)
    return language === 'no'
      ? `Hver ${n}. dag`
      : `Every ${n} day${n === 1 ? '' : 's'}`
  }

  return reminderRepeatOptionLabel(language, key)
}

function formatReminderFullDateLabel(language: AppLanguage, ymd: string) {
  const dt = parseYmdToLocalDate(ymd)
  if (!dt) return ymd || '--'

  const locale = language === 'no' ? 'nb-NO' : 'en-US'
  const weekday = dt.toLocaleDateString(locale, { weekday: 'long' })
  return `${weekday} ${toLocalYmd(dt)}`
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

function getWeekdayOccurrenceInMonth(d: Date) {
  const dayOfMonth = d.getDate()
  return Math.ceil(dayOfMonth / 7)
}

function isLastWeekdayOfMonth(d: Date) {
  const nextSameWeekday = addDaysLocal(d, 7)
  return nextSameWeekday.getMonth() !== d.getMonth()
}

function getNthWeekdayOfMonth(year: number, month: number, weekday: number, occurrence: number) {
  const first = new Date(year, month, 1)
  const firstWeekday = first.getDay()
  const offset = (weekday - firstWeekday + 7) % 7
  const day = 1 + offset + (occurrence - 1) * 7

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  if (day > daysInMonth) return null

  return new Date(year, month, day)
}

function getLastWeekdayOfMonth(year: number, month: number, weekday: number) {
  const lastDay = new Date(year, month + 1, 0)
  const lastWeekday = lastDay.getDay()
  const offsetBack = (lastWeekday - weekday + 7) % 7
  return new Date(year, month, lastDay.getDate() - offsetBack)
}

function addMonthsByWeekdayPattern(d: Date, months: number) {
  const source = new Date(d)
  const targetMonthDate = new Date(source.getFullYear(), source.getMonth() + months, 1)

  const year = targetMonthDate.getFullYear()
  const month = targetMonthDate.getMonth()
  const weekday = source.getDay()

  if (isLastWeekdayOfMonth(source)) {
    return getLastWeekdayOfMonth(year, month, weekday)
  }

  const occurrence = getWeekdayOccurrenceInMonth(source)
  return getNthWeekdayOfMonth(year, month, weekday, occurrence) || getLastWeekdayOfMonth(year, month, weekday)
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

function expandReminderOccurrences(
  items: ReminderUiItem[],
  rangeStartYmd: string,
  rangeEndYmd: string,
  maxPerReminder = 80
) {
  const out: Array<ReminderUiItem & { sourceId: string; occurrenceDate: string }> = []

  const rangeStart = parseYmdToLocalDate(rangeStartYmd)
  const rangeEnd = parseYmdToLocalDate(rangeEndYmd)

  if (!rangeStart || !rangeEnd) return out

  const safeRangeEnd = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate())

  for (const item of items) {
    const base = parseYmdToLocalDate(item.date)
    if (!base) continue

    let current = new Date(base.getFullYear(), base.getMonth(), base.getDate())
    let count = 0

    while (current <= safeRangeEnd && count < maxPerReminder) {
      const ymd = toLocalYmd(current)

      if (ymd >= rangeStartYmd && ymd <= rangeEndYmd) {
        out.push({
          ...item,
          sourceId: item.id,
          occurrenceDate: ymd,
          date: ymd,
        })
      }

      const next = nextReminderOccurrenceDate(current, item.repeat, item.customRepeatDays)
      if (!next) break
      if (toLocalYmd(next) <= toLocalYmd(current)) break

      current = next
      count += 1
    }
  }

  return out
}

function filterCompletedOccurrences<
  T extends { sourceId: string; occurrenceDate: string }
>(items: T[], completions: ReminderCompletionItem[]) {
  if (!completions.length) return items

  const done = new Set(completions.map((x) => `${x.reminderId}__${x.occurrenceDate}`))
  return items.filter((x) => !done.has(`${x.sourceId}__${x.occurrenceDate}`))
}

function ModuleSettingsTab({
  language,
  module,
  layoutKey,
  cells,
  modulesJson,
  setModulesJson,
  markDirty,
  activeDeviceId,
}: {
  language: AppLanguage
  module: ModuleKey
  layoutKey: LayoutKey
  cells: Record<number, ModuleKey | null>
  modulesJson: Record<string, any>
  setModulesJson: React.Dispatch<React.SetStateAction<Record<string, any>>>
  markDirty: () => void
  activeDeviceId: string | null
}) {
  if (module === 'surf') {
    return (
      <SurfModuleSettingsTab
        language={language}
        layoutKey={layoutKey}
        cells={cells}
        modulesJson={modulesJson}
        setModulesJson={setModulesJson}
        markDirty={markDirty}
      />
    )
  }

  if (module === 'weather') {
    return (
      <WeatherModuleSettingsTab
        language={language}
        layoutKey={layoutKey}
        cells={cells}
        modulesJson={modulesJson}
        setModulesJson={setModulesJson}
        markDirty={markDirty}
      />
    )
  }

  if (module === 'reminders') {
    return <RemindersModuleSettingsTab language={language} activeDeviceId={activeDeviceId} />
  }

  if (module === 'countdown') {
    return (
      <CountdownModuleSettingsTab
        language={language}
        activeDeviceId={activeDeviceId}
      />
    )
  }

  if (module === 'soccer') {
    return (
      <SoccerModuleSettingsTab
        language={language}
        layoutKey={layoutKey}
        cells={cells}
        modulesJson={modulesJson}
        setModulesJson={setModulesJson}
        markDirty={markDirty}
      />
    )
  }

  if (module === 'stocks') {
    return (
      <StocksModuleSettingsTab
        language={language}
        layoutKey={layoutKey}
        cells={cells}
        modulesJson={modulesJson}
        setModulesJson={setModulesJson}
        markDirty={markDirty}
      />
    )
  }

  if (module === 'groceries') {
    return <GroceriesModuleSettingsTab language={language} activeDeviceId={activeDeviceId} />
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mt-2 text-xl font-semibold tracking-widest">{moduleLabel(language, module)}</div>
      <div className="flex-1" />
    </div>
  )
}

type CountdownItem = {
  id: string
  title: string
  date: string
  pinned: boolean
}

function CountdownModuleSettingsTab({
  language,
  activeDeviceId,
}: {
  language: AppLanguage
  activeDeviceId: string | null
}) {
  const [items, setItems] = useState<CountdownItem[]>([])
  const [loading, setLoading] = useState(false)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<CountdownItem | null>(null)

  const listRef = useRef<HTMLDivElement | null>(null)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)
  const t = tx(language)

  async function loadItems() {
    if (!activeDeviceId) {
      setItems([])
      return
    }

    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('countdown_events')
        .select('id, title, target_date, pinned')
        .eq('device_id', activeDeviceId)
        .order('target_date', { ascending: true })
        .order('title', { ascending: true })

      if (error) {
        alert(error.message)
        setItems([])
        return
      }

      const parsed: CountdownItem[] = (data || [])
        .map((x: any) => ({
          id: String(x.id),
          title: String(x.title ?? '').trim(),
          date: String(x.target_date ?? '').trim(),
          pinned: !!x.pinned,
        }))
        .filter((x) => x.title && x.date)

      setItems(parsed)
    } finally {
      setLoading(false)
    }
  }

  async function togglePinned(item: CountdownItem) {
    if (!activeDeviceId) return

    const nextPinned = !item.pinned

    setItems((prev) =>
      prev.map((x) =>
        x.id === item.id ? { ...x, pinned: nextPinned } : x
      )
    )

    const { error } = await supabase
      .from('countdown_events')
      .update({
        pinned: nextPinned,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
      .eq('device_id', activeDeviceId)

    if (error) {
      setItems((prev) =>
        prev.map((x) =>
          x.id === item.id ? { ...x, pinned: item.pinned } : x
        )
      )
      alert(error.message)
    }
  }

  useEffect(() => {
    loadItems()
  }, [activeDeviceId])

  function updateFadeState() {
    const el = listRef.current
    if (!el) {
      setShowTopFade(false)
      setShowBottomFade(false)
      return
    }

    const hasOverflow = el.scrollHeight > el.clientHeight + 1
    if (!hasOverflow) {
      setShowTopFade(false)
      setShowBottomFade(false)
      return
    }

    setShowTopFade(el.scrollTop > 2)
    setShowBottomFade(el.scrollTop + el.clientHeight < el.scrollHeight - 2)
  }

  useEffect(() => {
    const el = listRef.current
    if (!el) return

    updateFadeState()

    const onScroll = () => updateFadeState()
    el.addEventListener('scroll', onScroll, { passive: true })

    const ro = new ResizeObserver(() => updateFadeState())
    ro.observe(el)

    const t1 = window.setTimeout(updateFadeState, 50)
    const t2 = window.setTimeout(updateFadeState, 180)

    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [items.length, loading])

  return (
    <>
      <div className="h-full flex flex-col min-h-0">
        <div className="mt-4 flex-1 min-h-0 flex flex-col">
          {!activeDeviceId ? (
            <div className="text-sm text-[color:var(--fg-50)]">{t.selectFrameFirst}</div>
          ) : loading ? (
            <div className="text-sm text-[color:var(--fg-50)]">{t.loading}</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-[color:var(--fg-50)]">{t.countdownNoEvents}</div>
          ) : (
            <div className="relative flex-1 min-h-0">
              {showTopFade && (
                <div className="pointer-events-none absolute top-0 left-0 right-0 z-10 h-6 bg-gradient-to-b from-[color:var(--app-bg)] to-transparent" />
              )}

              {showBottomFade && (
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-12 bg-gradient-to-t from-[color:var(--app-bg)] to-transparent" />
              )}

              <div ref={listRef} className="h-full overflow-y-auto no-scrollbar pr-1">
                <div className="space-y-2.5">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-3xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-4 py-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[color:var(--fg-95)] text-[15px] leading-tight font-medium">
                            {item.title}
                          </div>

                          <div className="mt-0.5 text-[12px] text-[color:var(--fg-55)]">
                            {formatReminderFullDateLabel(language, item.date)}
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          <button
                            onClick={() => togglePinned(item)}
                            className={`h-8 w-8 rounded-full border flex items-center justify-center ${
                              item.pinned
                                ? 'border-[#2aa3ff]'
                                : 'border-[color:var(--bd-20)]'
                            }`}
                            title={item.pinned ? (language === 'no' ? 'Løsne' : 'Unpin') : (language === 'no' ? 'Fest' : 'Pin')}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className={`w-4 h-4 ${
                                item.pinned ? 'fill-[#2aa3ff]' : 'fill-none'
                              }`}
                              stroke={item.pinned ? '#2aa3ff' : 'currentColor'}
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M12 17v5" />
                              <path d="M5 3l14 0" />
                              <path d="M7 3l2 7v3l-2 2v1h10v-1l-2-2v-3l2-7" />
                            </svg>
                          </button>

                          <button
                            onClick={() => {
                              setEditingItem(item)
                              setSheetOpen(true)
                            }}
                            className="h-7 px-3 rounded-lg border border-[color:var(--bd-20)] text-[10px] tracking-widest text-[color:var(--fg-70)]"
                          >
                            {t.edit}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="pt-5 pb-[20px] flex flex-col items-center relative z-20">
            <button
              onClick={() => {
                setEditingItem({
                  id: '',
                  title: '',
                  date: toLocalYmd(new Date()),
                  pinned: false,
                })
                setSheetOpen(true)
              }}
              disabled={!activeDeviceId}
              className={`w-[260px] h-[56px] rounded-2xl border tracking-widest transition bg-[color:var(--app-bg)] ${
                !activeDeviceId
                  ? 'border-[color:var(--bd-30)] text-[color:var(--fg-50)]'
                  : 'border-[#2aa3ff] text-[#2aa3ff]'
              }`}
              style={{ backgroundColor: 'var(--app-bg)' }}
            >
              {t.newEvent}
            </button>

            <div
              className="mt-6 h-[16px] text-xs tracking-widest opacity-0 pointer-events-none select-none"
              aria-hidden="true"
            >
              Updated just now
            </div>
          </div>
        </div>
      </div>

    {sheetOpen && activeDeviceId && (
        <CountdownDraftSheet
          language={language}
          activeDeviceId={activeDeviceId}
          editingItem={editingItem && editingItem.id ? editingItem : null}
          initialDate={editingItem?.date}
          onClose={() => {
            setSheetOpen(false)
            setEditingItem(null)
          }}
          onSaved={async () => {
            setSheetOpen(false)
            setEditingItem(null)
            await loadItems()
          }}
          onDeleted={async () => {
            setSheetOpen(false)
            setEditingItem(null)
            await loadItems()
          }}
        />
      )}
    </>
  )
}

function CountdownDraftSheet({
  language,
  activeDeviceId,
  editingItem,
  initialDate,
  onClose,
  onSaved,
  onDeleted,
}: {
  language: AppLanguage
  activeDeviceId: string
  editingItem: CountdownItem | null
  initialDate?: string
  onClose: () => void
  onSaved: () => void | Promise<void>
  onDeleted: () => void | Promise<void>
}) {
  const [title, setTitle] = useState(editingItem?.title ?? '')
  const [date, setDate] = useState(editingItem?.date ?? initialDate ?? toLocalYmd(new Date()))
  const [pinned, setPinned] = useState(!!editingItem?.pinned)

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [status, setStatus] = useState<string | null>(null)
  const [statusKind, setStatusKind] = useState<'ok' | 'error'>('ok')

  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  const canSave = title.trim().length > 0 && date && !saving && !deleting
  const t = tx(language)

  async function save() {
    const cleanTitle = title.trim()

    if (!cleanTitle) {
      setStatusKind('error')
      setStatus(language === 'no' ? 'Skriv inn tittel' : 'Enter title')
      return
    }

    try {
      setSaving(true)
      setStatus(null)

      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user?.id

      if (!userId) throw new Error(language === 'no' ? 'Ikke logget inn' : 'Not logged in')

      if (editingItem) {
        const { error } = await supabase
          .from('countdown_events')
          .update({
            title: cleanTitle,
            target_date: date,
            pinned,
            updated_by_user_id: userId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingItem.id)
          .eq('device_id', activeDeviceId)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('countdown_events')
          .insert({
            device_id: activeDeviceId,
            title: cleanTitle,
            target_date: date,
            pinned,
            created_by_user_id: userId,
            updated_by_user_id: userId,
          })

        if (error) throw error
      }

      setStatusKind('ok')
      setStatus(editingItem ? t.updated : t.savedWord)

      await onSaved()
    } catch (e: any) {
      setStatusKind('error')
      setStatus(String(e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!editingItem) return

    try {
      setDeleting(true)

      const { error } = await supabase
        .from('countdown_events')
        .delete()
        .eq('id', editingItem.id)
        .eq('device_id', activeDeviceId)

      if (error) throw error

      await onDeleted()
    } catch (e: any) {
      setStatusKind('error')
      setStatus(String(e?.message || e))
    } finally {
      setDeleting(false)
      setConfirmDeleteOpen(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--overlay-55)]">
        <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] px-5 pt-5 pb-8">
          <div className="flex items-center justify-between">
            <div className="tracking-widest text-sm text-[color:var(--fg-70)]">
              {editingItem ? t.editEventTitle : t.newEventTitle}
            </div>

            <button onClick={onClose} className="text-[color:var(--fg-60)] text-xl">
              ✕
            </button>
          </div>

          <div className="mt-5">
            <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{t.title}</div>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setStatus(null)
              }}
              placeholder={t.eventTitle}
              className="mt-2 w-full h-12 rounded-2xl bg-[color:var(--panel-05)] border border-[color:var(--bd-10)] px-4 text-[color:var(--fg-90)] outline-none"
            />
          </div>

          <div className="mt-4">
            <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{t.date}</div>

            <button
              onClick={() => setDatePickerOpen(true)}
              className="mt-2 w-full h-12 rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-4 text-left text-[color:var(--fg-90)]"
            >
              {date}
            </button>
          </div>

          <div className="mt-4">
            <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{t.pinToFrame}</div>

            <button
              type="button"
              onClick={() => setPinned((v) => !v)}
              className={`mt-2 w-full h-12 rounded-2xl border flex items-center justify-center gap-2 tracking-widest text-sm ${
                pinned
                  ? 'border-[#2aa3ff] text-[#2aa3ff]'
                  : 'border-[color:var(--bd-10)] text-[color:var(--fg-70)]'
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4"
                fill={pinned ? '#2aa3ff' : 'none'}
                stroke={pinned ? '#2aa3ff' : 'currentColor'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 17v5" />
                <path d="M5 3l14 0" />
                <path d="M7 3l2 7v3l-2 2v1h10v-1l-2-2v-3l2-7" />
              </svg>

              {pinned ? t.pinned : t.notPinned}
            </button>
          </div>

          <div className="mt-5 min-h-[18px] text-xs">
            {status && (
              <span className={statusKind === 'error' ? 'text-[color:var(--danger)]' : 'text-[#2aa3ff]'}>
                {status}
              </span>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3">
            <button
              onClick={save}
              disabled={!canSave}
              className={`h-12 rounded-2xl border tracking-widest text-sm ${
                canSave
                  ? 'border-[#2aa3ff] text-[#2aa3ff]'
                  : 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]'
              }`}
            >
              {saving ? t.saving : editingItem ? t.saveChanges : t.saveEvent}
            </button>

            {editingItem && (
              <button
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={saving || deleting}
                className="h-12 rounded-2xl border border-[color:var(--danger-bd)] text-[color:var(--danger)] tracking-widest text-sm"
              >
                {t.delete}
              </button>
            )}

            <button
              onClick={onClose}
              className="h-12 rounded-2xl border border-[color:var(--bd-15)] text-[color:var(--fg-60)] tracking-widest text-sm"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      </div>

      {datePickerOpen && (
        <DatePickerSheet
          language={language}
          value={parseYmdToLocalDate(date) || new Date()}
          onClose={() => setDatePickerOpen(false)}
          onApply={(d) => {
            setDate(toLocalYmd(d))
            setDatePickerOpen(false)
          }}
        />
      )}

      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[color:var(--overlay-55)]">
          <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] px-5 pt-5 pb-8">
            <div className="tracking-widest text-sm text-[color:var(--fg-70)]">
              {t.deleteEventTitle}
            </div>

            <div className="mt-4 text-[color:var(--fg-90)]">
              {t.areYouSure}
            </div>

            <div className="mt-6 grid gap-3">
              <button
                onClick={remove}
                className="h-12 rounded-2xl border border-[color:var(--danger-bd)] text-[color:var(--danger)]"
              >
                {deleting ? t.deleting : t.delete}
              </button>

              <button
                onClick={() => setConfirmDeleteOpen(false)}
                className="h-12 rounded-2xl border border-[color:var(--bd-15)]"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function SoccerModuleSettingsTab({
  language,
  layoutKey,
  cells,
  modulesJson,
  setModulesJson,
  markDirty,
}: {
  language: AppLanguage
  layoutKey: LayoutKey
  cells: Record<number, ModuleKey | null>
  modulesJson: Record<string, any>
  setModulesJson: React.Dispatch<React.SetStateAction<Record<string, any>>>
  markDirty: () => void
}) {
  const soccerSlots = Object.entries(cells)
    .filter(([, m]) => m === 'soccer')
    .map(([slot]) => Number(slot))
    .sort((a, b) => a - b)

  const soccerInstances = (soccerSlots.length ? soccerSlots : [0]).map((slot, idx) => ({
    slot,
    id: idx + 1,
  }))

  const single = soccerInstances.length === 1
  const soccerList: SoccerCfg[] = normalizeSoccerList(modulesJson.soccer)

  function commitSoccerList(nextList: SoccerCfg[]) {
    const fixed = normalizeSoccerList(nextList)
    setModulesJson((prev) => ({ ...prev, soccer: fixed }))
    markDirty()
  }

  function upsertTeam(id: number, patch: Partial<SoccerCfg>) {
    const next: SoccerCfg[] = normalizeSoccerList(modulesJson.soccer)
    const idx = next.findIndex((x) => Number(x?.id) === id)

    const merged: SoccerCfg = {
      ...(idx >= 0 ? next[idx] : ({ id } as SoccerCfg)),
      ...patch,
      id,
    }

    if (idx >= 0) next[idx] = merged
    else next.push(merged)

    commitSoccerList(next)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mt-5 space-y-3 overflow-auto pr-1">
        {soccerInstances.map(({ slot, id }) => {
          const cfg = soccerList.find((x) => Number(x?.id) === id) || null
          const teamName = cfg?.teamName ? String(cfg.teamName) : 'Not set'

          const title = single ? tx(language).soccerTeam : `${tx(language).soccerTeam} — ${slotLabel(language, layoutKey, slot)}`

          return (
            <SoccerTeamRow
              language={language}
              key={`${slot}-${id}`}
              id={id}
              title={title}
              teamName={teamName}
              teamId={cfg?.teamId ? String(cfg.teamId) : ''}
              competitionName={cfg?.competitionName ? String(cfg.competitionName) : ''}
              onPicked={(picked) => upsertTeam(id, picked)}
            />
          )
        })}
      </div>

      <div className="flex-1" />
    </div>
  )
}

function SoccerTeamRow({
  language,
  id,
  title,
  teamName,
  teamId,
  competitionName,
  onPicked,
}: {
  language: AppLanguage
  id: number
  title: string
  teamName: string
  teamId: string
  competitionName?: string
  onPicked: (cfgPatch: Partial<SoccerCfg>) => void
}) {
  const [open, setOpen] = useState(false)
  const t = tx(language)

  return (
    <>
      <div className="rounded-3xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="tracking-widest text-xs text-[color:var(--fg-50)]">
              {title.toUpperCase()}
            </div>

            <div className="mt-1 text-[color:var(--fg-90)] text-xl font-semibold leading-tight truncate">
              {teamName === 'Not set' ? t.chooseTeam : teamName}
            </div>

            {competitionName ? (
              <div className="mt-1 text-sm text-[color:var(--fg-55)] truncate">
                {competitionName}
              </div>
            ) : null}
          </div>

          <button
            onClick={() => setOpen(true)}
            className="shrink-0 h-10 px-4 rounded-2xl border border-[color:var(--bd-15)] text-[color:var(--fg-70)] tracking-widest text-xs hover:bg-[color:var(--panel-05)]"
          >
            {t.change}
          </button>
        </div>
      </div>

      {open && (
        <SoccerTeamSheet
          title={title}
          onClose={() => setOpen(false)}
          onPicked={(picked) => {
            onPicked(picked)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

type SoccerTeamItem = {
  teamId: string
  teamName: string
  competitionId?: string
  competitionName?: string
}

function StocksModuleSettingsTab({
  language,
  layoutKey,
  cells,
  modulesJson,
  setModulesJson,
  markDirty,
}: {
  language: AppLanguage
  layoutKey: LayoutKey
  cells: Record<number, ModuleKey | null>
  modulesJson: Record<string, any>
  setModulesJson: React.Dispatch<React.SetStateAction<Record<string, any>>>
  markDirty: () => void
}) {
  const stockSlots = Object.entries(cells)
    .filter(([, m]) => m === 'stocks')
    .map(([slot]) => Number(slot))
    .sort((a, b) => a - b)

  const stockInstances = (stockSlots.length ? stockSlots : [0]).map((slot, idx) => ({
    slot,
    id: idx + 1,
  }))

  const single = stockInstances.length === 1
  const stockList: StockCfg[] = normalizeStocksList(modulesJson.stocks)

  function commitStockList(nextList: StockCfg[]) {
    const fixed = normalizeStocksList(nextList)
    setModulesJson((prev) => ({ ...prev, stocks: fixed }))
    markDirty()
  }

  function upsertStock(id: number, patch: Partial<StockCfg>) {
    const next: StockCfg[] = normalizeStocksList(modulesJson.stocks)
    const idx = next.findIndex((x) => Number(x?.id) === id)

    const merged: StockCfg = {
      ...(idx >= 0 ? next[idx] : ({ id } as StockCfg)),
      ...patch,
      id,
      refresh: 900000,
      chartRange: patch.chartRange ?? (idx >= 0 ? next[idx]?.chartRange : 'day') ?? 'day',
    }

    if (idx >= 0) next[idx] = merged
    else next.push(merged)

    commitStockList(next)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mt-5 space-y-3 overflow-auto pr-1">
        {stockInstances.map(({ slot, id }) => {
          const cfg = stockList.find((x) => Number(x?.id) === id) || null
          const title = single ? tx(language).stock : `${tx(language).stock} — ${slotLabel(language, layoutKey, slot)}`
          return (
            <StockRow
              key={`${slot}-${id}`}
              language={language}
              title={title}
              symbol={cfg?.symbol ? String(cfg.symbol) : ''}
              name={cfg?.name ? String(cfg.name) : ''}
              assetType={cfg?.assetType || 'stock'}
              purchasePrice={typeof cfg?.purchasePrice === 'number' ? cfg.purchasePrice : undefined}
              currency={cfg?.currency ? String(cfg.currency) : 'USD'}
              chartRange={cfg?.chartRange === 'week' || cfg?.chartRange === 'month' || cfg?.chartRange === 'year' ? cfg.chartRange : 'day'}
              onSave={(patch) => upsertStock(id, patch)}
            />
          )
        })}
      </div>
      <div className="flex-1" />
    </div>
  )
}

function StockRow({
  language,
  title,
  symbol,
  name,
  assetType,
  purchasePrice,
  currency,
  chartRange,
  onSave,
}: {
  language: AppLanguage
  title: string
  symbol: string
  name: string
  assetType: 'stock' | 'etf' | 'fund' | 'unknown'
  purchasePrice?: number
  currency?: string
  chartRange: StockChartRange
  onSave: (cfgPatch: Partial<StockCfg>) => void
}) {
  const [open, setOpen] = useState(false)
  const [purchasePriceInput, setPurchasePriceInput] = useState(
    typeof purchasePrice === 'number' && Number.isFinite(purchasePrice) && purchasePrice > 0 ? String(purchasePrice) : ''
  )
  const [currencyInput, setCurrencyInput] = useState(currency ? String(currency).trim().toUpperCase() : 'USD')
  const [purchasePriceError, setPurchasePriceError] = useState('')
  const selectedName = name.trim()
  const selectedSymbol = symbol.trim().toUpperCase()
  const hasSelected = !!selectedSymbol
  const assetTypeLabel =
    assetType === 'etf' ? 'ETF' : assetType === 'fund' ? (language === 'no' ? 'Fond' : 'Fund') : assetType === 'unknown' ? (language === 'no' ? 'Ukjent' : 'Unknown') : (language === 'no' ? 'Aksje' : 'Stock')

  useEffect(() => {
    setPurchasePriceInput(typeof purchasePrice === 'number' && Number.isFinite(purchasePrice) && purchasePrice > 0 ? String(purchasePrice) : '')
  }, [purchasePrice])
  useEffect(() => {
    setCurrencyInput(currency ? String(currency).trim().toUpperCase() : 'USD')
  }, [currency])

  function commitPurchasePrice() {
    const raw = purchasePriceInput.trim()
    if (!raw) {
      setPurchasePriceError('')
      onSave({ purchasePrice: undefined })
      return
    }
    const parsed = Number(raw.replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setPurchasePriceError(language === 'no' ? 'Må være et positivt tall' : 'Must be a positive number')
      return
    }
    setPurchasePriceError('')
    onSave({ purchasePrice: parsed })
  }

  return (
    <>
      <div className="rounded-3xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{title.toUpperCase()}</div>
            <div className="mt-1 text-[color:var(--fg-90)] text-xl font-semibold leading-tight truncate">
              {hasSelected ? (selectedName || selectedSymbol) : (language === 'no' ? 'Velg investering' : 'Choose investment')}
            </div>
            {hasSelected && (
              <div className="mt-1 text-sm text-[color:var(--fg-55)] truncate">
                {selectedSymbol} · {assetTypeLabel}
              </div>
            )}
          </div>

          <button
            onClick={() => setOpen(true)}
            className="shrink-0 h-10 px-4 rounded-2xl border border-[color:var(--bd-15)] text-[color:var(--fg-70)] tracking-widest text-xs hover:bg-[color:var(--panel-05)]"
          >
            {tx(language).change}
          </button>
        </div>

        <div className="mt-4">
          <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{tx(language).chart}</div>
          <div className="mt-2 flex justify-end">
            <div className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-03)] p-1">
              {([
                { key: 'day', label: tx(language).chartToday },
                { key: 'week', label: tx(language).chartWeek },
                { key: 'month', label: tx(language).chartMonth },
                { key: 'year', label: tx(language).chartYear },
              ] as { key: StockChartRange; label: string }[]).map((opt) => {
                const active = chartRange === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => onSave({ chartRange: opt.key })}
                    className={`h-9 min-w-[76px] rounded-xl px-3 text-sm transition ${
                      active
                        ? 'bg-[#2aa3ff] text-white shadow-[0_4px_14px_rgba(42,163,255,0.35)]'
                        : 'text-[color:var(--fg-80)] hover:bg-[color:var(--panel-08)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <div className="tracking-widest text-xs text-[color:var(--fg-50)]">
                {language === 'no' ? 'KJØPSPRIS' : 'PURCHASE PRICE'}
              </div>
              <input
                value={purchasePriceInput}
                onChange={(e) => setPurchasePriceInput(e.target.value)}
                onBlur={commitPurchasePrice}
                placeholder={language === 'no' ? 'Valgfritt' : 'Optional'}
                inputMode="decimal"
                className="mt-2 w-full h-11 rounded-xl bg-[color:var(--panel-05)] border border-[color:var(--bd-10)] px-3 text-[color:var(--fg-90)] outline-none"
              />
            </div>
            <div className="col-span-1">
              <div className="tracking-widest text-xs text-[color:var(--fg-50)]">
                {language === 'no' ? 'VALUTA' : 'CURRENCY'}
              </div>
              <select
                value={currencyInput}
                onChange={(e) => {
                  const next = String(e.target.value || 'USD')
                    .trim()
                    .toUpperCase()
                    .slice(0, 8)
                  setCurrencyInput(next || 'USD')
                  onSave({ currency: next || 'USD' })
                }}
                className="mt-2 w-full h-11 rounded-xl bg-[color:var(--panel-05)] border border-[color:var(--bd-10)] px-3 text-[color:var(--fg-90)] outline-none"
              >
                {['USD', 'EUR', 'NOK', 'GBP', 'SEK', 'DKK', 'CAD', 'AUD', 'CHF', 'JPY'].map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-1 text-[11px] text-[color:var(--fg-45)]">
            {language === 'no'
              ? 'Brukes kun for å vise prosentvis gevinst/tap.'
              : 'Used only to show percentage gain/loss.'}
          </div>
          {purchasePriceError ? (
            <div className="mt-1 text-[11px] text-[#ff6b6b]">{purchasePriceError}</div>
          ) : null}
        </div>
      </div>

      {open && (
        <StockSearchSheet
          language={language}
          title={title}
          initialSymbol={selectedSymbol}
          initialName={selectedName}
          initialAssetType={assetType}
          onClose={() => setOpen(false)}
          onPicked={(picked) => {
            onSave(picked)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function StockSearchSheet({
  language,
  title,
  initialSymbol,
  initialName,
  initialAssetType,
  onClose,
  onPicked,
}: {
  language: AppLanguage
  title: string
  initialSymbol: string
  initialName: string
  initialAssetType: 'stock' | 'etf' | 'fund' | 'unknown'
  onClose: () => void
  onPicked: (cfgPatch: Partial<StockCfg>) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StockSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualSymbol, setManualSymbol] = useState(initialSymbol)
  const [manualName, setManualName] = useState(initialName)
  const [manualAssetType, setManualAssetType] = useState<'stock' | 'etf' | 'fund' | 'unknown'>(initialAssetType || 'stock')

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    const handle = window.setTimeout(async () => {
      try {
        const resp = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' })
        if (!resp.ok) throw new Error('Search failed')
        const data = await resp.json()
        const next = Array.isArray(data?.results) ? (data.results as StockSearchResult[]) : []
        setResults(next)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => window.clearTimeout(handle)
  }, [query])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--overlay-55)]">
      <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] px-5 pt-5 pb-8">
        <div className="flex items-center justify-between">
          <div className="tracking-widest text-sm text-[color:var(--fg-70)]">{title.toUpperCase()}</div>
          <button onClick={onClose} className="text-[color:var(--fg-60)] text-xl">✕</button>
        </div>

        <div className="mt-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={language === 'no' ? 'Søk ticker eller selskap' : 'Search ticker or company'}
            className="w-full h-12 rounded-2xl bg-[color:var(--panel-05)] border border-[color:var(--bd-10)] px-4 text-[color:var(--fg-90)] outline-none"
          />
        </div>

        <div className="mt-3 text-xs tracking-widest text-[color:var(--fg-40)]">
          {loading ? (language === 'no' ? 'SØKER…' : 'SEARCHING…') : results.length > 0 ? (language === 'no' ? 'RESULTATER' : 'RESULTS') : query.trim().length >= 2 ? (language === 'no' ? 'INGEN RESULTATER' : 'NO RESULTS') : ''}
        </div>

        <div className="mt-3 max-h-[42vh] overflow-auto rounded-2xl border border-[color:var(--bd-10)]">
          {results.map((item) => (
            <button
              key={`${item.symbol}-${item.exchange}`}
              onClick={() => onPicked({ symbol: item.symbol, name: item.displayName, assetType: item.assetType || 'unknown', refresh: 900000 })}
              className="w-full text-left px-4 py-4 border-b border-[color:var(--bd-10)] last:border-b-0 hover:bg-[color:var(--panel-05)]"
            >
              <div className="text-[color:var(--fg-90)] text-base font-medium">{item.displayName}</div>
              <div className="text-[color:var(--fg-55)] text-sm mt-0.5">
                {item.symbol} · {item.assetType === 'etf' ? 'ETF' : item.assetType === 'fund' ? 'Fund' : item.assetType === 'stock' ? 'Stock' : 'Unknown'}
              </div>
              <div className="text-[color:var(--fg-35)] text-[11px] mt-1">{[item.exchange, item.country].filter(Boolean).join(' • ')}</div>
            </button>
          ))}
        </div>

        <button
          onClick={() => setManualOpen((v) => !v)}
          className="mt-3 text-xs tracking-widest text-[color:var(--fg-50)] hover:text-[color:var(--fg-70)]"
        >
          {manualOpen
            ? (language === 'no' ? 'SKJUL MANUELL INNSKRIVING' : 'HIDE MANUAL ENTRY')
            : (language === 'no' ? 'SKRIV INN MANUELT' : 'ENTER MANUALLY')}
        </button>

        {manualOpen && (
          <div className="mt-3 rounded-2xl border border-[color:var(--bd-10)] p-3">
            <input
              value={manualSymbol}
              onChange={(e) => setManualSymbol(e.target.value.toUpperCase())}
              placeholder={language === 'no' ? 'Ticker (f.eks. EQNR.OL)' : 'Ticker (e.g. EQNR.OL)'}
              className="w-full h-11 rounded-xl bg-[color:var(--panel-05)] border border-[color:var(--bd-10)] px-3 text-[color:var(--fg-90)] outline-none"
            />
            <input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder={language === 'no' ? 'Navn (valgfritt)' : 'Name (optional)'}
              className="mt-2 w-full h-11 rounded-xl bg-[color:var(--panel-05)] border border-[color:var(--bd-10)] px-3 text-[color:var(--fg-90)] outline-none"
            />
            <select
              value={manualAssetType}
              onChange={(e) => setManualAssetType(e.target.value as 'stock' | 'etf' | 'fund' | 'unknown')}
              className="mt-2 w-full h-11 rounded-xl bg-[color:var(--panel-05)] border border-[color:var(--bd-10)] px-3 text-[color:var(--fg-90)] outline-none"
            >
              <option value="stock">{language === 'no' ? 'Aksje' : 'Stock'}</option>
              <option value="etf">ETF</option>
              <option value="fund">{language === 'no' ? 'Fond' : 'Fund'}</option>
              <option value="unknown">{language === 'no' ? 'Ukjent' : 'Unknown'}</option>
            </select>
            <button
              onClick={() =>
                onPicked({
                  symbol: manualSymbol.trim().slice(0, 24).toUpperCase(),
                  name: manualName.trim().slice(0, 80),
                  assetType: manualAssetType,
                  refresh: 900000,
                })}
              className="mt-2 h-10 px-3 rounded-xl border border-[color:var(--bd-15)] text-[color:var(--fg-70)] tracking-widest text-xs"
            >
              {language === 'no' ? 'LAGRE' : 'SAVE'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

type GroceryItem = {
  id: string
  name: string
  quantity: number
  category: GroceryCategory
  isChecked: boolean
  checkedAt: string | null
  updatedAt: string | null
}

type GroceryCategory =
  | 'fruit_veg'
  | 'bread'
  | 'dairy'
  | 'cold_cuts'
  | 'meat_fish'
  | 'frozen'
  | 'dry_goods'
  | 'spices'
  | 'toiletries'
  | 'snacks'
  | 'drinks'
  | 'household'
  | 'other'

type GrocerySuggestion = {
  name: string
  usageCount: number
  lastUsedAt: string | null
  category: GroceryCategory
}



type DinnerPlanItem = { name: string; category: GroceryCategory; quantity: number; isChecked: boolean; checkedAt: string | null; updatedAt: string | null }

type DinnerPlanDay = {
  day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  title: string
  items: DinnerPlanItem[]
}

const DINNER_PLAN_DAY_ORDER: DinnerPlanDay['day'][] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
type DinnerPlanWeekOffset = 0 | 1

function defaultDinnerPlanWeekOffset(): DinnerPlanWeekOffset {
  return new Date().getDay() === 0 ? 1 : 0
}

function dinnerPlanDayLabel(language: AppLanguage, day: DinnerPlanDay['day']) {
  const en: Record<DinnerPlanDay['day'], string> = {
    monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday'
  }
  const no: Record<DinnerPlanDay['day'], string> = {
    monday: 'Mandag', tuesday: 'Tirsdag', wednesday: 'Onsdag', thursday: 'Torsdag', friday: 'Fredag', saturday: 'Lørdag', sunday: 'Søndag'
  }
  return language === 'no' ? no[day] : en[day]
}

function defaultDinnerPlanDays(): DinnerPlanDay[] {
  return DINNER_PLAN_DAY_ORDER.map((day) => ({ day, title: '', items: [] }))
}

function formatLocalIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isoDateForDinnerDay(day: DinnerPlanDay['day'], weekOffset: DinnerPlanWeekOffset = 0): string {
  const now = new Date()
  const jsDay = now.getDay() // sunday=0
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(now.getDate() + mondayOffset + weekOffset * 7)
  const targetOffset = DINNER_PLAN_DAY_ORDER.indexOf(day)
  const target = new Date(monday)
  target.setDate(monday.getDate() + targetOffset)
  return formatLocalIsoDate(target)
}

function dinnerDayFromIsoDate(isoDate: string): DinnerPlanDay['day'] | null {
  const parsed = new Date(`${isoDate}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  const jsDay = parsed.getDay()
  const map: Record<number, DinnerPlanDay['day']> = {
    0: 'sunday',
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday',
  }
  return map[jsDay] ?? null
}


function stripEmoji(value: string): string {
  return value
    .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function sanitizeDinnerPlanDays(days: DinnerPlanDay[]): DinnerPlanDay[] {
  return days.map((day) => ({
    ...day,
    title: stripEmoji(day.title),
    items: day.items
      .map((item) => ({ ...item, name: stripEmoji(item.name) }))
      .filter((item) => item.name),
  }))
}

function parseDinnerItemsNote(rawNote: unknown): DinnerPlanDay['items'] {
  if (typeof rawNote !== 'string' || !rawNote.trim()) return []
  try {
    const parsed = JSON.parse(rawNote)
    return Array.isArray(parsed)
      ? parsed.map((it: any) => ({
        name: String(it?.name ?? '').trim(),
        category: asGroceryCategory(it?.category),
        quantity: Math.max(1, Number(it?.quantity ?? 1) || 1),
        isChecked: !!it?.isChecked,
        checkedAt: it?.checkedAt ? String(it.checkedAt) : null,
        updatedAt: it?.updatedAt ? String(it.updatedAt) : null,
      })).filter((it: { name: string }) => !!it.name)
      : []
  } catch {
    return []
  }
}

const GROCERY_UNDO_WINDOW_MS = 10 * 60 * 1000

function checkedItemExpiresAtMs(item: Pick<GroceryItem, 'isChecked' | 'checkedAt'>) {
  if (!item.isChecked || !item.checkedAt) return null
  const checkedAtMs = new Date(item.checkedAt).getTime()
  if (Number.isNaN(checkedAtMs)) return null
  return checkedAtMs + GROCERY_UNDO_WINDOW_MS
}

function groceryCheckedExpiresAtMs(item: GroceryItem) {
  return checkedItemExpiresAtMs(item)
}

function dinnerPlanItemCheckedExpiresAtMs(item: DinnerPlanItem) {
  return checkedItemExpiresAtMs(item)
}

function dinnerPlanItemIsExpired(item: DinnerPlanItem, nowMs: number) {
  const expiresAtMs = dinnerPlanItemCheckedExpiresAtMs(item)
  return expiresAtMs != null && nowMs >= expiresAtMs
}

function stripExpiredDinnerPlanItems(days: DinnerPlanDay[], nowMs = Date.now()): DinnerPlanDay[] {
  return days.map((day) => ({
    ...day,
    items: day.items.filter((item) => !dinnerPlanItemIsExpired(item, nowMs)),
  }))
}

function groceryCheckedExpiryCutoffIso(nowMs = Date.now()) {
  return new Date(nowMs - GROCERY_UNDO_WINDOW_MS).toISOString()
}

function groceryCheckedItemIsExpired(item: GroceryItem, nowMs: number) {
  const expiresAtMs = groceryCheckedExpiresAtMs(item)
  return expiresAtMs != null && nowMs >= expiresAtMs
}

const GROCERY_CATEGORY_LIST_ORDER: GroceryCategory[] = [
  'bread',
  'cold_cuts',
  'dairy',
  'drinks',
  'dry_goods',
  'frozen',
  'fruit_veg',
  'household',
  'meat_fish',
  'snacks',
  'spices',
  'toiletries',
  'other',
]

function asGroceryCategory(value: string | null | undefined): GroceryCategory {
  const raw = String(value ?? '').trim()
  const normalized = raw === 'paalegg' ? 'cold_cuts' : raw
  const v = normalized as GroceryCategory
  return GROCERY_CATEGORY_LIST_ORDER.includes(v) ? v : 'other'
}

function groceryCategoryLabel(language: AppLanguage, category: GroceryCategory) {
  const labelsEn: Record<GroceryCategory, string> = {
    fruit_veg: 'Fruit & veg',
    bread: 'Bread',
    dairy: 'Dairy',
    cold_cuts: 'Cold cuts',
    meat_fish: 'Meat & fish',
    frozen: 'Frozen',
    dry_goods: 'Dry goods',
    spices: 'Spices',
    toiletries: 'Toiletries',
    snacks: 'Snacks',
    drinks: 'Drinks',
    household: 'Household',
    other: 'Other',
  }
  const labelsNo: Record<GroceryCategory, string> = {
    fruit_veg: 'Frukt og grønt',
    bread: 'Brød',
    dairy: 'Meieri',
    cold_cuts: 'Pålegg',
    meat_fish: 'Kjøtt og fisk',
    frozen: 'Frossen',
    dry_goods: 'Tørrvarer',
    spices: 'Krydder',
    toiletries: 'Toalettsaker',
    snacks: 'Snacks',
    drinks: 'Drikke',
    household: 'Husholdning',
    other: 'Annet',
  }
  return language === 'no' ? labelsNo[category] : labelsEn[category]
}

function groceryIsVisible(item: GroceryItem, nowMs: number) {
  if (!item.isChecked) return true
  return !groceryCheckedItemIsExpired(item, nowMs)
}

function groceryUndoHint(language: AppLanguage, checkedAt: string | null, nowMs: number) {
  if (!checkedAt) return language === 'no' ? 'Kan angres i 10 min' : 'You can undo for 10min'
  const elapsedMs = Math.max(0, nowMs - new Date(checkedAt).getTime())
  const remainingMinutes = (GROCERY_UNDO_WINDOW_MS - elapsedMs) / (60 * 1000)
  const minuteBucket = Math.max(1, Math.ceil(remainingMinutes))
  if (language === 'no') return `Kan angres i ${minuteBucket} min`
  return `You can undo for ${minuteBucket} min`
}

function GroceriesModuleSettingsTab({
  language,
  activeDeviceId,
}: {
  language: AppLanguage
  activeDeviceId: string | null
}) {
  const t = tx(language)
  const [items, setItems] = useState<GroceryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<GrocerySuggestion[]>([])
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<GroceryItem | null>(null)
  const [dinnerPlanOpen, setDinnerPlanOpen] = useState(false)
  const [dinnerPlanLockedByOtherUser, setDinnerPlanLockedByOtherUser] = useState(false)
  const [dinnerPlanWeekOffset, setDinnerPlanWeekOffset] = useState<DinnerPlanWeekOffset>(() => defaultDinnerPlanWeekOffset())
  const [dinnerPlanDays, setDinnerPlanDays] = useState<DinnerPlanDay[]>(defaultDinnerPlanDays())
  const [dinnerPlanMainEditTarget, setDinnerPlanMainEditTarget] = useState<{ day: DinnerPlanDay['day']; idx: number } | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const pendingScrollTopRef = useRef<number | null>(null)
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null)
  const dinnerRealtimeChannelRef = useRef<RealtimeChannel | null>(null)
  const dinnerLockChannelRef = useRef<RealtimeChannel | null>(null)
  const dinnerLockClientIdRef = useRef(`dinner-lock-${Math.random().toString(36).slice(2)}`)
  const reloadTimerRef = useRef<number | null>(null)
  const suppressRealtimeUntilRef = useRef(0)
  const userHasScrolledListRef = useRef(false)

  const isRemovedRow = (row: any): boolean => {
    if (!row) return false
    if (row.deleted_at != null) return true
    if (row.archived_at != null) return true
    if (row.is_deleted === true) return true
    if (row.active === false) return true
    if (typeof row.quantity === 'number' && row.quantity <= 0) return true
    if (typeof row.quantity === 'string') {
      const parsed = Number(row.quantity)
      if (!Number.isNaN(parsed) && parsed <= 0) return true
    }
    return false
  }

  const groceryItemFromRow = useCallback((row: any): GroceryItem | null => {
    if (!row || isRemovedRow(row)) return null
    const id = row.id == null ? '' : String(row.id)
    const name = String(row.name ?? '').trim()
    if (!id || !name) return null

    return {
      id,
      name,
      quantity: Math.max(1, Number(row.quantity ?? 1) || 1),
      category: asGroceryCategory(row.category),
      isChecked: !!row.is_checked,
      checkedAt: row.checked_at ? String(row.checked_at) : null,
      updatedAt: row.updated_at ? String(row.updated_at) : null,
    }
  }, [])

  const upsertItemInState = useCallback((nextItem: GroceryItem) => {
    setItems((prev) => {
      const idx = prev.findIndex((item) => item.id === nextItem.id)
      if (idx === -1) return [nextItem, ...prev]
      const copy = [...prev]
      copy[idx] = { ...copy[idx], ...nextItem }
      return copy
    })
  }, [])



  const groupedVisibleItems = useMemo(() => {
    const byCategory = new Map<GroceryCategory, GroceryItem[]>()
    for (const category of GROCERY_CATEGORY_LIST_ORDER) byCategory.set(category, [])

    for (const item of items) {
      if (!groceryIsVisible(item, nowMs)) continue
      const list = byCategory.get(item.category)
      if (list) list.push(item)
    }

    const groups = GROCERY_CATEGORY_LIST_ORDER.map((category, order) => {
      const group = byCategory.get(category) || []
      group.sort((a, b) => {
        if (a.isChecked !== b.isChecked) return a.isChecked ? 1 : -1
        const nameCmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        if (nameCmp !== 0) return nameCmp
        const aTime = (a.isChecked ? a.checkedAt : a.updatedAt) ? new Date((a.isChecked ? a.checkedAt : a.updatedAt) || '').getTime() : 0
        const bTime = (b.isChecked ? b.checkedAt : b.updatedAt) ? new Date((b.isChecked ? b.checkedAt : b.updatedAt) || '').getTime() : 0
        return bTime - aTime
      })
      return { category, items: group, allChecked: group.length > 0 && group.every((item) => item.isChecked), order }
    })

    return groups
      .filter((group) => group.items.length > 0)
      .sort((a, b) => {
        if (a.allChecked !== b.allChecked) return a.allChecked ? 1 : -1
        return a.order - b.order
      })
      .map(({ category, items }) => ({ category, items }))
  }, [items, nowMs])

  useLayoutEffect(() => {
    if (pendingScrollTopRef.current == null || !listScrollRef.current) return
    listScrollRef.current.scrollTop = pendingScrollTopRef.current
    pendingScrollTopRef.current = null
  }, [groupedVisibleItems, loading])

  useEffect(() => {
    const el = listScrollRef.current
    if (!el) return
    const onScroll = () => {
      userHasScrolledListRef.current = true
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  async function loadGroceries(options?: { silent?: boolean; preserveScroll?: boolean; keepAnchorUnlessUserScrolled?: boolean }) {
    const silent = !!options?.silent || !!options?.preserveScroll
    if (options?.preserveScroll || (options?.keepAnchorUnlessUserScrolled && !userHasScrolledListRef.current)) {
      pendingScrollTopRef.current = listScrollRef.current?.scrollTop ?? null
    }
    if (!activeDeviceId) {
      setItems([])
      setSuggestions([])
      return
    }

    if (!silent) setLoading(true)
    try {
      const cleanupCutoffIso = groceryCheckedExpiryCutoffIso()
      const { error: cleanupError } = await supabase
        .from('grocery_items')
        .delete()
        .eq('device_id', activeDeviceId)
        .eq('is_checked', true)
        .lte('checked_at', cleanupCutoffIso)

      if (cleanupError) {
        console.error('Failed to cleanup expired checked grocery items before loading', { error: cleanupError })
      }

      const { data, error } = await supabase
        .from('grocery_items')
        .select('id, name, quantity, category, is_checked, checked_at, updated_at')
        .eq('device_id', activeDeviceId)
        .order('updated_at', { ascending: false })

      if (error) {
        alert(error.message)
        return
      }

      const parsed: GroceryItem[] = (data || [])
        .map((row: any) => groceryItemFromRow(row))
        .filter((item): item is GroceryItem => !!item && !groceryCheckedItemIsExpired(item, Date.now()))
      setItems(parsed)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  async function loadHistory() {
    if (!activeDeviceId) {
      setSuggestions([])
      return
    }

    const { data, error } = await supabase
      .from('grocery_item_history')
      .select('name, usage_count, last_used_at, category')
      .eq('device_id', activeDeviceId)
      .order('usage_count', { ascending: false })
      .order('last_used_at', { ascending: false })
      .limit(50)

    if (error) {
      alert(error.message)
      return
    }

    const parsed: GrocerySuggestion[] = (data || []).map((row: any) => ({
      name: String(row.name ?? '').trim(),
      usageCount: Math.max(1, Number(row.usage_count ?? 1) || 1),
      lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
      category: asGroceryCategory(row.category),
    }))
    setSuggestions(parsed.filter((x) => x.name))
  }

  useEffect(() => {
    loadGroceries()
    loadHistory()
  }, [activeDeviceId])

  useEffect(() => {
    if (!activeDeviceId) return

    const removeItemFromState = (itemId: string | null | undefined) => {
      if (!itemId) return
      setItems((prev) => prev.filter((item) => item.id !== itemId))
    }

    const logRealtime = (payload: any, reloadCalled: boolean, reason: string) => {
      if (process.env.NODE_ENV === 'production') return
      console.debug('[groceries realtime]', {
        eventType: payload?.eventType ?? null,
        table: payload?.table ?? null,
        oldRow: payload?.old ?? null,
        newRow: payload?.new ?? null,
        reloadGroceriesCalled: reloadCalled,
        reason,
      })
    }

    const scheduleReload = (reason: string, payload?: any) => {
      if (Date.now() < suppressRealtimeUntilRef.current) {
        logRealtime(payload, false, `${reason}-suppressed-local-save`)
        return
      }
      logRealtime(payload, true, reason)
      if (reloadTimerRef.current != null) return
      reloadTimerRef.current = window.setTimeout(() => {
        reloadTimerRef.current = null
        loadGroceries({ silent: true, preserveScroll: true })
      }, 150)
    }

    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current)
      realtimeChannelRef.current = null
    }

    const channel = supabase
      .channel(`grocery-items:${activeDeviceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'grocery_items',
          filter: `device_id=eq.${activeDeviceId}`,
        },
        (payload) => {
          const newRow = (payload as { new?: any })?.new
          const nextItem = groceryItemFromRow(newRow)
          if (nextItem) {
            upsertItemInState(nextItem)
            logRealtime(payload, false, 'insert-local-upsert')
            return
          }
          scheduleReload('insert-fallback', payload)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'grocery_items',
          filter: `device_id=eq.${activeDeviceId}`,
        },
        (payload) => {
          const newRow = (payload as { new?: any })?.new
          const newId = newRow?.id ? String(newRow.id) : null
          if (isRemovedRow(newRow)) {
            removeItemFromState(newId)
            logRealtime(payload, false, 'update-removed-local-delete')
            return
          }
          const nextItem = groceryItemFromRow(newRow)
          if (nextItem) {
            upsertItemInState(nextItem)
            logRealtime(payload, false, 'update-local-upsert')
            return
          }
          scheduleReload('update-fallback', payload)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'grocery_items',
        },
        (payload) => {
          const oldRow = (payload as { old?: { id?: string | null; device_id?: string | null } })?.old
          if (!oldRow) {
            logRealtime(payload, false, 'delete-missing-old-row')
            return
          }
          if (oldRow.device_id && oldRow.device_id !== activeDeviceId) {
            logRealtime(payload, false, 'delete-other-device')
            return
          }
          removeItemFromState(oldRow.id ? String(oldRow.id) : null)
          if (!oldRow.device_id || oldRow.device_id === activeDeviceId) {
            scheduleReload('delete', payload)
          }
        }
      )
      .subscribe()

    realtimeChannelRef.current = channel

    return () => {
      if (reloadTimerRef.current != null) {
        window.clearTimeout(reloadTimerRef.current)
        reloadTimerRef.current = null
      }
      supabase.removeChannel(channel)
      if (realtimeChannelRef.current === channel) {
        realtimeChannelRef.current = null
      }
    }
  }, [activeDeviceId, groceryItemFromRow, upsertItemInState])

  useEffect(() => {
    return () => {
      if (reloadTimerRef.current != null) {
        window.clearTimeout(reloadTimerRef.current)
        reloadTimerRef.current = null
      }
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current)
        realtimeChannelRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const refreshNow = () => setNowMs(Date.now())
    const handle = window.setInterval(refreshNow, 60_000)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshNow()
    }
    window.addEventListener('focus', refreshNow)
    window.addEventListener('pageshow', refreshNow)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearInterval(handle)
      window.removeEventListener('focus', refreshNow)
      window.removeEventListener('pageshow', refreshNow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    const groceryExpiryTimes = items
      .map((item) => groceryCheckedExpiresAtMs(item))
      .filter((value): value is number => value != null)
    const dinnerExpiryTimes = dinnerPlanDays
      .flatMap((day) => day.items.map((item) => dinnerPlanItemCheckedExpiresAtMs(item)))
      .filter((value): value is number => value != null)
    const nextExpiryMs = [...groceryExpiryTimes, ...dinnerExpiryTimes]
      .reduce<number | null>((soonest, expiresAtMs) => (soonest == null || expiresAtMs < soonest ? expiresAtMs : soonest), null)

    if (nextExpiryMs == null) return

    const delayMs = Math.max(0, nextExpiryMs - Date.now()) + 250
    const handle = window.setTimeout(() => setNowMs(Date.now()), delayMs)
    return () => window.clearTimeout(handle)
  }, [items, dinnerPlanDays])

  useEffect(() => {
    if (!activeDeviceId) return

    const expiredMainIds = items
      .filter((item) => groceryCheckedItemIsExpired(item, nowMs))
      .map((item) => item.id)
      .filter((id) => !isDinnerVirtualId(id))

    if (expiredMainIds.length > 0) {
      const cutoffIso = groceryCheckedExpiryCutoffIso(nowMs)
      setItems((prev) => prev.filter((item) => !expiredMainIds.includes(item.id)))
      void supabase
        .from('grocery_items')
        .delete()
        .in('id', expiredMainIds)
        .eq('is_checked', true)
        .lte('checked_at', cutoffIso)
        .then(({ error }) => {
          if (error) {
            console.error('Failed to auto-remove expired checked grocery items', { error, expiredMainIds })
            void loadGroceries({ silent: true, preserveScroll: true })
          }
        })
    }

  }, [activeDeviceId, items, nowMs, loadGroceries])

  useEffect(() => {
    if (!activeDeviceId) return

    const cleanedDinnerPlanDays = stripExpiredDinnerPlanItems(dinnerPlanDays, nowMs)
    const beforeCount = dinnerPlanDays.reduce((count, day) => count + day.items.length, 0)
    const afterCount = cleanedDinnerPlanDays.reduce((count, day) => count + day.items.length, 0)
    if (beforeCount === afterCount) return

    setDinnerPlanDays(cleanedDinnerPlanDays)

    const deleteDates = DINNER_PLAN_DAY_ORDER.map((day) => isoDateForDinnerDay(day, dinnerPlanWeekOffset))
    void (async () => {
      const { error: deleteError } = await supabase
        .from('dinner_plan_days')
        .delete()
        .eq('device_id', activeDeviceId)
        .in('date', deleteDates)
      if (deleteError) {
        console.error('Failed to clear expired checked dinner plan items', { deleteError })
        return
      }

      const payload = cleanedDinnerPlanDays
        .filter((day) => day.title || day.items.length > 0)
        .map((day) => ({
          device_id: activeDeviceId,
          date: isoDateForDinnerDay(day.day, dinnerPlanWeekOffset),
          title: day.title || dinnerPlanDayLabel('en', day.day),
          note: JSON.stringify(day.items),
        }))
      if (payload.length <= 0) return

      const { error } = await supabase.from('dinner_plan_days').upsert(payload, { onConflict: 'device_id,date' })
      if (error) console.error('Failed to persist expired checked dinner plan cleanup', { error })
    })()
  }, [activeDeviceId, dinnerPlanDays, dinnerPlanWeekOffset, nowMs])


  const fetchDinnerPlanDays = useCallback(async (weekOffset: DinnerPlanWeekOffset): Promise<DinnerPlanDay[]> => {
    if (!activeDeviceId) return defaultDinnerPlanDays()
    const { data, error } = await supabase
      .from('dinner_plan_days')
      .select('date,title,note')
      .eq('device_id', activeDeviceId)
      .in('date', DINNER_PLAN_DAY_ORDER.map((day) => isoDateForDinnerDay(day, weekOffset)))
    if (error) return defaultDinnerPlanDays()
    const byDay = new Map<DinnerPlanDay['day'], { title: string; items: DinnerPlanDay['items'] }>()
    for (const row of data ?? []) {
      const day = dinnerDayFromIsoDate(String(row.date))
      if (!day) continue
      byDay.set(day, {
        title: String(row.title ?? '').trim(),
        items: parseDinnerItemsNote(row.note),
      })
    }
    const loadedDays = DINNER_PLAN_DAY_ORDER.map((day) => ({ day, title: byDay.get(day)?.title ?? '', items: byDay.get(day)?.items ?? [] }))
    return stripExpiredDinnerPlanItems(sanitizeDinnerPlanDays(loadedDays))
  }, [activeDeviceId])

  const loadDinnerPlan = useCallback(async (weekOffset: DinnerPlanWeekOffset = dinnerPlanWeekOffset): Promise<DinnerPlanDay[]> => {
    const normalizedDays = await fetchDinnerPlanDays(weekOffset)
    setDinnerPlanWeekOffset(weekOffset)
    setDinnerPlanDays(normalizedDays)
    return normalizedDays
  }, [dinnerPlanWeekOffset, fetchDinnerPlanDays])

  useEffect(() => {
    loadDinnerPlan()
  }, [loadDinnerPlan])

  useEffect(() => {
    if (!activeDeviceId) return
    if (dinnerRealtimeChannelRef.current) {
      supabase.removeChannel(dinnerRealtimeChannelRef.current)
      dinnerRealtimeChannelRef.current = null
    }
    const channel = supabase
      .channel(`dinner-plan:${activeDeviceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dinner_plan_days', filter: `device_id=eq.${activeDeviceId}` }, () => {
        if (dinnerPlanOpen) return
        loadDinnerPlan()
      })
      .subscribe()
    dinnerRealtimeChannelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      if (dinnerRealtimeChannelRef.current === channel) dinnerRealtimeChannelRef.current = null
    }
  }, [activeDeviceId, dinnerPlanOpen, loadDinnerPlan])

  useEffect(() => {
    if (!activeDeviceId) {
      setDinnerPlanLockedByOtherUser(false)
      return
    }
    if (dinnerLockChannelRef.current) {
      supabase.removeChannel(dinnerLockChannelRef.current)
      dinnerLockChannelRef.current = null
    }
    const channel = supabase.channel(`dinner-plan-lock:${activeDeviceId}`)
    const updateLockedState = () => {
      const state = channel.presenceState<{ clientId?: string; isEditingDinnerPlan?: boolean }>()
      const othersEditing = Object.values(state)
        .flat()
        .some((presence) => presence?.clientId !== dinnerLockClientIdRef.current && presence?.isEditingDinnerPlan)
      setDinnerPlanLockedByOtherUser(othersEditing)
    }
    channel
      .on('presence', { event: 'sync' }, updateLockedState)
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') return
        await channel.track({
          clientId: dinnerLockClientIdRef.current,
          isEditingDinnerPlan: false,
        })
        updateLockedState()
      })
    dinnerLockChannelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      if (dinnerLockChannelRef.current === channel) dinnerLockChannelRef.current = null
    }
  }, [activeDeviceId])

  useEffect(() => {
    const channel = dinnerLockChannelRef.current
    if (!channel) return
    void channel.track({
      clientId: dinnerLockClientIdRef.current,
      isEditingDinnerPlan: dinnerPlanOpen,
    })
  }, [dinnerPlanOpen])


  useEffect(() => {
    if (!dinnerPlanOpen || !dinnerPlanLockedByOtherUser) return
    setDinnerPlanOpen(false)
    void loadDinnerPlan()
  }, [dinnerPlanLockedByOtherUser, dinnerPlanOpen, loadDinnerPlan])

  const hasDinnerPlan = useMemo(() => dinnerPlanDays.some((x) => x.title || x.items.length > 0), [dinnerPlanDays])
  const dinnerPlanOtherItems = useMemo(
    () => dinnerPlanDays.flatMap((d) => d.items).filter((x) => x.category === 'other'),
    [dinnerPlanDays]
  )
  const plannedNameSet = useMemo(() => new Set(dinnerPlanDays.flatMap((d) => d.items.map((i) => i.name.trim().toLowerCase())).filter(Boolean)), [dinnerPlanDays])
  const uncategorizedMainItems = useMemo(
    () =>
      groupedVisibleItems
        .map((g) => ({ ...g, items: g.items.filter((it) => !plannedNameSet.has(it.name.trim().toLowerCase())) }))
        .filter((g) => g.items.length > 0),
    [groupedVisibleItems, plannedNameSet]
  )
  const dinnerPlanGroupedItems = useMemo(() => {
    const byCategory = new Map<GroceryCategory, GroceryItem[]>()
    for (const c of GROCERY_CATEGORY_LIST_ORDER) byCategory.set(c, [])
    const aggregate = new Map<string, { name: string; category: GroceryCategory; quantity: number; isChecked: boolean; checkedAt: string | null; updatedAt: string | null }>()
    for (const day of dinnerPlanDays) {
      for (const item of day.items) {
        const key = `${item.category}__${item.name.trim().toLowerCase()}`
        const existing = aggregate.get(key)
        if (existing) {
          existing.quantity += item.quantity
          existing.isChecked = existing.isChecked && item.isChecked
          if (!existing.checkedAt || (item.checkedAt && item.checkedAt > existing.checkedAt)) existing.checkedAt = item.checkedAt
        } else {
          aggregate.set(key, { ...item })
        }
      }
    }
    for (const entry of aggregate.values()) {
      const groceryItem = { id: `dinner-${entry.category}-${entry.name}`, ...entry }
      if (!groceryIsVisible(groceryItem, nowMs)) continue
      const list = byCategory.get(entry.category) || []
      list.push(groceryItem)
      byCategory.set(entry.category, list)
    }
    return GROCERY_CATEGORY_LIST_ORDER.map((category) => ({ category, items: byCategory.get(category) || [] })).filter((g) => g.items.length > 0)
  }, [dinnerPlanDays, nowMs])
  const groupsForDisplay = useMemo(() => {
    const sortGroups = (groups: Array<{ category: GroceryCategory; items: GroceryItem[] }>) =>
      groups
        .map((group) => ({
          ...group,
          allChecked: group.items.length > 0 && group.items.every((item) => item.isChecked),
          order: GROCERY_CATEGORY_LIST_ORDER.indexOf(group.category),
        }))
        .sort((a, b) => {
          if (a.allChecked !== b.allChecked) return a.allChecked ? 1 : -1
          return a.order - b.order
        })
        .map(({ category, items }) => ({ category, items }))

    if (!hasDinnerPlan) return sortGroups(groupedVisibleItems)
    const base = uncategorizedMainItems.map((g) => ({ ...g, items: [...g.items] }))
    for (const dGroup of dinnerPlanGroupedItems) {
      const target = base.find((g) => g.category === dGroup.category)
      if (target) target.items = [...target.items, ...dGroup.items]
      else base.push({ category: dGroup.category, items: [...dGroup.items] })
    }
    return sortGroups(base.filter((g) => g.items.length > 0))
  }, [hasDinnerPlan, groupedVisibleItems, uncategorizedMainItems, dinnerPlanGroupedItems])

  async function rememberHistoryItem(name: string, category: GroceryCategory, nowIso = new Date().toISOString()) {
    if (!activeDeviceId) return
    const normalizedName = name.trim()
    if (!normalizedName) return

    const { data: existingHistory } = await supabase
      .from('grocery_item_history')
      .select('id, usage_count')
      .eq('device_id', activeDeviceId)
      .ilike('name', normalizedName)
      .limit(1)
      .maybeSingle()

    if (existingHistory?.id) {
      await supabase
        .from('grocery_item_history')
        .update({
          usage_count: Math.max(1, Number(existingHistory.usage_count ?? 1) || 1) + 1,
          last_used_at: nowIso,
          category,
        })
        .eq('id', existingHistory.id)
    } else {
      await supabase
        .from('grocery_item_history')
        .insert({
          device_id: activeDeviceId,
          name: normalizedName,
          usage_count: 1,
          last_used_at: nowIso,
          category,
        })
    }
  }


  async function recordGroceryPurchaseInsight(name: string, quantity: number, category: GroceryCategory) {
    if (!activeDeviceId) return
    const normalizedName = name.trim()
    if (!normalizedName) return

    const { error } = await supabase.rpc('record_grocery_purchase', {
      device_id: activeDeviceId,
      item_name: normalizedName,
      qty: Math.max(1, Number(quantity) || 1),
      category,
    })

    if (error) console.error('Failed to record grocery purchase insight', { error, item: { name: normalizedName, quantity, category } })
  }

  async function markGroceryProbablyOutInsight(name: string) {
    if (!activeDeviceId) return
    const normalizedName = name.trim()
    if (!normalizedName) return

    const { error } = await supabase.rpc('mark_grocery_item_probably_out', {
      device_id: activeDeviceId,
      item_name: normalizedName,
    })

    if (error) console.error('Failed to mark grocery item probably out', { error, item: { name: normalizedName } })
  }



  async function syncMainGroceriesFromDinnerPlan(days: DinnerPlanDay[]) {
    if (!activeDeviceId) return

    const aggregate = new Map<string, { name: string; category: GroceryCategory; quantity: number }>()
    const checkedItems = new Map<string, { name: string; category: GroceryCategory }>()
    for (const day of days) {
      for (const item of day.items) {
        const normalizedName = item.name.trim()
        if (!normalizedName) continue
        const key = `${item.category}__${normalizedName.toLowerCase()}`
        if (item.isChecked) {
          checkedItems.set(key, { name: normalizedName, category: item.category })
          continue
        }
        const existing = aggregate.get(key)
        if (existing) existing.quantity += Math.max(1, item.quantity)
        else aggregate.set(key, { name: normalizedName, category: item.category, quantity: Math.max(1, item.quantity) })
      }
    }

    for (const [key, item] of checkedItems.entries()) {
      if (aggregate.has(key)) continue
      const { error } = await supabase
        .from('grocery_items')
        .delete()
        .eq('device_id', activeDeviceId)
        .ilike('name', item.name)
        .eq('category', item.category)
      if (error) console.error('Failed to remove checked dinner item from main grocery list', { error, item })
    }

    for (const item of aggregate.values()) {
      const { data: existing, error: existingError } = await supabase
        .from('grocery_items')
        .select('id, quantity')
        .eq('device_id', activeDeviceId)
        .ilike('name', item.name)
        .eq('category', item.category)
        .limit(1)
        .maybeSingle()

      if (existingError) {
        console.error('Failed to read existing grocery item for dinner sync', { existingError, item })
        continue
      }

      if (existing?.id) {
        const { error: updateError } = await supabase
          .from('grocery_items')
          .update({ quantity: Math.max(Number(existing.quantity ?? 1) || 1, item.quantity), updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        if (updateError) console.error('Failed to update grocery item from dinner sync', { updateError, item })
        else void markGroceryProbablyOutInsight(item.name)
      } else {
        const { error: insertError } = await supabase
          .from('grocery_items')
          .insert({
            device_id: activeDeviceId,
            name: item.name,
            quantity: item.quantity,
            category: item.category,
            is_checked: false,
            checked_at: null,
          })
        if (insertError) console.error('Failed to insert grocery item from dinner sync', { insertError, item })
        else void markGroceryProbablyOutInsight(item.name)
      }
    }

    await loadGroceries({ silent: true, keepAnchorUnlessUserScrolled: true })
  }
  async function persistDinnerPlan(
    next: DinnerPlanDay[],
    weekOffset: DinnerPlanWeekOffset = dinnerPlanWeekOffset,
    options: { syncGroceries?: boolean } = {},
  ) {
    const normalized = stripExpiredDinnerPlanItems(sanitizeDinnerPlanDays(next))
    const prevByKey = new Map<string, DinnerPlanDay['items'][number]>()
    for (const day of dinnerPlanDays) {
      for (const item of day.items) prevByKey.set(`${day.day}__${item.category}__${item.name.trim().toLowerCase()}`, item)
    }
    const nextByKey = new Map<string, DinnerPlanDay['items'][number]>()
    for (const day of normalized) {
      for (const item of day.items) nextByKey.set(`${day.day}__${item.category}__${item.name.trim().toLowerCase()}`, item)
    }
    const removedItems = [...prevByKey.entries()]
      .filter(([key]) => !nextByKey.has(key))
      .map(([, item]) => item)
    const addedItems = [...nextByKey.entries()]
      .filter(([key]) => !prevByKey.has(key))
      .map(([, item]) => item)

    setDinnerPlanDays(normalized)
    if (!activeDeviceId) return

    const deleteDates = DINNER_PLAN_DAY_ORDER.map((day) => isoDateForDinnerDay(day, weekOffset))
    const { error: deleteError } = await supabase
      .from('dinner_plan_days')
      .delete()
      .eq('device_id', activeDeviceId)
      .in('date', deleteDates)
    if (deleteError) console.error('Failed to clear dinner plan days', { deleteError })

    const payload = normalized
      .filter((d) => d.title || d.items.length > 0)
      .map((d) => ({
        device_id: activeDeviceId,
        date: isoDateForDinnerDay(d.day, weekOffset),
        title: d.title || dinnerPlanDayLabel('en', d.day),
        note: JSON.stringify(d.items),
      }))
    if (payload.length > 0) {
      const { error } = await supabase.from('dinner_plan_days').upsert(payload, { onConflict: 'device_id,date' })
      if (error) console.error('Failed to persist dinner plan', { error })
    }

    if (options.syncGroceries === false) return

    // Keep dinner-plan save snappy for the active editor by moving heavy grocery/history sync
    // to background work after the core dinner_plan_days write has completed.
    void (async () => {
      if (addedItems.length > 0) {
        const historySeen = new Set<string>()
        const nowIso = new Date().toISOString()
        for (const item of addedItems) {
          const historyKey = `${item.name.trim().toLowerCase()}__${item.category}`
          if (historySeen.has(historyKey)) continue
          historySeen.add(historyKey)
          await rememberHistoryItem(item.name, item.category, nowIso)
        }
        await loadHistory()
      }

      if (removedItems.length > 0) {
        for (const item of removedItems) {
          const { error } = await supabase
            .from('grocery_items')
            .delete()
            .eq('device_id', activeDeviceId)
            .ilike('name', item.name.trim())
            .eq('category', item.category)
          if (error) console.error('Failed to remove dinner item from main list', { error, item })
        }
      }

      await syncMainGroceriesFromDinnerPlan(normalized)
    })()
  }
  function isDinnerVirtualId(id: string) {
    return id.startsWith('dinner-')
  }
  function findDinnerTarget(item: GroceryItem) {
    for (const day of dinnerPlanDays) {
      const idx = day.items.findIndex((x) => x.name.trim().toLowerCase() === item.name.trim().toLowerCase() && x.category === item.category)
      if (idx >= 0) return { day: day.day, idx }
    }
    return null
  }

  function toggleDinnerItem(dayKey: DinnerPlanDay['day'], itemIndex: number) {
    const nowIso = new Date().toISOString()
    const next = dinnerPlanDays.map((day) => {
      if (day.day !== dayKey) return day
      return {
        ...day,
        items: day.items.map((item, idx) => idx === itemIndex ? { ...item, isChecked: !item.isChecked, checkedAt: !item.isChecked ? nowIso : null, updatedAt: nowIso } : item),
      }
    })
    void persistDinnerPlan(next)
  }

  function adjustDinnerItemQty(dayKey: DinnerPlanDay['day'], itemIndex: number, delta: number) {
    const day = dinnerPlanDays.find((x) => x.day === dayKey)
    const current = day?.items[itemIndex]
    if (delta < 0 && current && current.quantity <= 1) {
      const confirmed = window.confirm(language === 'no' ? 'Fjerne denne varen fra listen?' : 'Remove this item from the list?')
      if (!confirmed) return
    }
    const next = dinnerPlanDays.map((day) => {
      if (day.day !== dayKey) return day
      const items = day.items
        .map((item, idx) => idx === itemIndex ? { ...item, quantity: Math.max(0, item.quantity + delta), updatedAt: new Date().toISOString() } : item)
        .filter((item) => item.quantity > 0)
      return { ...day, items }
    })
    void persistDinnerPlan(next)
  }

  async function addItem(name: string, quantity: number, category: GroceryCategory) {
    const normalizedName = name.trim()
    if (!normalizedName || !activeDeviceId) return

    const { data: authData } = await supabase.auth.getUser()
    const createdBy = authData.user?.id ?? null
    const nowIso = new Date().toISOString()
    const optimisticId = `local-${Math.random().toString(36).slice(2)}`
    const nextQty = Math.max(1, Number(quantity) || 1)
    setItems((prev) => [
      {
        id: optimisticId,
        name: normalizedName,
        quantity: nextQty,
        category,
        isChecked: false,
        checkedAt: null,
        updatedAt: nowIso,
      },
      ...prev,
    ])
    suppressRealtimeUntilRef.current = Date.now() + 1200
    const { error } = await supabase
      .from('grocery_items')
      .insert({
        device_id: activeDeviceId,
        created_by: createdBy,
        name: normalizedName,
        quantity: nextQty,
        category,
        is_checked: false,
        checked_at: null,
      })

    if (error) {
      setItems((prev) => prev.filter((item) => item.id !== optimisticId))
      alert(error.message)
      return
    }

    setItems((prev) => prev.filter((item) => item.id !== optimisticId))
    await rememberHistoryItem(normalizedName, category, nowIso)
    void markGroceryProbablyOutInsight(normalizedName)
    await loadHistory()
  }


  function setMatchingDinnerPlanItemsChecked(item: GroceryItem, nextChecked: boolean, checkedAtIso: string | null) {
    const itemName = item.name.trim().toLowerCase()
    if (!itemName) return

    let changed = false
    const next = dinnerPlanDays.map((day) => {
      let dayChanged = false
      const nextItems = day.items.map((dinnerItem) => {
        const isMatch = dinnerItem.name.trim().toLowerCase() === itemName && dinnerItem.category === item.category
        if (!isMatch || dinnerItem.isChecked === nextChecked) return dinnerItem
        changed = true
        dayChanged = true
        return {
          ...dinnerItem,
          isChecked: nextChecked,
          checkedAt: nextChecked ? checkedAtIso : null,
          updatedAt: checkedAtIso ?? new Date().toISOString(),
        }
      })
      return dayChanged ? { ...day, items: nextItems } : day
    })

    if (!changed) return
    void persistDinnerPlan(next, dinnerPlanWeekOffset, { syncGroceries: false })
  }

  async function toggleChecked(item: GroceryItem) {
    if (isDinnerVirtualId(item.id)) {
      const nextChecked = !item.isChecked
      const nowIso = new Date().toISOString()
      const next = dinnerPlanDays.map((day) => ({
        ...day,
        items: day.items.map((x) => x.name.trim().toLowerCase() === item.name.trim().toLowerCase() && x.category === item.category ? { ...x, isChecked: nextChecked, checkedAt: nextChecked ? nowIso : null, updatedAt: nowIso } : x),
      }))
      void persistDinnerPlan(next)
      if (nextChecked) void recordGroceryPurchaseInsight(item.name, item.quantity, item.category)
      return
    }
    const nextChecked = !item.isChecked
    const nowIso = new Date().toISOString()
    pendingScrollTopRef.current = listScrollRef.current?.scrollTop ?? null

    setItems((prev) =>
      prev.map((x) =>
        x.id === item.id
          ? {
              ...x,
              isChecked: nextChecked,
              checkedAt: nextChecked ? nowIso : null,
              updatedAt: nowIso,
            }
          : x
      )
    )

    const { error } = await supabase
      .from('grocery_items')
      .update({
        is_checked: nextChecked,
        checked_at: nextChecked ? nowIso : null,
      })
      .eq('id', item.id)

    if (error) {
      alert(error.message)
      await loadGroceries({ preserveScroll: true })
      return
    }

    setMatchingDinnerPlanItemsChecked(item, nextChecked, nextChecked ? nowIso : null)
    if (nextChecked) void recordGroceryPurchaseInsight(item.name, item.quantity, item.category)
  }

  async function adjustQuantity(item: GroceryItem, delta: number) {
    if (isDinnerVirtualId(item.id)) {
      const target = findDinnerTarget(item)
      if (!target) return
      if (delta < 0 && item.quantity <= 1) {
        const confirmed = window.confirm(language === 'no' ? 'Fjerne denne varen fra listen?' : 'Remove this item from the list?')
        if (!confirmed) return
      }
      const next = dinnerPlanDays.map((day) => {
        if (day.day !== target.day) return day
        const items = day.items
          .map((x, idx) => idx === target.idx ? { ...x, quantity: Math.max(0, x.quantity + delta), updatedAt: new Date().toISOString() } : x)
          .filter((x) => x.quantity > 0)
        return { ...day, items }
      })
      void persistDinnerPlan(next)
      return
    }
    if (delta < 0 && item.quantity === 1) {
      const confirmed = window.confirm(language === 'no' ? 'Fjerne denne varen fra listen?' : 'Remove this item from the list?')
      if (!confirmed) return

      setItems((prev) => prev.filter((x) => x.id !== item.id))
      const { error: deleteError } = await supabase
        .from('grocery_items')
        .delete()
        .eq('id', item.id)

      if (deleteError) {
        alert(deleteError.message)
        await loadGroceries({ silent: true, preserveScroll: true })
      }
      return
    }

    const nextQty = Math.max(1, item.quantity + delta)
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, quantity: nextQty, updatedAt: new Date().toISOString() } : x)))

    const { error } = await supabase
      .from('grocery_items')
      .update({
        quantity: nextQty,
      })
      .eq('id', item.id)

    if (error) {
      alert(error.message)
      await loadGroceries({ silent: true, preserveScroll: true })
    }
  }

  async function updateItem(id: string, name: string, quantity: number, category: GroceryCategory) {
    if (!activeDeviceId) return
    const normalizedName = name.trim()
    if (!normalizedName) return
    const previousName = items.find((item) => item.id === id)?.name.trim() ?? ''
    const hasNameChange = previousName.toLocaleLowerCase() !== normalizedName.toLocaleLowerCase()
    const nowIso = new Date().toISOString()
    const nextQty = Math.max(1, Number(quantity) || 1)
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, name: normalizedName, quantity: nextQty, category, updatedAt: nowIso }
          : item
      )
    )
    suppressRealtimeUntilRef.current = Date.now() + 1200

    const { error } = await supabase
      .from('grocery_items')
      .update({
        name: normalizedName,
        quantity: nextQty,
        category,
      })
      .eq('id', id)

    if (error) {
      alert(error.message)
      await loadGroceries({ silent: true, preserveScroll: true })
      return
    }

    const historyBase = {
      device_id: activeDeviceId,
      name: normalizedName,
      category,
      last_used_at: nowIso,
    }

    if (!hasNameChange) {
      await supabase
        .from('grocery_item_history')
        .upsert(historyBase, { onConflict: 'device_id,name' })
    } else {
      const { data: oldHistory } = await supabase
        .from('grocery_item_history')
        .select('id, usage_count')
        .eq('device_id', activeDeviceId)
        .ilike('name', previousName)
        .limit(1)
        .maybeSingle()

      const { data: updatedHistory } = await supabase
        .from('grocery_item_history')
        .select('id, usage_count')
        .eq('device_id', activeDeviceId)
        .ilike('name', normalizedName)
        .limit(1)
        .maybeSingle()

      const oldUsageCount = oldHistory?.id ? Math.max(1, Number(oldHistory.usage_count ?? 1) || 1) : 0

      if (updatedHistory?.id) {
        await supabase
          .from('grocery_item_history')
          .update({
            usage_count: Math.max(1, Number(updatedHistory.usage_count ?? 1) || 1) + oldUsageCount,
            category,
            last_used_at: nowIso,
          })
          .eq('id', updatedHistory.id)
      } else {
        await supabase
          .from('grocery_item_history')
          .upsert({
            ...historyBase,
            usage_count: Math.max(1, oldUsageCount || 1),
          }, { onConflict: 'device_id,name' })
      }

      if (oldHistory?.id && oldHistory.id !== updatedHistory?.id) {
        await supabase
          .from('grocery_item_history')
          .delete()
          .eq('id', oldHistory.id)
      }
    }

    await loadHistory()
  }

  async function deleteHistorySuggestion(name: string) {
    if (!activeDeviceId) return
    const normalizedName = name.trim()
    if (!normalizedName) return

    const { error } = await supabase
      .from('grocery_item_history')
      .delete()
      .eq('device_id', activeDeviceId)
      .ilike('name', normalizedName)

    if (error) {
      alert(error.message)
      return
    }

    await loadHistory()
  }

  return (
    <>
    <div className="h-full flex flex-col min-h-0">
      <div ref={listScrollRef} className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-[color:var(--fg-50)]">{language === 'no' ? 'Laster…' : 'Loading…'}</div>
        ) : groupedVisibleItems.length === 0 ? (
          <div className="p-4 text-sm text-[color:var(--fg-50)]">{t.groceriesNoItems}</div>
        ) : (
          <div className="px-2 py-2">
            {groupsForDisplay.map((group) => (
              <div key={group.category} className="mb-3">
                <div className="px-1 pb-1 text-[10px] tracking-widest text-[color:var(--fg-45)]">
                  {groceryCategoryLabel(language, group.category)}
                </div>
                <div className="rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-02)]">
                <ul className="divide-y divide-[color:var(--bd-10)]">
            {group.items.map((item) => (
              <li
                key={item.id}
                className="px-4 py-3 flex items-start gap-3 cursor-pointer"
                onClick={() => {
                  if (isDinnerVirtualId(item.id)) {
                    const target = findDinnerTarget(item)
                    if (target) setDinnerPlanMainEditTarget(target)
                    return
                  }
                  setEditingItem(item)
                  setSheetOpen(true)
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleChecked(item)
                  }}
                  className={`mt-0.5 h-6 w-6 shrink-0 rounded-full border ${item.isChecked ? 'border-[color:var(--fg-35)] bg-[color:var(--fg-35)]/20' : 'border-[color:var(--fg-55)]'} flex items-center justify-center`}
                  aria-label={item.isChecked ? `${t.groceriesCheckedLabel}: ${item.name}` : item.name}
                >
                  {item.isChecked ? <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--fg-60)]" /> : null}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={`text-[color:var(--fg-90)] ${item.isChecked ? 'line-through text-[color:var(--fg-45)]' : ''}`}>
                    {item.name}
                  </div>
                  {item.isChecked ? (
                    <div className="text-[10px] tracking-wide mt-1 text-[color:var(--fg-40)]">
                      {groceryUndoHint(language, item.checkedAt, nowMs)}
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 flex items-center gap-2.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      adjustQuantity(item, -1)
                    }}
                    className="h-8 w-8 rounded-full border border-[color:var(--bd-15)] text-[color:var(--fg-65)]"
                  >
                    −
                  </button>
                  <div className={`text-sm w-8 text-center [font-variant-numeric:tabular-nums] text-[color:var(--fg-55)] ${item.isChecked ? 'line-through' : ''}`}>
                    {item.quantity}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      adjustQuantity(item, +1)
                    }}
                    className="h-8 w-8 rounded-full border border-[color:var(--bd-15)] text-[color:var(--fg-65)]"
                  >
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="py-5 flex flex-col items-center relative z-20">
        <button
          onClick={() => {
            setEditingItem(null)
            setSheetOpen(true)
          }}
          disabled={!activeDeviceId}
          className={`mt-3 w-[260px] h-[56px] rounded-2xl border tracking-widest transition bg-[color:var(--app-bg)] ${
            !activeDeviceId ? 'border-[color:var(--bd-30)] text-[color:var(--fg-50)]' : 'border-[#2aa3ff] text-[#2aa3ff]'
          }`}
          style={{ backgroundColor: 'var(--app-bg)' }}
        >
          {language === 'no' ? 'LEGG TIL VARE' : 'ADD ITEM'}
        </button>
        <button
          onClick={() => {
            if (dinnerPlanLockedByOtherUser) return
            const nextOffset = defaultDinnerPlanWeekOffset()
            setDinnerPlanWeekOffset(nextOffset)
            void loadDinnerPlan(nextOffset)
            setDinnerPlanOpen(true)
          }}
          disabled={!activeDeviceId || dinnerPlanLockedByOtherUser}
          className={`mt-3 w-[260px] h-[44px] rounded-2xl border text-xs tracking-widest transition ${
            !activeDeviceId || dinnerPlanLockedByOtherUser ? 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]' : 'border-[color:var(--bd-15)] text-[color:var(--fg-75)]'
          }`}
        >
          {dinnerPlanLockedByOtherUser
            ? (language === 'no' ? 'LÅST AV ANNEN BRUKER' : 'LOCKED BY OTHER USER')
            : (language === 'no' ? (hasDinnerPlan ? 'REDIGER MIDDAGSPLAN' : 'LAG MIDDAGSPLAN') : (hasDinnerPlan ? 'EDIT DINNER PLAN' : 'CREATE DINNER PLAN'))}
        </button>
      </div>
    </div>
    {dinnerPlanOpen && activeDeviceId && (
      <DinnerPlanSheet
        language={language}
        suggestions={suggestions}
        initialDays={dinnerPlanDays}
        initialWeekOffset={dinnerPlanWeekOffset}
        isLocked={dinnerPlanLockedByOtherUser}
        onWeekChange={fetchDinnerPlanDays}
        onItemAdded={async (name, category) => {
          const nowIso = new Date().toISOString()
          await rememberHistoryItem(name, category, nowIso)
          await loadHistory()
        }}
        onCancel={async () => {
          const displayOffset = defaultDinnerPlanWeekOffset()
          setDinnerPlanOpen(false)
          const latest = await loadDinnerPlan(displayOffset)
          await syncMainGroceriesFromDinnerPlan(latest)
        }}
        onSave={async (days, weekOffset) => {
          const nextDays = sanitizeDinnerPlanDays(days)
          await persistDinnerPlan(nextDays, weekOffset)
          setDinnerPlanOpen(false)
          const displayOffset = defaultDinnerPlanWeekOffset()
          if (weekOffset !== displayOffset) {
            await loadDinnerPlan(displayOffset)
          }
          await syncMainGroceriesFromDinnerPlan(nextDays)
        }}
      />
    )}
    {dinnerPlanMainEditTarget ? (
      <DinnerPlanAddItemSheet
        language={language}
        suggestions={suggestions}
        initialItem={dinnerPlanDays.find((d) => d.day === dinnerPlanMainEditTarget.day)?.items[dinnerPlanMainEditTarget.idx] ?? null}
        onClose={() => setDinnerPlanMainEditTarget(null)}
        onAdd={(name, quantity, category) => {
          const next = dinnerPlanDays.map((d) => d.day === dinnerPlanMainEditTarget.day ? { ...d, items: d.items.map((it, i) => i === dinnerPlanMainEditTarget.idx ? { ...it, name, quantity, category, updatedAt: new Date().toISOString() } : it) } : d)
          void persistDinnerPlan(next)
          setDinnerPlanMainEditTarget(null)
        }}
      />
    ) : null}
    {sheetOpen && activeDeviceId && (
      <GroceriesDraftSheet
        language={language}
        suggestions={suggestions}
        onClose={() => {
          setSheetOpen(false)
          setEditingItem(null)
        }}
        onSaved={async () => {
          setSheetOpen(false)
          setEditingItem(null)
          await loadGroceries({ silent: true, keepAnchorUnlessUserScrolled: true })
          await loadHistory()
        }}
        addItem={addItem}
        updateItem={updateItem}
        onDeleteSuggestion={deleteHistorySuggestion}
        editingItem={editingItem}
      />
    )}
    </>
  )
}

function GroceriesDraftSheet({
  language,
  suggestions,
  onClose,
  onSaved,
  addItem,
  updateItem,
  onDeleteSuggestion,
  editingItem,
}: {
  language: AppLanguage
  suggestions: GrocerySuggestion[]
  onClose: () => void
  onSaved: () => void | Promise<void>
  addItem: (name: string, quantity: number, category: GroceryCategory) => Promise<void>
  updateItem: (id: string, name: string, quantity: number, category: GroceryCategory) => Promise<void>
  onDeleteSuggestion: (name: string) => Promise<void>
  editingItem: GroceryItem | null
}) {
  const [name, setName] = useState(editingItem?.name ?? '')
  const [quantity, setQuantity] = useState(editingItem?.quantity ?? 1)
  const [category, setCategory] = useState<GroceryCategory>(editingItem?.category ?? 'other')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(editingItem?.name ?? '')
    setQuantity(editingItem?.quantity ?? 1)
    setCategory(editingItem?.category ?? 'other')
  }, [editingItem])

  const filteredSuggestions = useMemo(() => {
    const q = name.trim().toLowerCase()
    const list = suggestions.filter((s) => !q || s.name.toLowerCase().includes(q))
    return list.sort((a, b) => {
      if (category) {
        const aCategoryScore = a.category === category ? 1 : 0
        const bCategoryScore = b.category === category ? 1 : 0
        if (aCategoryScore !== bCategoryScore) return bCategoryScore - aCategoryScore
      }
      if (a.usageCount !== b.usageCount) return b.usageCount - a.usageCount
      const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0
      const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0
      return bTime - aTime
    })
  }, [category, name, suggestions])

  useEffect(() => {
    if (editingItem) return
    const found = suggestions.find((s) => s.name.toLowerCase() === name.trim().toLowerCase())
    setCategory(found?.category ?? 'other')
  }, [editingItem, name, suggestions])

  const canSave = !!name.trim() && !saving

  async function save() {
    if (!canSave) return
    setSaving(true)
    try {
      if (editingItem?.id) {
        await updateItem(editingItem.id, name.trim(), quantity, category)
      } else {
        await addItem(name.trim(), quantity, category)
      }
      await onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--overlay-55)]">
      <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] flex flex-col max-h-[88vh] px-5 pt-5 pb-6">
        <div className="flex items-center justify-between">
          <div className="tracking-widest text-sm text-[color:var(--fg-70)]">
            {editingItem ? (language === 'no' ? 'REDIGER VARE' : 'EDIT ITEM') : (language === 'no' ? 'LEGG TIL VARE' : 'ADD ITEM')}
          </div>
          <button onClick={onClose} className="text-[color:var(--fg-60)] text-xl">✕</button>
        </div>

        <input
          autoFocus={!editingItem}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={tx(language).groceriesInputPlaceholder}
          className="mt-4 w-full h-12 rounded-2xl bg-[color:var(--panel-05)] border border-[color:var(--bd-10)] px-4 text-[color:var(--fg-90)] outline-none"
        />

        <div className="mt-4 flex items-center justify-center gap-3">
          <button onClick={() => setQuantity((v) => Math.max(1, v - 1))} className="h-9 w-9 rounded-full border border-[color:var(--bd-15)]">−</button>
          <div className="w-10 text-center text-[color:var(--fg-85)]">{quantity}</div>
          <button onClick={() => setQuantity((v) => v + 1)} className="h-9 w-9 rounded-full border border-[color:var(--bd-15)]">+</button>
        </div>

        <select
          value={category}
          onChange={(e) => setCategory(asGroceryCategory(e.target.value))}
          className="mt-4 w-full h-11 rounded-2xl bg-[color:var(--panel-05)] border border-[color:var(--bd-10)] px-3 text-[color:var(--fg-85)] outline-none"
        >
          {GROCERY_CATEGORY_LIST_ORDER.map((c) => (
            <option key={c} value={c}>{groceryCategoryLabel(language, c)}</option>
          ))}
        </select>

        <div className="mt-4 text-[10px] tracking-widest text-[color:var(--fg-45)]">{tx(language).groceriesSuggestions}</div>
        <div className="mt-2 h-48 overflow-y-auto rounded-2xl border border-[color:var(--bd-10)]">
          {filteredSuggestions.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-[color:var(--fg-45)]">
              {language === 'no' ? 'Ingen treff' : 'No matching items'}
            </div>
          ) : filteredSuggestions.map((s) => (
            <GrocerySuggestionSwipeRow
              key={s.name.toLowerCase()}
              language={language}
              suggestion={s}
              onSelect={() => {
                setName(s.name)
                setCategory(s.category)
                setQuantity(1)
              }}
              onDelete={onDeleteSuggestion}
            />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2">
          <button
            onClick={save}
            disabled={!canSave}
            className={`h-11 rounded-2xl border tracking-widest text-xs ${canSave ? 'border-[#2aa3ff] text-[#2aa3ff]' : 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]'}`}
          >
            {editingItem ? (language === 'no' ? 'LAGRE ENDRINGER' : 'SAVE CHANGES') : tx(language).groceriesAdd}
          </button>
          <button onClick={onClose} className="h-11 rounded-2xl border border-[color:var(--bd-10)] tracking-widest text-xs text-[color:var(--fg-65)] w-full">
            {language === 'no' ? 'LUKK' : 'CLOSE'}
          </button>
        </div>
      </div>
    </div>
  )
}


function DinnerPlanSheet({
  language,
  suggestions,
  initialDays,
  initialWeekOffset,
  isLocked,
  onWeekChange,
  onCancel,
  onSave,
  onItemAdded,
}: {
  language: AppLanguage
  suggestions: GrocerySuggestion[]
  initialDays: DinnerPlanDay[]
  initialWeekOffset: DinnerPlanWeekOffset
  isLocked: boolean
  onWeekChange: (weekOffset: DinnerPlanWeekOffset) => Promise<DinnerPlanDay[]>
  onCancel: () => void
  onSave: (days: DinnerPlanDay[], weekOffset: DinnerPlanWeekOffset) => void
  onItemAdded: (name: string, category: GroceryCategory) => Promise<void>
}) {
  const [days, setDays] = useState<DinnerPlanDay[]>(() => initialDays.map((d) => ({ ...d, items: [...d.items] })))
  const [weekOffset, setWeekOffset] = useState<DinnerPlanWeekOffset>(initialWeekOffset)
  const [addTargetDay, setAddTargetDay] = useState<DinnerPlanDay['day'] | null>(null)
  const [editingTarget, setEditingTarget] = useState<{ day: DinnerPlanDay['day']; idx: number } | null>(null)
  useEffect(() => {
    setDays(initialDays.map((d) => ({ ...d, items: [...d.items] })))
  }, [initialDays])
  useEffect(() => {
    setWeekOffset(initialWeekOffset)
  }, [initialWeekOffset])
  const blocked = isLocked
  const switchWeek = async (nextWeekOffset: DinnerPlanWeekOffset) => {
    if (nextWeekOffset === weekOffset || blocked) return
    setWeekOffset(nextWeekOffset)
    setAddTargetDay(null)
    setEditingTarget(null)
    const nextDays = await onWeekChange(nextWeekOffset)
    setDays(nextDays.map((d) => ({ ...d, items: [...d.items] })))
  }
  const setTitle = (day: DinnerPlanDay['day'], title: string) => setDays((prev) => prev.map((x) => x.day === day ? { ...x, title } : x))
  const addItemToDay = (day: DinnerPlanDay['day'], name: string, quantity: number, category: GroceryCategory) =>
    setDays((prev) => prev.map((x) => x.day === day ? { ...x, items: [...x.items, { name: name.trim(), quantity: Math.max(1, quantity), category, isChecked: false, checkedAt: null, updatedAt: new Date().toISOString() }] } : x))
  const adjustDayItemQty = (day: DinnerPlanDay['day'], idx: number, delta: number) =>
    setDays((prev) =>
      prev.map((x) => {
        if (x.day !== day) return x
        const current = x.items[idx]
        if (delta < 0 && current && current.quantity <= 1) {
          const confirmed = window.confirm(language === 'no' ? 'Fjerne denne varen fra dagen?' : 'Remove this item from this day?')
          if (!confirmed) return x
        }
        const items = x.items
          .map((it, i) => (i === idx ? { ...it, quantity: Math.max(0, it.quantity + delta), updatedAt: new Date().toISOString() } : it))
          .filter((it) => it.quantity > 0)
        return { ...x, items }
      })
    )
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[color:var(--overlay-55)]">
    <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] flex flex-col max-h-[90vh] px-5 pt-5 pb-6">
      <div className="flex items-center justify-between"><div className="tracking-widest text-sm text-[color:var(--fg-70)]">{language === 'no' ? 'MIDDAGSPLAN' : 'DINNER PLAN'}</div></div>
      <div className="mt-4 grid grid-cols-2 rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] p-1" role="tablist" aria-label={language === 'no' ? 'Velg middagsplanuke' : 'Choose dinner plan week'}>
        <button
          type="button"
          disabled={blocked}
          onClick={() => void switchWeek(0)}
          aria-pressed={weekOffset === 0}
          className={`h-9 rounded-xl text-[10px] tracking-widest transition ${weekOffset === 0 ? 'bg-[#2aa3ff] text-white' : 'text-[color:var(--fg-55)]'}`}
        >
          {language === 'no' ? 'DENNE UKEN' : 'THIS WEEK'}
        </button>
        <button
          type="button"
          disabled={blocked}
          onClick={() => void switchWeek(1)}
          aria-pressed={weekOffset === 1}
          className={`h-9 rounded-xl text-[10px] tracking-widest transition ${weekOffset === 1 ? 'bg-[#2aa3ff] text-white' : 'text-[color:var(--fg-55)]'}`}
        >
          {language === 'no' ? 'NESTE UKE' : 'NEXT WEEK'}
        </button>
      </div>
      {blocked ? <div className="mt-3 text-[10px] tracking-widest text-[color:var(--fg-45)]">{language === 'no' ? 'LÅST AV ANNEN BRUKER' : 'LOCKED BY OTHER USER'}</div> : null}
      <div className="mt-4 overflow-y-auto pr-1">
        {days.map((day) => <div key={day.day} className="mb-3 rounded-2xl border border-[color:var(--bd-10)] p-3">
          <div className="text-[10px] tracking-widest text-[color:var(--fg-45)]">{dinnerPlanDayLabel(language, day.day)}</div>
          <input disabled={blocked} value={day.title} onChange={(e)=>setTitle(day.day,e.target.value)} placeholder={language === 'no' ? 'Hva er til middag?' : 'What is for dinner?'} className="mt-2 w-full h-10 rounded-xl bg-[color:var(--panel-05)] border border-[color:var(--bd-10)] px-3 text-sm" />
          <div className="mt-2">
            {[...GROCERY_CATEGORY_LIST_ORDER].sort((a, b) => {
              const aItems = day.items.filter((item) => item.category === a)
              const bItems = day.items.filter((item) => item.category === b)
              const aAllChecked = aItems.length > 0 && aItems.every((x) => x.isChecked)
              const bAllChecked = bItems.length > 0 && bItems.every((x) => x.isChecked)
              if (aAllChecked !== bAllChecked) return aAllChecked ? 1 : -1
              return GROCERY_CATEGORY_LIST_ORDER.indexOf(a) - GROCERY_CATEGORY_LIST_ORDER.indexOf(b)
            }).map((c) => {
              const categoryItems = day.items.map((item, idx) => ({ item, idx })).filter((x) => x.item.category === c)
              if (categoryItems.length === 0) return null
              return <div key={`${day.day}-${c}`} className="mb-2">
                <div className="px-1 pb-1 text-[10px] tracking-widest text-[color:var(--fg-45)]">{groceryCategoryLabel(language, c)}</div>
                <div className="rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-02)] divide-y divide-[color:var(--bd-10)]">
                  {categoryItems.map(({ item, idx }) => (
                    <div key={`${day.day}-${c}-${idx}`} className="px-3 py-2 flex items-center gap-3">
                      <button disabled={blocked} onClick={() => setEditingTarget({ day: day.day, idx })} className="min-w-0 flex-1 text-left text-[color:var(--fg-90)]">{item.name}</button>
                      <div className="shrink-0 flex items-center gap-2.5">
                        <button disabled={blocked} onClick={() => adjustDayItemQty(day.day, idx, -1)} className="h-8 w-8 rounded-full border border-[color:var(--bd-15)] text-[color:var(--fg-65)]">−</button>
                        <div className="text-sm w-8 text-center [font-variant-numeric:tabular-nums] text-[color:var(--fg-55)]">{item.quantity}</div>
                        <button disabled={blocked} onClick={() => adjustDayItemQty(day.day, idx, +1)} className="h-8 w-8 rounded-full border border-[color:var(--bd-15)] text-[color:var(--fg-65)]">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            })}
          </div>
          <button disabled={blocked} onClick={() => setAddTargetDay(day.day)} className="mt-2 h-8 px-3 rounded-xl border border-[color:var(--bd-15)] text-[10px] tracking-widest">{language === 'no' ? 'LEGG TIL VARE' : 'ADD ITEM'}</button>
        </div>)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button disabled={blocked} onClick={() => onSave(days.map((d) => ({ ...d, title: d.title.trim(), items: d.items.filter((i) => i.name.trim()) })), weekOffset)} className="h-11 rounded-2xl border border-[#2aa3ff] text-[#2aa3ff] tracking-widest text-xs">{language === 'no' ? 'LAGRE' : 'SAVE'}</button>
        <button onClick={onCancel} className="h-11 rounded-2xl border border-[color:var(--bd-10)] tracking-widest text-xs text-[color:var(--fg-65)]">{language === 'no' ? 'AVBRYT' : 'CANCEL'}</button>
      </div>
    </div>
    {addTargetDay ? (
      <DinnerPlanAddItemSheet
        language={language}
        suggestions={suggestions}
        onClose={() => setAddTargetDay(null)}
        onAdd={(name, quantity, category) => {
          addItemToDay(addTargetDay, name, quantity, category)
          void onItemAdded(name, category)
          setAddTargetDay(null)
        }}
      />
    ) : null}
    {editingTarget ? (
      <DinnerPlanAddItemSheet
        language={language}
        suggestions={suggestions}
        initialItem={days.find((d) => d.day === editingTarget.day)?.items[editingTarget.idx] ?? null}
        onClose={() => setEditingTarget(null)}
        onAdd={(name, quantity, category) => {
          setDays((prev) => prev.map((d) => d.day === editingTarget.day ? { ...d, items: d.items.map((it, i) => i === editingTarget.idx ? { ...it, name, quantity, category, updatedAt: new Date().toISOString() } : it) } : d))
          setEditingTarget(null)
        }}
      />
    ) : null}
  </div>
}

function DinnerPlanAddItemSheet({
  language,
  suggestions,
  initialItem,
  onClose,
  onAdd,
}: {
  language: AppLanguage
  suggestions: GrocerySuggestion[]
  initialItem?: { name: string; quantity: number; category: GroceryCategory } | null
  onClose: () => void
  onAdd: (name: string, quantity: number, category: GroceryCategory) => void
}) {
  const [name, setName] = useState(initialItem?.name ?? '')
  const [quantity, setQuantity] = useState(initialItem?.quantity ?? 1)
  const [category, setCategory] = useState<GroceryCategory>(initialItem?.category ?? 'other')
  const filtered = useMemo(() => {
    const q = name.trim().toLowerCase()
    return suggestions.filter((s) => !q || s.name.toLowerCase().includes(q)).slice(0, 30)
  }, [name, suggestions])

  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[color:var(--overlay-55)]">
    <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] flex flex-col max-h-[88vh] px-5 pt-5 pb-6">
      <div className="flex items-center justify-between"><div className="tracking-widest text-sm text-[color:var(--fg-70)]">{language === 'no' ? 'LEGG TIL VARE' : 'ADD ITEM'}</div><button onClick={onClose} className="text-[color:var(--fg-60)] text-xl">✕</button></div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tx(language).groceriesInputPlaceholder} className="mt-4 w-full h-12 rounded-2xl bg-[color:var(--panel-05)] border border-[color:var(--bd-10)] px-4 text-[color:var(--fg-90)] outline-none" />
      <div className="mt-4 flex items-center justify-center gap-3">
          <button onClick={() => setQuantity((v: number) => Math.max(1, v - 1))} className="h-9 w-9 rounded-full border border-[color:var(--bd-15)]">−</button>
        <div className="w-10 text-center text-[color:var(--fg-85)]">{quantity}</div>
          <button onClick={() => setQuantity((v: number) => v + 1)} className="h-9 w-9 rounded-full border border-[color:var(--bd-15)]">+</button>
      </div>
      <select value={category} onChange={(e) => setCategory(asGroceryCategory(e.target.value))} className="mt-4 w-full h-11 rounded-2xl bg-[color:var(--panel-05)] border border-[color:var(--bd-10)] px-3 text-[color:var(--fg-85)] outline-none">
        {GROCERY_CATEGORY_LIST_ORDER.map((c) => <option key={c} value={c}>{groceryCategoryLabel(language, c)}</option>)}
      </select>
      <div className="mt-4 text-[10px] tracking-widest text-[color:var(--fg-45)]">{tx(language).groceriesSuggestions}</div>
      <div className="mt-2 h-56 overflow-y-auto rounded-2xl border border-[color:var(--bd-10)]">
        {filtered.map((s) => <button key={s.name} onClick={() => { setName(s.name); setCategory(s.category) }} className="w-full text-left px-4 py-3 border-b border-[color:var(--bd-10)] last:border-b-0"><div className="text-[color:var(--fg-90)]">{s.name}</div><div className="text-xs text-[color:var(--fg-45)]">{groceryCategoryLabel(language, s.category)}</div></button>)}
      </div>
      <button onClick={() => name.trim() && onAdd(name.trim(), quantity, category)} disabled={!name.trim()} className={`mt-4 h-11 rounded-2xl border tracking-widest text-xs ${name.trim() ? 'border-[#2aa3ff] text-[#2aa3ff]' : 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]'}`}>{language === 'no' ? 'LEGG TIL' : 'ADD'}</button>
      <button onClick={onClose} className="mt-2 h-11 rounded-2xl border border-[color:var(--bd-10)] tracking-widest text-xs text-[color:var(--fg-65)]">{language === 'no' ? 'LUKK' : 'CLOSE'}</button>
    </div>
  </div>
}

function GrocerySuggestionSwipeRow({
  language,
  suggestion,
  onSelect,
  onDelete,
}: {
  language: AppLanguage
  suggestion: GrocerySuggestion
  onSelect: () => void
  onDelete: (name: string) => Promise<void>
}) {
  const deleteWidth = 88
  const openThreshold = 40
  const [translateX, setTranslateX] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const dragStartXRef = useRef<number | null>(null)

  const closeSwipe = () => setTranslateX(0)

  const handleTouchStart = (event: React.TouchEvent<HTMLButtonElement>) => {
    dragStartXRef.current = event.touches[0]?.clientX ?? null
  }

  const handleTouchMove = (event: React.TouchEvent<HTMLButtonElement>) => {
    if (dragStartXRef.current == null) return
    const currentX = event.touches[0]?.clientX ?? dragStartXRef.current
    const deltaX = currentX - dragStartXRef.current
    const nextTranslate = Math.max(-deleteWidth, Math.min(0, deltaX))
    if (nextTranslate < 0) {
      event.preventDefault()
    }
    setTranslateX(nextTranslate)
  }

  const handleTouchEnd = () => {
    dragStartXRef.current = null
    setTranslateX((prev) => (prev < -openThreshold ? -deleteWidth : 0))
  }

  const handleDelete = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (deleting) return
    setDeleting(true)
    try {
      await onDelete(suggestion.name)
      closeSwipe()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="relative overflow-hidden border-b border-[color:var(--bd-10)] last:border-b-0">
      <div className="absolute inset-y-0 right-0 w-[88px] flex items-center justify-center bg-[#d94b4b]">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="h-full w-full text-[10px] tracking-widest text-white disabled:opacity-70"
        >
          {language === 'no' ? 'SLETT' : 'DELETE'}
        </button>
      </div>
      <button
        onClick={() => {
          if (translateX !== 0) {
            closeSwipe()
            return
          }
          onSelect()
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative w-full bg-[color:var(--sheet-bg)] text-left px-3 py-2 transition-transform duration-150 touch-pan-y"
        style={{ transform: `translateX(${translateX}px)` }}
      >
        <div className="text-sm text-[color:var(--fg-85)]">{suggestion.name}</div>
        <div className="text-[10px] text-[color:var(--fg-45)]">{groceryCategoryLabel(language, suggestion.category)}</div>
      </button>
    </div>
  )
}

function RemindersModuleSettingsTab({
  language,
  activeDeviceId,
}: {
  language: AppLanguage
  activeDeviceId: string | null
}) {
  const [reminders, setReminders] = useState<ReminderUiItem[]>([])
  const [completedOccurrences, setCompletedOccurrences] = useState<ReminderCompletionItem[]>([])
  const [loading, setLoading] = useState(false)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingReminder, setEditingReminder] = useState<ReminderUiItem | null>(null)
  const [tagFilter, setTagFilter] = useState<ReminderTagFilter>('all')

  const [selectedDayYmd, setSelectedDayYmd] = useState<string | null>(null)

  const calendarTouchStartYRef = useRef<number | null>(null)
  const calendarWheelLockRef = useRef<number>(0)

  const [viewYear, setViewYear] = useState(new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(new Date().getMonth())

  const [calendarAnimClass, setCalendarAnimClass] = useState('')
  const calendarAnimTimerRef = useRef<number | null>(null)

  const todayYmd = toLocalYmd(new Date())
    async function loadReminders() {
    if (!activeDeviceId) {
      setReminders([])
      return
    }

    try {
      setLoading(true)

      const { data, error } = await supabase
        .from('reminders')
        .select('id, title, due_date, due_time, tag, repeat_type, custom_repeat_days, is_done')
        .eq('device_id', activeDeviceId)
        .eq('is_done', false)
        .order('due_date', { ascending: true })
        .order('due_time', { ascending: true, nullsFirst: false })
        .order('title', { ascending: true })

      if (error) {
        alert(error.message)
        setReminders([])
        setCompletedOccurrences([])
        return
      }
      const { data: completionsData, error: completionsError } = await supabase
        .from('reminder_completions')
        .select('reminder_id, occurrence_date')
        .eq('device_id', activeDeviceId)

      if (completionsError) {
        alert(completionsError.message)
        setCompletedOccurrences([])
      } else {
        setCompletedOccurrences(
          (completionsData || [])
            .map((row: any) => ({
              reminderId: String(row.reminder_id ?? ''),
              occurrenceDate: String(row.occurrence_date ?? ''),
            }))
            .filter((x) => x.reminderId && x.occurrenceDate)
        )
      }

const items: ReminderUiItem[] = (data || [])
  .map((row: any) => ({
    id: String(row.id),
    title: String(row.title ?? '').trim(),
    date: String(row.due_date ?? '').trim(),
    time: row.due_time ?? null,
    tag: isReminderTag(row.tag) ? row.tag : null,
    repeat: isReminderRepeatKey(row.repeat_type) ? row.repeat_type : 'none',
    customRepeatDays:
      Number.isFinite(Number(row.custom_repeat_days)) && Number(row.custom_repeat_days) > 0
        ? Number(row.custom_repeat_days)
        : null,
  }))
  .filter((x) => x.title && x.date)

      setReminders(items)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReminders()
  }, [activeDeviceId])

  useEffect(() => {
    return () => {
      if (calendarAnimTimerRef.current) window.clearTimeout(calendarAnimTimerRef.current)
    }
  }, [])

  function triggerCalendarAnimation(direction: 'next' | 'prev') {
    if (calendarAnimTimerRef.current) window.clearTimeout(calendarAnimTimerRef.current)

    setCalendarAnimClass(direction === 'next' ? 'animate-[monthSlideUp_220ms_ease-out]' : 'animate-[monthSlideDown_220ms_ease-out]')

    calendarAnimTimerRef.current = window.setTimeout(() => {
      setCalendarAnimClass('')
    }, 230)
  }

  function moveMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1)
    triggerCalendarAnimation(delta > 0 ? 'next' : 'prev')
    setViewYear(next.getFullYear())
    setViewMonth(next.getMonth())
  }

  const monthLabel = useMemo(() => {
    return new Date(viewYear, viewMonth, 1).toLocaleDateString(language === 'no' ? 'nb-NO' : undefined, {
      month: 'long',
      year: 'numeric',
    })
  }, [viewYear, viewMonth, language])

  const firstDay = new Date(viewYear, viewMonth, 1)
  const startWeekday = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate()

  const gridStartYmd = useMemo(() => {
    const start = new Date(viewYear, viewMonth, 1)
    start.setDate(start.getDate() - startWeekday)
    return toLocalYmd(start)
  }, [viewYear, viewMonth, startWeekday])

  const gridEndYmd = useMemo(() => {
    const end = new Date(viewYear, viewMonth, 1)
    end.setDate(end.getDate() - startWeekday + 41)
    return toLocalYmd(end)
  }, [viewYear, viewMonth, startWeekday])

  const filteredReminders = useMemo(() => {
    if (tagFilter === 'all') return reminders
    return reminders.filter((x) => x.tag === tagFilter)
  }, [reminders, tagFilter])

  const visibleOccurrences = useMemo(() => {
    return expandReminderOccurrences(filteredReminders, gridStartYmd, gridEndYmd, 180)
  }, [filteredReminders, gridStartYmd, gridEndYmd])

  const reminderDotsByDay = useMemo(() => {
    const map: Record<string, number> = {}

    for (const item of visibleOccurrences) {
      const key = item.occurrenceDate
      if (!key) continue
      if (key < todayYmd) continue
      map[key] = Math.min(3, (map[key] || 0) + 1)
    }

    return map
  }, [visibleOccurrences, todayYmd])

  const calendarCells: Array<{
    ymd: string
    day: number
    inMonth: boolean
    isToday: boolean
    isSelected: boolean
    dotCount: number
  }> = []

  for (let i = 0; i < 42; i++) {
    let y = viewYear
    let m = viewMonth
    let d = 0
    let inMonth = true

    if (i < startWeekday) {
      inMonth = false
      d = prevMonthDays - startWeekday + i + 1
      if (m === 0) {
        y -= 1
        m = 11
      } else {
        m -= 1
      }
    } else if (i >= startWeekday + daysInMonth) {
      inMonth = false
      d = i - (startWeekday + daysInMonth) + 1
      if (m === 11) {
        y += 1
        m = 0
      } else {
        m += 1
      }
    } else {
      d = i - startWeekday + 1
    }

    const dt = new Date(y, m, d)
    const ymd = toLocalYmd(dt)

    calendarCells.push({
      ymd,
      day: d,
      inMonth,
      isToday: ymd === todayYmd,
      isSelected: selectedDayYmd === ymd,
      dotCount: reminderDotsByDay[ymd] || 0,
    })
  }

  const listRangeEnd = useMemo(() => {
    const end = addYearsLocal(new Date(), 3)
    return toLocalYmd(end)
  }, [])

  const allListOccurrences = useMemo(() => {
    return expandReminderOccurrences(filteredReminders, todayYmd, listRangeEnd, 160)
  }, [filteredReminders, todayYmd, listRangeEnd])



  const completedOccurrenceKeySet = useMemo(() => {
    return new Set(completedOccurrences.map((x) => `${x.reminderId}__${x.occurrenceDate}`))
  }, [completedOccurrences])

  function getNextOccurrenceOnOrAfter(item: ReminderUiItem, fromYmd: string) {
    const occurrences = expandReminderOccurrences([item], fromYmd, listRangeEnd, 160)
    if (!occurrences.length) return null
    return occurrences[0].occurrenceDate
  }

const sortedReminders = useMemo(() => {
  function timeSortValue(time?: string | null) {
    const t = normalizeReminderTime(time)
    if (!t) return '99:99'
    return t
  }

  if (selectedDayYmd) {
    const matchingIds = new Set(
      allListOccurrences
        .filter((x) => x.occurrenceDate === selectedDayYmd)
        .map((x) => x.sourceId)
    )

    return filteredReminders
      .filter((x) => matchingIds.has(x.id))
      .map((x) => ({
        ...x,
        displayDate: selectedDayYmd,
      }))
      .sort((a, b) => {
        if (a.displayDate < b.displayDate) return -1
        if (a.displayDate > b.displayDate) return 1

        const at = timeSortValue(a.time)
        const bt = timeSortValue(b.time)
        if (at < bt) return -1
        if (at > bt) return 1

        return a.title.localeCompare(b.title)
      })
  }

  return filteredReminders
    .map((x) => {
      const displayDate = getNextOccurrenceOnOrAfter(x, todayYmd)
      if (!displayDate) return null

      return {
        ...x,
        displayDate,
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a!.displayDate < b!.displayDate) return -1
      if (a!.displayDate > b!.displayDate) return 1

      const at = timeSortValue(a!.time)
      const bt = timeSortValue(b!.time)
      if (at < bt) return -1
      if (at > bt) return 1

      return a!.title.localeCompare(b!.title)
    }) as Array<ReminderUiItem & { displayDate: string }>
}, [filteredReminders, selectedDayYmd, allListOccurrences, todayYmd, listRangeEnd])


  function toggleSelectedDay(ymd: string) {
    setSelectedDayYmd((prev) => (prev === ymd ? null : ymd))
  }

  function selectReminderDate(ymd: string) {
    const dt = parseYmdToLocalDate(ymd)
    if (dt) {
      setViewYear(dt.getFullYear())
      setViewMonth(dt.getMonth())
    }
    setSelectedDayYmd(ymd)
  }

  function handleCalendarWheel(e: React.WheelEvent<HTMLDivElement>) {
    const now = Date.now()
    if (now < calendarWheelLockRef.current) return
    if (Math.abs(e.deltaY) < 18) return

    e.preventDefault()

    if (e.deltaY > 0) moveMonth(1)
    else moveMonth(-1)

    calendarWheelLockRef.current = now + 320
  }

  function handleCalendarTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    calendarTouchStartYRef.current = e.touches[0]?.clientY ?? null
  }

  function handleCalendarTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const startY = calendarTouchStartYRef.current
    const endY = e.changedTouches[0]?.clientY ?? null
    calendarTouchStartYRef.current = null

    if (startY == null || endY == null) return

    const diff = endY - startY
    if (Math.abs(diff) < 40) return

    if (diff < 0) moveMonth(1)
    else moveMonth(-1)
  }

  const addDate = selectedDayYmd || todayYmd
  const weekdayShort = language === 'no' ? ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

  return (
    <>
      <style jsx>{`
        @keyframes monthSlideUp {
          0% {
            opacity: 0;
            transform: translateY(14px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes monthSlideDown {
          0% {
            opacity: 0;
            transform: translateY(-14px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      <div className="h-full flex flex-col min-h-0">
        <div className="mt-4 max-[420px]:mt-3 flex-1 min-h-0 flex flex-col">
          <div className="shrink-0">
            <div className="flex items-center justify-between px-1">
              <div className="text-[color:var(--fg-90)] text-sm font-semibold capitalize">
                {monthLabel}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => moveMonth(-1)}
                  className="w-8 h-8 flex items-center justify-center text-[color:var(--fg-60)] text-xl"
                >
                  ‹
                </button>

                <button
                  onClick={() => moveMonth(1)}
                  className="w-8 h-8 flex items-center justify-center text-[color:var(--fg-60)] text-xl"
                >
                  ›
                </button>
              </div>
            </div>

            <div className="mt-3.5 max-[420px]:mt-3 grid grid-cols-7 text-center text-[11px] font-medium tracking-wide text-[color:var(--fg-55)]">
              {weekdayShort.map((x) => (
                <div key={x} className="h-[18px] max-[420px]:h-4 flex items-center justify-center">
                  {x}
                </div>
              ))}
            </div>

            <div
              className="mt-1 overflow-hidden"
              onWheel={handleCalendarWheel}
              onTouchStart={handleCalendarTouchStart}
              onTouchEnd={handleCalendarTouchEnd}
            >
              <div className={`grid grid-cols-7 gap-y-0.5 max-[420px]:gap-y-0 ${calendarAnimClass}`}>
                {calendarCells.map((cell) => {
                  const showFilledBlue = cell.isSelected || (!selectedDayYmd && cell.isToday)
                  const showBlueTextOnly = selectedDayYmd && cell.isToday && !cell.isSelected

                  return (
                    <button
                      key={cell.ymd}
                      onClick={() => toggleSelectedDay(cell.ymd)}
                      className="h-[38px] max-[420px]:h-9 flex items-center justify-center"
                    >
                      <div className="relative h-[34px] w-[34px] max-[420px]:h-8 max-[420px]:w-8 flex items-start justify-center">
                        <span
                          className={`mt-[1px] flex h-6.5 w-6.5 max-[420px]:h-6 max-[420px]:w-6 items-center justify-center rounded-full text-[13px] max-[420px]:text-xs transition ${
                            showFilledBlue
                              ? 'bg-[#2aa3ff] text-white'
                              : showBlueTextOnly
                                ? 'text-[#2aa3ff]'
                                : cell.inMonth
                                  ? 'text-[color:var(--fg-90)]'
                                  : 'text-[color:var(--fg-35)] opacity-30'
                          }`}
                        >
                          {cell.day}
                        </span>

                        {cell.dotCount > 0 && (
                          <div className="absolute bottom-[1px] max-[420px]:bottom-0 left-1/2 -translate-x-1/2 flex items-center justify-center gap-[3px]">
                            {Array.from({ length: Math.min(3, cell.dotCount) }).map((_, idx) => (
                              <span
                                key={idx}
                                className={`block w-[3.5px] h-[3.5px] max-[420px]:w-[3px] max-[420px]:h-[3px] rounded-full ${
                                  showFilledBlue ? 'bg-white/90' : 'bg-[#2aa3ff]'
                                }`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="mt-2 max-[420px]:mt-1.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-[color:var(--fg-90)] truncate">
                {selectedDayYmd ? formatReminderDateLabel(language, selectedDayYmd) : (language === 'no' ? 'Viser alle datoer' : 'Showing all dates')}
              </div>
            </div>

            <button
              onClick={() => setSelectedDayYmd(null)}
              disabled={!selectedDayYmd}
              className={`shrink-0 h-8 px-3 rounded-xl border border-[color:var(--bd-15)] tracking-widest text-[11px] ${
                selectedDayYmd ? 'text-[color:var(--fg-70)]' : 'invisible pointer-events-none'
              }`}
            >
              {language === 'no' ? 'TØM' : 'CLEAR'}
            </button>
          </div>

          <div className="mt-2 max-[420px]:mt-1.5 grid grid-cols-3 gap-1.5 max-[420px]:gap-1.5">
            {(['all', 'work', 'personal', 'sports', 'chores', 'event'] as ReminderTagFilter[]).map((opt) => {
              const active = tagFilter === opt
              return (
                <button
                  key={opt}
                  onClick={() => setTagFilter(opt)}
                  className={`h-8 max-[420px]:h-[30px] rounded-xl border text-[11px] tracking-widest transition ${
                    active
                      ? 'border-[#2aa3ff] text-[#2aa3ff]'
                      : 'border-[color:var(--bd-10)] text-[color:var(--fg-70)]'
                  }`}
                >
                  {reminderTagFilterLabel(language, opt)}
                </button>
              )
            })}
          </div>

          <div className="mt-2 max-[420px]:mt-1.5 relative rounded-3xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-3.5 max-[420px]:px-3 py-3.5 max-[420px]:py-3 flex-1 min-h-0">
            <div className="h-full overflow-y-auto no-scrollbar pr-1">
              {!activeDeviceId ? (
                <div className="text-sm text-[color:var(--fg-50)]">{language === 'no' ? 'Velg et frame først' : 'Select a frame first'}</div>
              ) : loading ? (
                <div className="text-sm text-[color:var(--fg-50)]">{language === 'no' ? 'Laster…' : 'Loading…'}</div>
              ) : sortedReminders.length === 0 ? (
                <div className="text-sm text-[color:var(--fg-50)]">
                  {selectedDayYmd
                    ? language === 'no'
                      ? 'Ingen påminnelser på denne datoen'
                      : 'No reminders on this date'
                    : language === 'no'
                      ? 'Ingen påminnelser ennå'
                      : 'No reminders yet'}
                </div>
              ) : (
                <div className="divide-y divide-[color:var(--bd-10)]">
                  {sortedReminders.map((item) => (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectReminderDate(item.displayDate)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          selectReminderDate(item.displayDate)
                        }
                      }}
                      className="flex items-start justify-between gap-2.5 py-1.5 first:pt-0 last:pb-0 cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[color:var(--fg-95)] text-sm leading-tight font-medium">
                        {formatReminderTitleWithTime(item)}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[color:var(--fg-35)] opacity-60">
                          {`${formatReminderFullDateLabel(language, item.displayDate)}${
                            normalizeReminderTime(item.time) ? ` • ${normalizeReminderTime(item.time)}` : ''
                          } • ${reminderRepeatLabel(language, item.repeat, item.customRepeatDays)}`}
                        </div>
                      </div>
                      <div className="shrink-0 self-center">
                        {completedOccurrenceKeySet.has(`${item.id}__${item.displayDate}`) ? (
                          <span className="inline-flex h-6.5 items-center px-2.5 rounded-lg border border-[#1f9d4a]/45 bg-[#1f9d4a]/10 text-[10px] tracking-widest text-[#1f9d4a]">
                            {language === 'no' ? 'FULLFØRT' : 'COMPLETED'}
                          </span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingReminder(item)
                              setSheetOpen(true)
                            }}
                            className="h-6.5 px-2.5 rounded-lg border border-[color:var(--bd-20)] text-[10px] tracking-widest text-[color:var(--fg-70)]"
                          >
                            {language === 'no' ? 'REDIGER' : 'EDIT'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="py-5 flex flex-col items-center relative z-20">
            <button
              onClick={() => {
                setEditingReminder({
                  id: '',
                  title: '',
                  date: addDate,
                  time: null,
                  tag: null,
                  repeat: 'none',
                  customRepeatDays: null,
                } as any)
                setSheetOpen(true)
              }}
              disabled={!activeDeviceId}
              className={`w-[260px] h-[56px] rounded-2xl border tracking-widest transition bg-[color:var(--app-bg)] ${
                !activeDeviceId
                  ? 'border-[color:var(--bd-30)] text-[color:var(--fg-50)]'
                  : 'border-[#2aa3ff] text-[#2aa3ff]'
              }`}
              style={{ backgroundColor: 'var(--app-bg)' }}
            >
              {language === 'no' ? 'LEGG TIL PÅMINNELSE' : 'ADD REMINDER'}
            </button>
          </div>
        </div>
      </div>

    {sheetOpen && activeDeviceId && (
        <ReminderDraftSheet
          language={language}
          activeDeviceId={activeDeviceId}
          editingReminder={editingReminder && editingReminder.id ? editingReminder : null}
          initialDate={editingReminder?.date || addDate}
          onClose={() => {
            setSheetOpen(false)
            setEditingReminder(null)
          }}
          onSaved={async () => {
            setSheetOpen(false)
            setEditingReminder(null)
            await loadReminders()
          }}
          onDeleted={async () => {
            setSheetOpen(false)
            setEditingReminder(null)
            await loadReminders()
          }}
          onCompleted={({ reminderId, occurrenceDate, repeat }) => {
            if (repeat === 'none') {
              setReminders((prev) => prev.filter((x) => x.id !== reminderId))
              return
            }
            setCompletedOccurrences((prev) => {
              if (prev.some((x) => x.reminderId === reminderId && x.occurrenceDate === occurrenceDate)) return prev
              return [...prev, { reminderId, occurrenceDate }]
            })
          }}
        />
      )}
    </>
  )
}

function ReminderDraftSheet({
  language,
  activeDeviceId,
  editingReminder,
  initialDate,
  onClose,
  onSaved,
  onDeleted,
  onCompleted,
}: {
  language: AppLanguage
  activeDeviceId: string
  editingReminder: ReminderUiItem | null
  initialDate: string
  onClose: () => void
  onSaved: () => void | Promise<void>
  onDeleted: () => void | Promise<void>
  onCompleted?: (completion: { reminderId: string; occurrenceDate: string; repeat: ReminderRepeatKey }) => void
}) {
const [title, setTitle] = useState(editingReminder?.title ?? '')
const [date, setDate] = useState(editingReminder?.date ?? initialDate ?? toLocalYmd(new Date()))
const [time, setTime] = useState<string>(normalizeReminderTime(editingReminder?.time) ?? '')
const [tag, setTag] = useState<ReminderTag | null>(isReminderTag(editingReminder?.tag) ? editingReminder?.tag : null)
const [repeat, setRepeat] = useState<ReminderRepeatKey>(editingReminder?.repeat ?? 'none')
const [customRepeatDays, setCustomRepeatDays] = useState<number | ''>(
  Number.isFinite(Number(editingReminder?.customRepeatDays)) && Number(editingReminder?.customRepeatDays) > 0
    ? Number(editingReminder?.customRepeatDays)
    : ''
)

const [saving, setSaving] = useState(false)
const [deleting, setDeleting] = useState(false)
const [status, setStatus] = useState<string | null>(null)
const [statusKind, setStatusKind] = useState<'ok' | 'error' | 'info'>('info')

const [datePickerOpen, setDatePickerOpen] = useState(false)
const [timePickerOpen, setTimePickerOpen] = useState(false)
const [tagPickerOpen, setTagPickerOpen] = useState(false)
const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false)
const [completing, setCompleting] = useState(false)

const normalizedCustomRepeatDays =
  Number.isFinite(Number(customRepeatDays)) && Number(customRepeatDays) > 0
    ? Number(customRepeatDays)
    : null

const normalizedTime = normalizeReminderTime(time)

  useEffect(() => {
  setTitle(editingReminder?.title ?? '')
  setDate(editingReminder?.date ?? initialDate ?? toLocalYmd(new Date()))
  setTime(normalizeReminderTime(editingReminder?.time) ?? '')
  setTag(isReminderTag(editingReminder?.tag) ? editingReminder?.tag : null)
  setRepeat(editingReminder?.repeat ?? 'none')
  setCustomRepeatDays(
    Number.isFinite(Number(editingReminder?.customRepeatDays)) && Number(editingReminder?.customRepeatDays) > 0
      ? Number(editingReminder?.customRepeatDays)
      : ''
  )
  setStatus(null)
}, [editingReminder, initialDate])

  const canSave =
    title.trim().length > 0 &&
    date.trim().length > 0 &&
    !saving &&
    !deleting &&
    (repeat !== 'custom' || !!normalizedCustomRepeatDays)

  async function saveReminder() {
    const cleanTitle = title.trim()
    const cleanDate = date.trim()

    if (!cleanTitle) {
      setStatusKind('error')
      setStatus(language === 'no' ? 'Skriv inn en tittel' : 'Enter a title')
      return
    }

    if (!cleanDate) {
      setStatusKind('error')
      setStatus(language === 'no' ? 'Velg en dato' : 'Choose a date')
      return
    }

    if (repeat === 'custom' && !normalizedCustomRepeatDays) {
      setStatusKind('error')
      setStatus(language === 'no' ? 'Skriv inn antall dager' : 'Enter custom repeat days')
      return
    }

    try {
      setSaving(true)
      setStatus(null)

      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user?.id

      if (!userId) throw new Error(language === 'no' ? 'Du må være logget inn' : 'You must be logged in')

      if (editingReminder) {
        const { error } = await supabase
  .from('reminders')
  .update({
    title: cleanTitle,
    due_date: cleanDate,
    due_time: normalizedTime,
    tag,
    repeat_type: repeat,
    custom_repeat_days: repeat === 'custom' ? normalizedCustomRepeatDays : null,
    updated_by_user_id: userId,
    updated_at: new Date().toISOString(),
  })
  .eq('id', editingReminder.id)
  .eq('device_id', activeDeviceId)

        if (error) throw error
      } else {
        const { error } = await supabase
  .from('reminders')
  .insert({
    device_id: activeDeviceId,
    created_by_user_id: userId,
    updated_by_user_id: userId,
    title: cleanTitle,
    due_date: cleanDate,
    due_time: normalizedTime,
    tag,
    repeat_type: repeat,
    custom_repeat_days: repeat === 'custom' ? normalizedCustomRepeatDays : null,
    is_done: false,
  })
        if (error) throw error
      }

      setStatusKind('ok')
      setStatus(editingReminder ? (language === 'no' ? 'Påminnelse oppdatert' : 'Reminder updated') : (language === 'no' ? 'Påminnelse lagret' : 'Reminder saved'))
      await onSaved()
    } catch (e: any) {
      setStatusKind('error')
      setStatus(String(e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  async function deleteReminder() {
    if (!editingReminder) return

    try {
      setDeleting(true)
      setStatus(null)

      const { error } = await supabase
        .from('reminders')
        .delete()
        .eq('id', editingReminder.id)
        .eq('device_id', activeDeviceId)

      if (error) throw error

      await onDeleted()
    } catch (e: any) {
      setStatusKind('error')
      setStatus(String(e?.message || e))
    } finally {
      setDeleting(false)
      setConfirmDeleteOpen(false)
    }
  }

async function completeReminderFromEditor() {
    if (!editingReminder) return
    const selectedOccurrenceDate =
      String((editingReminder as ReminderUiItem & { displayDate?: string }).displayDate ?? '').trim() || date
    try {
      setCompleting(true)
      setStatus(null)
      if (editingReminder.repeat === 'none') {
        const { error } = await supabase
          .from('reminders')
          .update({ is_done: true })
          .eq('id', editingReminder.id)
          .eq('device_id', activeDeviceId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('reminder_completions')
          .upsert(
            { device_id: activeDeviceId, reminder_id: editingReminder.id, occurrence_date: selectedOccurrenceDate },
            { onConflict: 'reminder_id,occurrence_date', ignoreDuplicates: true }
          )
        if (error) throw error
      }
      onCompleted?.({ reminderId: editingReminder.id, occurrenceDate: selectedOccurrenceDate, repeat: editingReminder.repeat })
      setConfirmCompleteOpen(false)
      onClose()
      void onSaved()
    } catch (e: any) {
      setConfirmCompleteOpen(false)
      setStatusKind('error')
      setStatus(String(e?.message || e))
    } finally {
      setCompleting(false)
    }
  }

    const scrollRef = useRef<HTMLDivElement | null>(null)
  
  return (
    <>
<div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--overlay-55)]">
  <style jsx>{`
    .reminder-sheet-scroll {
      -ms-overflow-style: none;
      scrollbar-width: none;
    }
    .reminder-sheet-scroll::-webkit-scrollbar {
      display: none;
    }
  `}</style>

  <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] flex flex-col max-h-[88vh]">
    <div
      ref={scrollRef}
      className="reminder-sheet-scroll flex-1 min-h-0 overflow-y-auto px-5 pt-5 pb-4"
    >
          <div className="flex items-center justify-between">
            <div className="tracking-widest text-sm text-[color:var(--fg-70)]">
              {editingReminder ? (language === 'no' ? 'REDIGER PÅMINNELSE' : 'EDIT REMINDER') : (language === 'no' ? 'LEGG TIL PÅMINNELSE' : 'ADD REMINDER')}
            </div>

            <button onClick={onClose} disabled={saving || deleting || completing} className="text-[color:var(--fg-60)] text-xl">
              ✕
            </button>
          </div>

          <div className="mt-5">
            <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{language === 'no' ? 'TITTEL' : 'TITLE'}</div>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setStatus(null)
              }}
              placeholder={language === 'no' ? 'Tittel på påminnelse' : 'Reminder title'}
              className="mt-2 w-full h-12 rounded-2xl bg-[color:var(--panel-05)] border border-[color:var(--bd-10)] px-4 text-[color:var(--fg-90)] outline-none"
            />
          </div>

          <div className="mt-4">
            <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{language === 'no' ? 'DATO' : 'DATE'}</div>
            <button
              type="button"
              onClick={() => setDatePickerOpen(true)}
              className="mt-2 flex w-full h-12 items-center rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-4 text-left text-[color:var(--fg-90)]"
            >
              {date}
            </button>
          </div>

          <div className="mt-4">
  <div className="tracking-widest text-xs text-[color:var(--fg-50)]">
    {language === 'no' ? 'TID (VALGFRITT)' : 'TIME (OPTIONAL)'}
  </div>

  <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
    <button
      type="button"
      onClick={() => setTimePickerOpen(true)}
      className="flex w-full h-12 items-center rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-4 text-left text-[color:var(--fg-90)]"
    >
      {normalizedTime || (language === 'no' ? 'Ingen tid valgt' : 'No time selected')}
    </button>

    <button
      type="button"
      onClick={() => {
        setTime('')
        setStatus(null)
      }}
      className={`h-12 px-4 rounded-2xl border tracking-widest text-xs ${
        normalizedTime
          ? 'border-[color:var(--bd-15)] text-[color:var(--fg-70)]'
          : 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]'
      }`}
    >
      {language === 'no' ? 'FJERN' : 'CLEAR'}
    </button>
  </div>
</div>

          <div className="mt-4">
            <div className="tracking-widest text-xs text-[color:var(--fg-50)]">TAG</div>
            <button
              type="button"
              onClick={() => setTagPickerOpen(true)}
              className="mt-2 flex w-full h-12 items-center rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-4 text-left text-[color:var(--fg-90)]"
            >
              {reminderTagOptionLabel(language, tag)}
            </button>
          </div>

          <div className="mt-4">
            <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{language === 'no' ? 'GJENTAS' : 'REPEATS'}</div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              {REMINDER_REPEAT_OPTIONS.map((opt) => {
                const active = repeat === opt.key

                return (
                  <button
                    key={opt.key}
                    onClick={() => {
                      setRepeat(opt.key)
                      if (opt.key !== 'custom') setCustomRepeatDays('')
                      setStatus(null)
                    }}
                    className={`h-11 rounded-2xl border text-sm transition ${
                      active
                        ? 'border-[#2aa3ff] text-[#2aa3ff]'
                        : 'border-[color:var(--bd-10)] text-[color:var(--fg-80)]'
                    }`}
                  >
                    {reminderRepeatOptionLabel(language, opt.key)}
                  </button>
                )
              })}
            </div>
          </div>

          {repeat === 'custom' && (
            <div className="mt-4">
              <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{language === 'no' ? 'EGENDEFINERTE DAGER' : 'CUSTOM DAYS'}</div>
              <input
                type="number"
                min={1}
                step={1}
                value={customRepeatDays}
                onChange={(e) => {
                  const raw = e.target.value
                  setCustomRepeatDays(raw === '' ? '' : Math.max(1, Number(raw)))
                  setStatus(null)
                }}
                placeholder={language === 'no' ? 'Antall dager' : 'Number of days'}
                className="mt-2 w-full h-12 rounded-2xl bg-[color:var(--panel-05)] border border-[color:var(--bd-10)] px-4 text-[color:var(--fg-90)] outline-none"
              />
            </div>
          )}

          <div className="mt-5 min-h-[18px] text-xs">
            {status ? (
              <span
                className={
                  statusKind === 'error'
                    ? 'text-[color:var(--danger)]'
                    : statusKind === 'ok'
                      ? 'text-[#2aa3ff]'
                      : 'text-[color:var(--fg-50)]'
                }
              >
                {status}
              </span>
            ) : (
              <span> </span>
            )}
          </div>
               </div>

                           <div className="px-5 pt-4 pb-6 border-t border-[color:var(--bd-10)] bg-[color:var(--sheet-bg)]">
                <div className="grid grid-cols-1 gap-3">
            <button
              onClick={saveReminder}
              disabled={!canSave}
              className={`h-12 rounded-2xl border tracking-widest text-sm ${
                canSave
                  ? 'border-[#2aa3ff] text-[#2aa3ff]'
                  : 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]'
              }`}
            >
              {saving ? (language === 'no' ? 'LAGRER…' : 'SAVING…') : editingReminder ? (language === 'no' ? 'LAGRE ENDRINGER' : 'SAVE CHANGES') : (language === 'no' ? 'LAGRE PÅMINNELSE' : 'SAVE REMINDER')}
            </button>

            {editingReminder && (
              <button
                onClick={() => setConfirmCompleteOpen(true)}
                disabled={saving || deleting || completing}
                className={`h-12 rounded-2xl border tracking-widest text-sm ${
                  saving || deleting || completing
                    ? 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]'
                    : 'border-[#2ea75d] text-[#2ea75d]'
                }`}
              >
                {language === 'no' ? 'FULLFØR' : 'COMPLETE'}
              </button>
            )}
            {editingReminder && (
              <button
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={saving || deleting || completing}
                className={`h-12 rounded-2xl border tracking-widest text-sm ${
                  saving || deleting
                    ? 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]'
                    : 'border-[color:var(--danger-bd)] text-[color:var(--danger)]'
                }`}
              >
                {language === 'no' ? 'SLETT' : 'DELETE'}
              </button>
            )}

            <button
              onClick={onClose}
              disabled={saving || deleting || completing}
              className="h-12 rounded-2xl border border-[color:var(--bd-15)] text-[color:var(--fg-60)] tracking-widest text-sm"
            >
              {language === 'no' ? 'LUKK' : 'CLOSE'}
            </button>
          </div>
      </div>
    </div>
  </div>

      {datePickerOpen && (
        <DatePickerSheet
          language={language}
          value={parseYmdToLocalDate(date) || new Date()}
          onClose={() => setDatePickerOpen(false)}
          onApply={(d) => {
            setDate(toLocalYmd(d))
            setStatus(null)
            setDatePickerOpen(false)
          }}
        />
      )}

      {timePickerOpen && (
  <TimePickerSheet
    language={language}
    value={(() => {
      const base = parseYmdToLocalDate(date) || new Date()
      const t = normalizedTime || '12:00'
      const [hh, mm] = t.split(':').map(Number)
      base.setHours(Number.isFinite(hh) ? hh : 12, Number.isFinite(mm) ? mm : 0, 0, 0)
      return base
    })()}
    onClose={() => setTimePickerOpen(false)}
    onApply={(d) => {
      const rounded = roundToNearest5Min(d)
      setTime(`${pad2(rounded.getHours())}:${pad2(rounded.getMinutes())}`)
      setStatus(null)
      setTimePickerOpen(false)
    }}
  />
)}

      {tagPickerOpen && (
        <ReminderTagPickerSheet
          language={language}
          current={tag}
          onClose={() => setTagPickerOpen(false)}
          onPick={(next) => {
            setTag(next)
            setStatus(null)
            setTagPickerOpen(false)
          }}
        />
      )}

      {confirmDeleteOpen && (
        <DeleteReminderSheet
          language={language}
          deleting={deleting}
          onCancel={() => setConfirmDeleteOpen(false)}
          onConfirm={deleteReminder}
        />
      )}
      {confirmCompleteOpen && editingReminder && (
        <CompleteReminderSheet
          language={language}
          repeating={editingReminder.repeat !== 'none'}
          completing={completing}
          onCancel={() => setConfirmCompleteOpen(false)}
          onConfirm={completeReminderFromEditor}
        />
      )}
    </>
  )
}

function DeleteReminderSheet({
  language,
  deleting,
  onCancel,
  onConfirm,
}: {
  language: AppLanguage
  deleting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[color:var(--overlay-55)]">
      <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] px-5 pt-5 pb-8">
        <div className="flex items-center justify-between">
          <div className="tracking-widest text-sm text-[color:var(--fg-70)]">{language === 'no' ? 'SLETT PÅMINNELSE' : 'DELETE REMINDER'}</div>
          <button onClick={onCancel} disabled={deleting} className="text-[color:var(--fg-60)] text-xl">
            ✕
          </button>
        </div>

        <div className="mt-4 text-[color:var(--fg-90)] text-base font-medium">
          {language === 'no' ? 'Er du sikker på at du vil slette denne påminnelsen?' : 'Are you sure you want to delete this reminder?'}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3">
          <button
            onClick={onConfirm}
            disabled={deleting}
            className={`h-12 rounded-2xl border tracking-widest text-sm ${
              deleting
                ? 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]'
                : 'border-[color:var(--danger-bd)] text-[color:var(--danger)]'
            }`}
          >
            {deleting ? (language === 'no' ? 'SLETTER…' : 'DELETING…') : (language === 'no' ? 'SLETT' : 'DELETE')}
          </button>

          <button
            onClick={onCancel}
            disabled={deleting}
            className="h-12 rounded-2xl border border-[color:var(--bd-15)] text-[color:var(--fg-60)] tracking-widest text-sm"
          >
            {language === 'no' ? 'AVBRYT' : 'CANCEL'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CompleteReminderSheet({
  language,
  repeating,
  completing,
  onCancel,
  onConfirm,
}: {
  language: AppLanguage
  repeating: boolean
  completing: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[color:var(--overlay-55)]">
      <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] px-5 pt-5 pb-8">
        <div className="mt-2 text-[color:var(--fg-90)] text-base font-medium">
          {repeating
            ? language === 'no'
              ? 'Fullføre bare denne forekomsten?'
              : 'Complete this occurrence only?'
            : language === 'no'
              ? 'Fullføre denne påminnelsen?'
              : 'Complete this reminder?'}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-3">
          <button
            onClick={onCancel}
            disabled={completing}
            className="h-12 rounded-2xl border border-[color:var(--bd-15)] text-[color:var(--fg-60)] tracking-widest text-sm"
          >
            {language === 'no' ? 'AVBRYT' : 'CANCEL'}
          </button>
          <button
            onClick={onConfirm}
            disabled={completing}
            className={`h-12 rounded-2xl border tracking-widest text-sm ${
              completing ? 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]' : 'border-[#2ea75d] text-[#2ea75d]'
            }`}
          >
            {completing ? (language === 'no' ? 'FULLFØRER…' : 'COMPLETING…') : language === 'no' ? 'FULLFØR' : 'COMPLETE'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReminderTagPickerSheet({
  language,
  current,
  onClose,
  onPick,
}: {
  language: AppLanguage
  current: ReminderTag | null
  onClose: () => void
  onPick: (tag: ReminderTag | null) => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[color:var(--overlay-55)]">
      <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] px-5 pt-5 pb-8">
        <div className="flex items-center justify-between">
          <div className="tracking-widest text-sm text-[color:var(--fg-70)]">TAG</div>
          <button onClick={onClose} className="text-[color:var(--fg-60)] text-xl">
            ✕
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {REMINDER_TAG_OPTIONS.map((opt) => {
            const active = current === opt.key

            return (
              <button
                key={opt.key ?? 'none'}
                onClick={() => onPick(opt.key)}
                className={`h-12 rounded-2xl border tracking-widest ${
                  active ? 'border-[#2aa3ff] text-[#2aa3ff]' : 'border-[color:var(--bd-15)] text-[color:var(--fg-80)]'
                }`}
              >
                {language === 'no' ? opt.labelNo : opt.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SurfModuleSettingsTab({
  language,
  layoutKey,
  cells,
  modulesJson,
  setModulesJson,
  markDirty,
}: {
  language: AppLanguage
  layoutKey: LayoutKey
  cells: Record<number, ModuleKey | null>
  modulesJson: Record<string, any>
  setModulesJson: React.Dispatch<React.SetStateAction<Record<string, any>>>
  markDirty: () => void
}) {
  const [surfView, setSurfView] = useState<'main' | 'log'>('main')
  const [, setSurfViewTitle] = useState('SURF')
  const [editingExperienceId, setEditingExperienceId] = useState<string | null>(null)
  const [experienceListVersion, setExperienceListVersion] = useState(0)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)

  const surfSlots = Object.entries(cells)
    .filter(([, m]) => m === 'surf')
    .map(([slot]) => Number(slot))
    .sort((a, b) => a - b)

  const surfInstances = (surfSlots.length ? surfSlots : [0]).map((slot, idx) => ({
    slot,
    id: idx + 1,
  }))

  const single = surfInstances.length === 1
  const surfList: SurfCfg[] = Array.isArray(modulesJson.surf) ? (modulesJson.surf as SurfCfg[]) : []

  function updateFadeState() {
    const el = scrollRef.current
    if (!el) {
      setShowTopFade(false)
      setShowBottomFade(false)
      return
    }

    const hasOverflow = el.scrollHeight > el.clientHeight + 1
    if (!hasOverflow) {
      setShowTopFade(false)
      setShowBottomFade(false)
      return
    }

    setShowTopFade(el.scrollTop > 2)
    setShowBottomFade(el.scrollTop + el.clientHeight < el.scrollHeight - 2)
  }

  function scrollToBottomSmooth() {
    if (!scrollRef.current) return
    const scroller = scrollRef.current

    const target = scroller.scrollHeight - scroller.clientHeight
    const start = scroller.scrollTop
    const distance = target - start
    const duration = 360
    const startTime = performance.now()

    function step(now: number) {
      const t = Math.min(1, (now - startTime) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      scroller.scrollTop = start + distance * eased
      updateFadeState()
      if (t < 1) requestAnimationFrame(step)
    }

    requestAnimationFrame(step)
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    updateFadeState()

    const onScroll = () => updateFadeState()
    el.addEventListener('scroll', onScroll, { passive: true })

    const ro = new ResizeObserver(() => updateFadeState())
    ro.observe(el)

    const t1 = window.setTimeout(updateFadeState, 50)
    const t2 = window.setTimeout(updateFadeState, 180)

    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [surfView, experienceListVersion, surfList.length])

  function commitSurfList(nextList: SurfCfg[]) {
    const fixed: SurfCfg[] = nextList
      .filter((x) => x && typeof x === 'object')
      .map((x: any) => {
        const id = Number(x.id)
        const spot = String(x.spot || '').trim().slice(0, 80)
        let spotId = String(x.spotId || '').trim().slice(0, 80)

        if (!spotId && spot) {
          const found = findSpotByLabel(spot)
          if (found?.spotId) spotId = found.spotId
        }

        const fuelPenalty = sanitizeFuelPenalty(x.fuelPenalty)
        const lat = Number.isFinite(Number(x.lat)) ? Number(x.lat) : undefined
        const lon = Number.isFinite(Number(x.lon)) ? Number(x.lon) : undefined

        const out: SurfCfg = { id, spot, spotId }
        if (lat != null) out.lat = lat
        if (lon != null) out.lon = lon
        if (fuelPenalty) out.fuelPenalty = fuelPenalty

        return out
      })
      .filter((x) => Number.isFinite(x.id) && x.id >= 1 && x.id <= 255)

    setModulesJson((prev) => normalizeModulesForSave({ ...prev, surf: fixed }))
    markDirty()
  }

  function upsertSurf(id: number, patch: Partial<SurfCfg>) {
    const next: SurfCfg[] = Array.isArray(modulesJson.surf) ? ([...modulesJson.surf] as SurfCfg[]) : []
    const idx = next.findIndex((x) => Number(x?.id) === id)

    const merged: SurfCfg = {
      ...(idx >= 0 ? (next[idx] as SurfCfg) : ({ id } as SurfCfg)),
      ...patch,
      id,
    }

    if (idx >= 0) next[idx] = merged
    else next.push(merged)

    commitSurfList(next)
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="relative mt-5 flex-1 min-h-0">
        {surfView === 'main' && showTopFade && (
          <div className="pointer-events-none absolute top-0 left-0 right-0 z-10 h-6 bg-gradient-to-b from-[color:var(--app-bg)] to-transparent" />
        )}

        <div
          ref={scrollRef}
          className={`h-full pr-1 no-scrollbar ${
            surfView === 'main' ? 'overflow-y-auto pb-[90px]' : 'overflow-y-auto'
          }`}
        >
          {surfView === 'main' ? (
            <div className="space-y-3">
              {surfInstances.map(({ slot, id }) => {
                const cfg = surfList.find((x) => Number(x?.id) === id) || null
                const spot = cfg?.spot ? String(cfg.spot) : 'Not set'
                const fuel = (cfg?.fuelPenalty && typeof cfg.fuelPenalty === 'object' ? cfg.fuelPenalty : undefined) as
                  | FuelPenaltyCfg
                  | undefined

                const title = single ? (language === 'no' ? 'Spot' : 'Spot') : `${language === 'no' ? 'Spot' : 'Spot'} — ${slotLabel(language, layoutKey, slot)}`

                return (
                  <SurfSpotRow
                    language={language}
                    key={`${slot}-${id}`}
                    id={id}
                    title={title}
                    spotLabel={spot}
                    spotId={cfg?.spotId ? String(cfg.spotId) : ''}
                    fuelPenalty={fuel}
                    onPicked={(picked) => upsertSurf(id, picked)}
                  />
                )
              })}

              <SurfExperienceCard
                language={language}
                refreshKey={experienceListVersion}
                onOpenLog={() => {
                  setEditingExperienceId(null)
                  setSurfView('log')
                  setSurfViewTitle('LOG EXPERIENCE')
                  requestAnimationFrame(() => {
                    if (scrollRef.current) scrollRef.current.scrollTop = 0
                  })
                }}
                onEditExperience={(experienceId) => {
                  setEditingExperienceId(experienceId)
                  setSurfView('log')
                  setSurfViewTitle('EDIT EXPERIENCE')
                  requestAnimationFrame(() => {
                    if (scrollRef.current) scrollRef.current.scrollTop = 0
                  })
                }}
                onExpandedLatest={() => {
                  window.setTimeout(() => {
                    scrollToBottomSmooth()
                  }, 80)
                }}
              />
            </div>
          ) : (
            <SurfExperienceEditor
              language={language}
              experienceId={editingExperienceId}
              onCancel={() => {
                setEditingExperienceId(null)
                setSurfView('main')
                setSurfViewTitle('SURF')
                requestAnimationFrame(() => {
                  if (scrollRef.current) scrollRef.current.scrollTop = 0
                })
              }}
              onSaved={() => {
                setEditingExperienceId(null)
                setSurfView('main')
                setSurfViewTitle('SURF')
                setExperienceListVersion((v) => v + 1)
                requestAnimationFrame(() => {
                  if (scrollRef.current) scrollRef.current.scrollTop = 0
                })
              }}
              onDeleted={() => {
                setEditingExperienceId(null)
                setSurfView('main')
                setSurfViewTitle('SURF')
                setExperienceListVersion((v) => v + 1)
                requestAnimationFrame(() => {
                  if (scrollRef.current) scrollRef.current.scrollTop = 0
                })
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function WeatherModuleSettingsTab({
  language,
  layoutKey,
  cells,
  modulesJson,
  setModulesJson,
  markDirty,
}: {
  language: AppLanguage
  layoutKey: LayoutKey
  cells: Record<number, ModuleKey | null>
  modulesJson: Record<string, any>
  setModulesJson: React.Dispatch<React.SetStateAction<Record<string, any>>>
  markDirty: () => void
}) {
  const weatherSlots = Object.entries(cells)
    .filter(([, m]) => m === 'weather')
    .map(([slot]) => Number(slot))
    .sort((a, b) => a - b)

  const weatherInstances = (weatherSlots.length ? weatherSlots : [0]).map((slot, idx) => ({
    slot,
    id: idx + 1,
  }))

  const single = weatherInstances.length === 1
  const weatherList: any[] = Array.isArray(modulesJson.weather) ? modulesJson.weather : []

  function commitWeatherList(nextList: any[]) {
    const fixed = nextList
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({
        id: Number(x.id),
        label: String(x.label || '').slice(0, 40),
        lat: Number(x.lat),
        lon: Number(x.lon),
        units: 'metric',
        refresh: 1800000,
        hiLo: true,
        cond: true,
      }))
      .filter((x) => Number.isFinite(x.id) && x.id >= 1 && x.id <= 255 && Number.isFinite(x.lat) && Number.isFinite(x.lon))

    setModulesJson((prev) => ({ ...prev, weather: fixed }))
    markDirty()
  }

  function upsertLocation(id: number, patch: any) {
    const next = Array.isArray(modulesJson.weather) ? [...modulesJson.weather] : []

    const idx = next.findIndex((x) => Number(x?.id) === id)

    const merged = {
      ...(idx >= 0 ? next[idx] : { id }),
      ...patch,
      id,
      units: 'metric',
      refresh: 1800000,
      hiLo: true,
      cond: true,
    }

    if (idx >= 0) next[idx] = merged
    else next.push(merged)

    commitWeatherList(next)
  }

  return (
    <div className="h-full flex flex-col">
      <div className="mt-5 space-y-3 overflow-auto pr-1">
        {weatherInstances.map(({ slot, id }) => {
          const cfg = weatherList.find((x) => Number(x?.id) === id) || null
          const label = cfg?.label ? String(cfg.label) : 'Not set'

          const title = single ? (language === 'no' ? 'Sted' : 'Location') : `${language === 'no' ? 'Sted' : 'Location'} — ${slotLabel(language, layoutKey, slot)}`

          return (
            <WeatherLocationRow
              language={language}
              key={`${slot}-${id}`}
              id={id}
              title={title}
              label={label}
              onPicked={(picked) => upsertLocation(id, picked)}
            />
          )
        })}
      </div>
      <div className="flex-1" />
    </div>
  )
}

function SurfSpotRow({
  language,
  id,
  title,
  spotLabel,
  spotId,
  fuelPenalty,
  onPicked,
}: {
  language: AppLanguage
  id: number
  title: string
  spotLabel: string
  spotId: string
  fuelPenalty?: FuelPenaltyCfg
  onPicked: (cfgPatch: Partial<SurfCfg>) => void
}) {
  const [open, setOpen] = useState(false)

  const isBest = isTodaysBestLabel(spotLabel)

  const enabled = !!fuelPenalty?.enabled
  const savedAddr = String(fuelPenalty?.homeAddress ?? '').trim()
  const savedFmt = String(fuelPenalty?.formatted ?? '').trim()
  const savedLat = Number(fuelPenalty?.homeLat)
  const savedLon = Number(fuelPenalty?.homeLon)

  const hasCoords = Number.isFinite(savedLat) && Number.isFinite(savedLon)
  const homeLabel = (savedFmt || savedAddr || '').trim()

  const [homeInput, setHomeInput] = useState('')
  const [homeDirty, setHomeDirty] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoOk, setGeoOk] = useState<string | null>(null)

  useEffect(() => {
    setHomeInput('')
    setHomeDirty(false)
    setGeoError(null)
    setGeoOk(null)
  }, [spotLabel, savedAddr, savedFmt, fuelPenalty?.homeLat, fuelPenalty?.homeLon])

  function setFuelEnabled(next: boolean) {
    const curr = sanitizeFuelPenalty(fuelPenalty || { enabled: false }) || { enabled: false }
    onPicked({ fuelPenalty: { ...curr, enabled: next } })

    if (!next) {
      setHomeInput('')
      setHomeDirty(false)
      setGeoError(null)
      setGeoOk(null)
    }
  }

  async function setHome() {
    const text = homeInput.trim()
    if (!text) return

    try {
      setGeoLoading(true)
      setGeoError(null)
      setGeoOk(null)

      const resp = await fetch(`/api/geo/geocode?text=${encodeURIComponent(text)}`, { cache: 'no-store' })
      if (!resp.ok) throw new Error(`Geocode failed (${resp.status})`)

      const data: any = await resp.json()
      const lat = Number(data?.lat)
      const lon = Number(data?.lon)
      const formatted = String(data?.formatted ?? '').trim()

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error(language === 'no' ? 'Ingen koordinater returnert' : 'No coordinates returned')

      const curr = sanitizeFuelPenalty(fuelPenalty || { enabled: true }) || { enabled: true }

      onPicked({
        fuelPenalty: {
          ...curr,
          enabled: true,
          homeAddress: text,
          formatted: formatted || text,
          homeLat: lat,
          homeLon: lon,
        },
      })

      setHomeInput('')
      setHomeDirty(false)

      setGeoOk(formatted || (language === 'no' ? 'Lagret' : 'Saved'))
      setGeoError(null)
    } catch (e: any) {
      setGeoOk(null)
      setGeoError(String(e?.message || e))
    } finally {
      setGeoLoading(false)
    }
  }

  const canSet = enabled && homeDirty && !!homeInput.trim() && !geoLoading

  return (
    <>
      <div className="rounded-3xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{title.toUpperCase()}</div>
<div className="mt-1 text-[color:var(--fg-90)] text-xl font-semibold leading-tight truncate">
  {spotLabel === 'Not set'
    ? (language === 'no' ? 'Velg spot' : 'Choose spot')
    : isBest && language === 'no'
      ? 'Dagens Beste'
      : spotLabel}
</div>
          </div>

          <button
            onClick={() => setOpen(true)}
            className="shrink-0 h-10 px-4 rounded-2xl border border-[color:var(--bd-15)] text-[color:var(--fg-70)] tracking-widest text-xs hover:bg-[color:var(--panel-05)]"
          >
            {language === 'no' ? 'ENDRE' : 'CHANGE'}
          </button>
        </div>

        {isBest && (
          <div className="mt-4 w-full">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
<div className="tracking-widest text-xs text-[color:var(--fg-50)]">{language === 'no' ? 'DIESELKNEKKEN' : 'FUEL PENALTY'}</div>
<div className="mt-1 text-[color:var(--fg-80)] text-sm">{language === 'no' ? 'Gjør spots langt unna mindre attraktive' : 'Makes far spots less attractive'}</div>
              </div>

              <Switch checked={enabled} onChange={setFuelEnabled} />
            </div>

            {enabled && (
              <div className="mt-4">
                <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{language === 'no' ? 'HJEMMEADRESSE' : 'HOME ADDRESS'}</div>

                <div className="mt-2 flex gap-2">
                  <input
                    value={homeInput}
                    onChange={(e) => {
                      setHomeInput(e.target.value)
                      setHomeDirty(true)
                      setGeoError(null)
                      setGeoOk(null)
                    }}
                    placeholder={homeLabel ? homeLabel : language === 'no' ? 'Skriv hjemmeadresse' : 'Type home address'}
                    className="flex-1 h-11 rounded-2xl bg-[color:var(--panel-05)] border border-[color:var(--bd-10)] px-4 text-[color:var(--fg-90)] outline-none placeholder:text-[color:var(--fg-50)]"
                  />

                  <button
                    onClick={setHome}
                    disabled={!canSet}
                    className={`h-11 px-4 rounded-2xl border tracking-widest text-xs transition ${
                      !canSet ? 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]' : 'border-[#2aa3ff] text-[#2aa3ff]'
                    }`}
                  >
                    {geoLoading ? '…' : language === 'no' ? 'SETT' : 'SET'}
                  </button>
                </div>

                <div className="mt-2 text-xs text-[color:var(--fg-50)]">
                  {geoError ? (
                    <span className="text-[color:var(--danger)]">{geoError}</span>
                  ) : hasCoords && homeLabel ? (
                    <span className="text-[#2aa3ff]">{homeLabel}</span>
                  ) : geoOk ? (
                    <span className="text-[#2aa3ff]">{geoOk}</span>
                  ) : (
                    <span> </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {open && (
        <SurfSpotSheet
          language={language}
          title={title}
          hideTodaysBest={false}
          onClose={() => setOpen(false)}
          onPicked={(picked) => {
            const nextSpot = String(picked?.spot ?? '').trim()
            if (!isTodaysBestLabel(nextSpot)) {
              const curr = sanitizeFuelPenalty(fuelPenalty || { enabled: false }) || { enabled: false }
              onPicked({ ...picked, fuelPenalty: { ...curr, enabled: false } })
            } else {
              onPicked(picked)
            }
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function SurfExperienceCard({
  language,
  refreshKey,
  onOpenLog,
  onEditExperience,
  onExpandedLatest,
}: {
  language: AppLanguage
  refreshKey: number
  onOpenLog: () => void
  onEditExperience: (experienceId: string) => void
  onExpandedLatest: () => void
}) {
  const [items, setItems] = useState<SurfExperienceRowData[]>([])
  const [loading, setLoading] = useState(false)
  const [latestOpen, setLatestOpen] = useState(false)
  const [latestListMaxHeight, setLatestListMaxHeight] = useState<number | null>(null)
  const latestListRef = useRef<HTMLDivElement | null>(null)

  async function loadRecent() {
    try {
      setLoading(true)

      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user?.id
      if (!userId) {
        setItems([])
        return
      }

      const { data, error } = await supabase
        .from('user_surf_experiences')
        .select('id, spot_id, spot, logged_at, rating_1_6, wave_height_m, wave_period_s, wave_dir_from_deg, wind_speed_ms, wind_dir_from_deg')
        .eq('user_id', userId)
        .order('logged_at', { ascending: false })

      if (error) {
        setItems([])
        return
      }

      setItems((data || []) as SurfExperienceRowData[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRecent()
  }, [refreshKey])

  useEffect(() => {
    if (!latestOpen) {
      setLatestListMaxHeight(null)
      return
    }

    const updateListMaxHeight = () => {
      const el = latestListRef.current
      if (!el) return
      const bottomGap = 20
      const available = Math.floor(window.innerHeight - el.getBoundingClientRect().top - bottomGap)
      setLatestListMaxHeight(Math.max(available, 160))
    }

    const raf = window.requestAnimationFrame(() => {
      if (latestListRef.current) latestListRef.current.scrollTop = 0
      updateListMaxHeight()
    })
    const settleTimer = window.setTimeout(updateListMaxHeight, 220)

    window.addEventListener('resize', updateListMaxHeight)

    return () => {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(settleTimer)
      window.removeEventListener('resize', updateListMaxHeight)
    }
  }, [latestOpen])

  return (
    <>
      <div className="rounded-3xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] p-5">
        <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{language === 'no' ? 'LOGG ERFARING' : 'LOG EXPERIENCE'}</div>

        <div className="mt-3 text-[color:var(--fg-60)] text-sm">{language === 'no' ? 'Lagre hvordan surfen faktisk føltes.' : 'Save how the surf actually felt.'}</div>

        <div className="mt-4">
          <button
            onClick={onOpenLog}
            className="w-full h-12 rounded-2xl border border-[#2aa3ff] text-[#2aa3ff] tracking-widest text-sm transition"
          >
            {language === 'no' ? 'LOGG NY ERFARING' : 'LOG NEW EXPERIENCE'}
          </button>
        </div>

        <div className="mt-5">
          <button
            type="button"
            onClick={() => {
              setLatestOpen((v) => {
                const next = !v
                if (next) onExpandedLatest()
                return next
              })
            }}
            className="w-full flex items-center justify-between rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-4 py-3"
          >
            <div className="text-left">
              <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{language === 'no' ? 'SISTE' : 'LATEST'}</div>
              <div className="mt-1 text-xs text-[color:var(--fg-40)]">
                {latestOpen
                  ? language === 'no'
                    ? 'Trykk for å skjule nylige erfaringer'
                    : 'Tap to hide recent experiences'
                  : language === 'no'
                    ? 'Trykk for å vise nylige erfaringer'
                    : 'Tap to show recent experiences'}
              </div>
            </div>

            <div
              className={`text-[color:var(--fg-60)] text-base leading-none transition-transform duration-200 ${
                latestOpen ? 'rotate-180' : 'rotate-0'
              }`}
            >
              ▾
            </div>
          </button>

          {latestOpen && (
            <div
              ref={latestListRef}
              style={latestListMaxHeight ? { maxHeight: `${latestListMaxHeight}px` } : undefined}
              className="mt-3 space-y-2 overflow-y-auto no-scrollbar pr-1 [-webkit-overflow-scrolling:touch]"
            >
                      {loading ? (
                <div className="text-sm text-[color:var(--fg-50)]">{language === 'no' ? 'Laster…' : 'Loading…'}</div>
              ) : items.length === 0 ? (
                <div className="text-sm text-[color:var(--fg-50)]">{language === 'no' ? 'Ingen erfaringer logget ennå.' : 'No experiences logged yet.'}</div>
              ) : (
                items.map((item) => {
                  const feelingChoice = ratingToFeelingChoice(item.rating_1_6)
                  const feeling = formatFeelingFromRating(language, item.rating_1_6)

                  return (
                    <div key={item.id} className="rounded-2xl border border-[color:var(--bd-10)] px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[color:var(--fg-90)] font-medium truncate">{item.spot || '--'}</div>
                          <div className="mt-1 text-xs flex items-center gap-1.5">
                            <span className={`font-medium ${feelingTextColorClass(feelingChoice)}`}>{feeling}</span>
                            <span className="text-[color:var(--fg-40)]">•</span>
                            <span className="text-[color:var(--fg-50)]">{formatTimeLabel(language, new Date(item.logged_at))}</span>
                          </div>
                        </div>

                        <div className="shrink-0 self-center">
                          <button
                            onClick={() => onEditExperience(item.id)}
                            className="h-9 px-3 rounded-xl border border-[color:var(--bd-15)] text-[color:var(--fg-70)] tracking-widest text-xs"
                          >
                            {language === 'no' ? 'REDIGER' : 'EDIT'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function snapMinutesTo5(min: number) {
  const rounded = Math.round(min / 5) * 5
  if (rounded >= 60) return 55
  if (rounded < 0) return 0
  return rounded
}

function SurfExperienceEditor({
  language,
  experienceId,
  onCancel,
  onSaved,
  onDeleted,
}: {
  language: AppLanguage
  experienceId: string | null
  onCancel: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const isEdit = !!experienceId

  const [spotPickerOpen, setSpotPickerOpen] = useState(false)
  const [spotLabel, setSpotLabel] = useState(language === 'no' ? 'Velg spot' : 'Select spot')
  const [spotId, setSpotId] = useState('')

  const [feeling, setFeeling] = useState<FeelingChoice | null>(null)
  const [selectedAt, setSelectedAt] = useState<Date>(() => roundToNearest5Min(new Date()))
  const [dateYmd, setDateYmd] = useState<string>(() => toDateInputValue(roundToNearest5Min(new Date())))
  const [timeHm, setTimeHm] = useState<string>(() => {
    const d = roundToNearest5Min(new Date())
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  })

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [statusKind, setStatusKind] = useState<'ok' | 'error' | 'info'>('info')
  const [duplicateData, setDuplicateData] = useState<any | null>(null)

  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [timePickerOpen, setTimePickerOpen] = useState(false)

  const ready = isSpotReadyForExperience(spotLabel, spotId)
  const rating_1_6 = feelingToRating(feeling)
  const canSave = !saving && ready && !!rating_1_6

  const twoColRowClass = 'grid grid-cols-2 gap-2 w-full'

  useEffect(() => {
    const [hh, mm] = String(timeHm || '00:00')
      .split(':')
      .map((v) => Number(v))

    const next = setDateParts(
      selectedAt,
      dateYmd,
      Number.isFinite(hh) ? hh : 0,
      Number.isFinite(mm) ? mm : 0
    )
    setSelectedAt(next)
  }, [dateYmd, timeHm])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      if (!isEdit || !experienceId) {
        const now = roundToNearest5Min(new Date())
        setSpotLabel(language === 'no' ? 'Velg spot' : 'Select spot')
        setSpotId('')
        setFeeling(null)
        setSelectedAt(now)
        setDateYmd(toDateInputValue(now))
        setTimeHm(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`)
        setStatus(null)
        setDuplicateData(null)
        return
      }

      try {
        setLoadingExisting(true)
        setStatus(null)
        setDuplicateData(null)

        const { data: sessionData } = await supabase.auth.getSession()
        const userId = sessionData.session?.user?.id
        if (!userId) return

        const { data, error } = await supabase
          .from('user_surf_experiences')
          .select('id, spot_id, spot, logged_at, rating_1_6')
          .eq('id', experienceId)
          .eq('user_id', userId)
          .maybeSingle()

        if (error) throw error
        if (!data) throw new Error(language === 'no' ? 'Erfaring ikke funnet' : 'Experience not found')
        if (cancelled) return

        const dt = data.logged_at ? roundToNearest5Min(new Date(data.logged_at)) : roundToNearest5Min(new Date())

        setSpotLabel(String(data.spot || (language === 'no' ? 'Velg spot' : 'Select spot')))
        setSpotId(String(data.spot_id || ''))
        setFeeling(ratingToFeelingChoice(data.rating_1_6))
        setSelectedAt(dt)
        setDateYmd(toDateInputValue(dt))
        setTimeHm(`${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`)
      } catch (e: any) {
        if (!cancelled) {
          setStatusKind('error')
          setStatus(String(e?.message || e))
        }
      } finally {
        if (!cancelled) setLoadingExisting(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [experienceId, isEdit, language])

  async function doSave(mode: 'detect' | 'update_existing' | 'force_new', existingId?: string) {
    if (!ready) {
      setStatusKind('error')
      setStatus(language === 'no' ? 'Velg en surfespot først' : 'Choose a surf spot first')
      return
    }

    if (!rating_1_6) {
      setStatusKind('error')
      setStatus(language === 'no' ? 'Velg hvordan det føltes først' : 'Select how it felt first')
      return
    }

    try {
      setSaving(true)
      setStatus(null)

      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token || ''

      const effectiveMode = isEdit ? 'update_existing' : mode
      const effectiveId = isEdit ? experienceId || undefined : existingId || undefined

      const resp = await fetch('/api/surf/experience/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
        body: JSON.stringify({
          spotId,
          spot: spotLabel,
          loggedAt: selectedAt.toISOString(),
          rating_1_6,
          mode: effectiveMode,
          existingId: effectiveId,
        }),
      })

      const data: any = await resp.json().catch(() => ({}))

      if (!resp.ok) {
        throw new Error(String(data?.error || `Save failed (${resp.status})`))
      }

      if (data?.duplicate && !isEdit) {
        setDuplicateData(data)
        setStatusKind('info')
        setStatus(language === 'no' ? 'Du har allerede logget denne surfen' : 'You already logged this surf')
        return
      }

      setDuplicateData(null)
      setStatusKind('ok')
      setStatus(isEdit ? (language === 'no' ? 'Erfaring oppdatert' : 'Experience updated') : (language === 'no' ? 'Erfaring lagret' : 'Experience saved'))
      onSaved()
    } catch (e: any) {
      setStatusKind('error')
      setStatus(String(e?.message || e))
    } finally {
      setSaving(false)
    }
  }

  async function deleteExperienceFromEditor() {
    if (!experienceId) return

    try {
      setDeleting(true)
      setStatus(null)

      const { error } = await supabase.from('user_surf_experiences').delete().eq('id', experienceId)
      if (error) throw error

      onDeleted()
    } catch (e: any) {
      setStatusKind('error')
      setStatus(String(e?.message || e))
    } finally {
      setDeleting(false)
      setConfirmDeleteOpen(false)
    }
  }

  function feelingButtonClass(optKey: FeelingChoice, active: boolean) {
    if (!active) {
      return 'border-[color:var(--bd-10)] text-[color:var(--fg-80)]'
    }

    if (optKey === 'flat') return 'border-[#dc2626] text-[#dc2626]'
    if (optKey === 'poor') return 'border-[#d97706] text-[#d97706]'
    if (optKey === 'poor_fair') return 'border-[#facc15] text-[#facc15]'
    if (optKey === 'fair') return 'border-[#84cc16] text-[#84cc16]'
    if (optKey === 'good') return 'border-[#15803d] text-[#15803d]'
    if (optKey === 'epic') return 'border-[#a855f7] text-[#a855f7]'
    return 'border-[color:var(--bd-10)] text-[color:var(--fg-80)]'
  }

  return (
    <>
      <div className="rounded-3xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] p-5">
        {loadingExisting ? (
          <div className="text-sm text-[color:var(--fg-50)]">{language === 'no' ? 'Laster…' : 'Loading…'}</div>
        ) : (
          <>
            <div>
              <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{language === 'no' ? 'SPOT' : 'SPOT'}</div>
              <button
                onClick={() => setSpotPickerOpen(true)}
                className="mt-2 flex w-full h-11 items-center rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-4 text-left text-[color:var(--fg-90)]"
              >
                {spotLabel}
              </button>
            </div>

            <div className="mt-4">
              <div className={twoColRowClass}>
                <div className="min-w-0">
                  <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{language === 'no' ? 'DATO' : 'DATE'}</div>
                  <button
                    type="button"
                    onClick={() => setDatePickerOpen(true)}
                    className="mt-2 flex w-full h-11 items-center rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-4 text-left text-[color:var(--fg-90)]"
                  >
                    {dateYmd}
                  </button>
                </div>

                <div className="min-w-0">
                  <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{language === 'no' ? 'TID' : 'TIME'}</div>
                  <button
                    type="button"
                    onClick={() => setTimePickerOpen(true)}
                    className="mt-2 flex w-full h-11 items-center rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-4 text-left text-[color:var(--fg-90)]"
                  >
                    {timeHm}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 text-xs text-[color:var(--fg-50)]">
              {formatTimeLabel(language, selectedAt)}
            </div>

            <div className="mt-4">
              <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{language === 'no' ? 'HVORDAN VAR DET?' : 'HOW WAS IT?'}</div>

              <div className={`mt-2 ${twoColRowClass}`}>
                {FEELING_OPTIONS.map((opt) => {
                  const active = feeling === opt.key
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setFeeling(opt.key)}
                      className={`h-11 rounded-2xl border text-sm transition ${feelingButtonClass(opt.key, active)}`}
                    >
                      {feelingLabel(language, opt.key)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <button
                onClick={() => doSave('detect')}
                disabled={!canSave}
                className={`w-full h-12 rounded-2xl border tracking-widest text-sm transition ${
                  canSave
                    ? 'border-[#2aa3ff] text-[#2aa3ff]'
                    : 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]'
                }`}
              >
                {saving ? (language === 'no' ? 'LAGRER…' : 'SAVING…') : isEdit ? (language === 'no' ? 'LAGRE ENDRINGER' : 'SAVE CHANGES') : (language === 'no' ? 'LAGRE ERFARING' : 'SAVE EXPERIENCE')}
              </button>

              <button
                onClick={onCancel}
                disabled={saving || deleting}
                className="w-full h-12 rounded-2xl border border-[color:var(--bd-10)] text-[color:var(--fg-60)] tracking-widest text-sm"
              >
                {language === 'no' ? 'AVBRYT' : 'CANCEL'}
              </button>

              {isEdit && (
                <button
                  onClick={() => setConfirmDeleteOpen(true)}
                  disabled={saving || deleting}
                  className={`w-full h-12 rounded-2xl border tracking-widest text-sm ${
                    deleting
                      ? 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]'
                      : 'border-[color:var(--danger-bd)] text-[color:var(--danger)]'
                  }`}
                >
                  {deleting ? '…' : language === 'no' ? 'SLETT ERFARING' : 'DELETE EXPERIENCE'}
                </button>
              )}
            </div>

            <div className="mt-2 min-h-[18px] text-xs">
              {status ? (
                <span
                  className={
                    statusKind === 'error'
                      ? 'text-[color:var(--danger)]'
                      : statusKind === 'ok'
                        ? 'text-[#2aa3ff]'
                        : 'text-[color:var(--fg-50)]'
                  }
                >
                  {status}
                </span>
              ) : (
                <span> </span>
              )}
            </div>
          </>
        )}
      </div>

      {spotPickerOpen && (
        <SurfSpotSheet
          language={language}
          title={isEdit ? (language === 'no' ? 'Rediger erfaring' : 'Edit experience') : (language === 'no' ? 'Logg erfaring' : 'Log experience')}
          hideTodaysBest={true}
          onClose={() => setSpotPickerOpen(false)}
          onPicked={(picked) => {
            setSpotLabel(String(picked?.spot ?? (language === 'no' ? 'Velg spot' : 'Select spot')))
            setSpotId(String(picked?.spotId ?? ''))
            setSpotPickerOpen(false)
          }}
        />
      )}

      {datePickerOpen && (
        <DatePickerSheet
          language={language}
          value={selectedAt}
          onClose={() => setDatePickerOpen(false)}
          onApply={(d) => {
            const next = new Date(selectedAt)
            next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate())
            setSelectedAt(next)
            setDateYmd(toDateInputValue(next))
            setDatePickerOpen(false)
          }}
        />
      )}

      {timePickerOpen && (
        <TimePickerSheet
          language={language}
          value={selectedAt}
          onClose={() => setTimePickerOpen(false)}
          onApply={(d) => {
            const next = new Date(selectedAt)
            next.setHours(d.getHours(), d.getMinutes(), 0, 0)
            const rounded = roundToNearest5Min(next)
            setSelectedAt(rounded)
            setDateYmd(toDateInputValue(rounded))
            setTimeHm(`${pad2(rounded.getHours())}:${pad2(rounded.getMinutes())}`)
            setTimePickerOpen(false)
          }}
        />
      )}

      {duplicateData && (
        <DuplicateExperienceSheet
          language={language}
          duplicate={duplicateData}
          saving={saving}
          onClose={() => setDuplicateData(null)}
          onUpdateExisting={() => doSave('update_existing', duplicateData?.existing?.id)}
          onSaveAsNew={() => doSave('force_new')}
        />
      )}

      {confirmDeleteOpen && (
        <DeleteExperienceSheet
          language={language}
          deleting={deleting}
          onCancel={() => setConfirmDeleteOpen(false)}
          onConfirm={deleteExperienceFromEditor}
        />
      )}
    </>
  )
}

function DuplicateExperienceSheet({
  language,
  duplicate,
  saving,
  onClose,
  onUpdateExisting,
  onSaveAsNew,
}: {
  language: AppLanguage
  duplicate: any
  saving: boolean
  onClose: () => void
  onUpdateExisting: () => void
  onSaveAsNew: () => void
}) {
  const existing = duplicate?.existing

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--overlay-55)]">
      <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] px-5 pt-5 pb-8">
        <div className="flex items-center justify-between">
          <div className="tracking-widest text-sm text-[color:var(--fg-70)]">{language === 'no' ? 'DUPLIKAT ERFARING' : 'DUPLICATE EXPERIENCE'}</div>
          <button onClick={onClose} className="text-[color:var(--fg-60)] text-xl">
            ✕
          </button>
        </div>

        <div className="mt-4 text-[color:var(--fg-90)] text-base font-medium">{language === 'no' ? 'Du har allerede logget denne surfen.' : 'You already logged this surf.'}</div>

        <div className="mt-4 rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] p-4">
          <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{language === 'no' ? 'EKSISTERENDE' : 'EXISTING'}</div>
          <div className="mt-2 text-[color:var(--fg-90)]">{existing?.spot || '--'}</div>
          <div className="mt-1 text-sm text-[color:var(--fg-60)]">
            {existing?.logged_at ? formatTimeLabel(language, new Date(existing.logged_at)) : '--'}
          </div>
          <div className="mt-1 text-sm text-[color:var(--fg-60)]">{formatFeelingFromRating(language, existing?.rating_1_6)}</div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3">
          <button
            onClick={onUpdateExisting}
            disabled={saving}
            className={`h-12 rounded-2xl border tracking-widest text-sm ${
              saving ? 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]' : 'border-[#2aa3ff] text-[#2aa3ff]'
            }`}
          >
            {saving ? (language === 'no' ? 'JOBBER…' : 'WORKING…') : (language === 'no' ? 'OPPDATER EKSISTERENDE' : 'UPDATE EXISTING')}
          </button>

          <button
            onClick={onSaveAsNew}
            disabled={saving}
            className={`h-12 rounded-2xl border tracking-widest text-sm ${
              saving
                ? 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]'
                : 'border-[color:var(--bd-15)] text-[color:var(--fg-80)]'
            }`}
          >
            {saving ? (language === 'no' ? 'JOBBER…' : 'WORKING…') : (language === 'no' ? 'LAGRE SOM NY' : 'SAVE AS NEW')}
          </button>

          <button
            onClick={onClose}
            disabled={saving}
            className="h-12 rounded-2xl border border-[color:var(--bd-15)] text-[color:var(--fg-60)] tracking-widest text-sm"
          >
            {language === 'no' ? 'AVBRYT' : 'CANCEL'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteExperienceSheet({
  language,
  deleting,
  onCancel,
  onConfirm,
}: {
  language: AppLanguage
  deleting: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--overlay-55)]">
      <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] px-5 pt-5 pb-8">
        <div className="flex items-center justify-between">
          <div className="tracking-widest text-sm text-[color:var(--fg-70)]">{language === 'no' ? 'SLETT ERFARING' : 'DELETE EXPERIENCE'}</div>
          <button onClick={onCancel} disabled={deleting} className="text-[color:var(--fg-60)] text-xl">
            ✕
          </button>
        </div>

        <div className="mt-4 text-[color:var(--fg-90)] text-base font-medium">
          {language === 'no' ? 'Er du sikker på at du vil slette denne surferfaringen?' : 'Are you sure you want to delete this surf experience?'}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3">
          <button
            onClick={onConfirm}
            disabled={deleting}
            className={`h-12 rounded-2xl border tracking-widest text-sm ${
              deleting
                ? 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]'
                : 'border-[color:var(--danger-bd)] text-[color:var(--danger)]'
            }`}
          >
            {deleting ? (language === 'no' ? 'SLETTER…' : 'DELETING…') : (language === 'no' ? 'SLETT' : 'DELETE')}
          </button>

          <button
            onClick={onCancel}
            disabled={deleting}
            className="h-12 rounded-2xl border border-[color:var(--bd-15)] text-[color:var(--fg-60)] tracking-widest text-sm"
          >
            {language === 'no' ? 'AVBRYT' : 'CANCEL'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DatePickerSheet({
  language,
  value,
  onClose,
  onApply,
}: {
  language: AppLanguage
  value: Date
  onClose: () => void
  onApply: (d: Date) => void
}) {
  const today = new Date()
  const todayYmd = toDateInputValue(today)

  const initialSelectedYmd = toDateInputValue(value)

  const [selectedYmd, setSelectedYmd] = useState<string>(initialSelectedYmd)
  const [viewYear, setViewYear] = useState<number>(value.getFullYear())
  const [viewMonth, setViewMonth] = useState<number>(value.getMonth())

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(language === 'no' ? 'nb-NO' : undefined, {
    month: 'long',
    year: 'numeric',
  })

  const firstDay = new Date(viewYear, viewMonth, 1)
  const startWeekday = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate()

  const cells: Array<{
    ymd: string
    day: number
    inMonth: boolean
    isToday: boolean
    isSelected: boolean
  }> = []

  for (let i = 0; i < 42; i++) {
    let y = viewYear
    let m = viewMonth
    let d = 0
    let inMonth = true

    if (i < startWeekday) {
      inMonth = false
      d = prevMonthDays - startWeekday + i + 1
      if (m === 0) {
        y -= 1
        m = 11
      } else {
        m -= 1
      }
    } else if (i >= startWeekday + daysInMonth) {
      inMonth = false
      d = i - (startWeekday + daysInMonth) + 1
      if (m === 11) {
        y += 1
        m = 0
      } else {
        m += 1
      }
    } else {
      d = i - startWeekday + 1
    }

    const dt = new Date(y, m, d)
    const ymd = toDateInputValue(dt)

    cells.push({
      ymd,
      day: d,
      inMonth,
      isToday: ymd === todayYmd,
      isSelected: ymd === selectedYmd,
    })
  }

  function moveMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1)
    setViewYear(next.getFullYear())
    setViewMonth(next.getMonth())
  }

  function applyDate() {
    const [y, m, d] = selectedYmd.split('-').map(Number)
    const next = new Date(value)
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      next.setFullYear(y, m - 1, d)
    }
    onApply(next)
  }

  const weekdayCaps = language === 'no' ? ['MAN', 'TIR', 'ONS', 'TOR', 'FRE', 'LØR', 'SØN'] : ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--overlay-55)]">
      <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] px-5 pt-5 pb-8">
        <div className="flex items-center justify-between">
          <div className="tracking-widest text-sm text-[color:var(--fg-70)]">{language === 'no' ? 'VELG DATO' : 'SELECT DATE'}</div>
          <button onClick={onClose} className="text-[color:var(--fg-60)] text-xl">
            ✕
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => moveMonth(-1)}
            className="w-10 h-10 flex items-center justify-center rounded-full text-[color:var(--fg-70)] text-2xl"
          >
            ‹
          </button>

          <div className="text-[color:var(--fg-90)] text-lg font-semibold capitalize">
            {monthLabel}
          </div>

          <button
            onClick={() => moveMonth(1)}
            className="w-10 h-10 flex items-center justify-center rounded-full text-[color:var(--fg-70)] text-2xl"
          >
            ›
          </button>
        </div>

        <div className="mt-5 grid grid-cols-7 gap-y-2 text-center text-[11px] tracking-widest text-[color:var(--fg-45)]">
          {weekdayCaps.map((x) => (
            <div key={x}>{x}</div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-7 gap-y-2">
          {cells.map((cell) => {
            const showBlue = cell.isSelected || (!selectedYmd && cell.isToday)

            return (
              <button
                key={cell.ymd}
                onClick={() => setSelectedYmd(cell.ymd)}
                className="h-11 flex items-center justify-center"
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm transition ${
                    showBlue
                      ? 'bg-[#2aa3ff] text-white'
                      : cell.inMonth
                        ? 'text-[color:var(--fg-90)]'
                        : 'text-[color:var(--fg-30)]'
                  }`}
                >
                  {cell.day}
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={onClose}
            className="h-12 rounded-2xl border border-[color:var(--bd-15)] text-[color:var(--fg-60)] tracking-widest text-sm"
          >
            {language === 'no' ? 'AVBRYT' : 'CANCEL'}
          </button>

          <button
            onClick={applyDate}
            className="h-12 rounded-2xl border border-[#2aa3ff] text-[#2aa3ff] tracking-widest text-sm"
          >
            {language === 'no' ? 'BRUK' : 'APPLY'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TimePickerSheet({
  language,
  value,
  onClose,
  onApply,
}: {
  language: AppLanguage
  value: Date
  onClose: () => void
  onApply: (d: Date) => void
}) {
  const ROW_H = 44
  const VISIBLE_ROWS = 5
  const PICKER_H = ROW_H * VISIBLE_ROWS
  const CENTER_TOP = Math.floor(VISIBLE_ROWS / 2) * ROW_H

  const BASE_HOURS = Array.from({ length: 24 }, (_, i) => i)
  const BASE_MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)

  const COPIES = 9
  const hoursLoop = Array.from({ length: COPIES }, () => BASE_HOURS).flat()
  const minutesLoop = Array.from({ length: COPIES }, () => BASE_MINUTES).flat()

  const hourSegmentH = BASE_HOURS.length * ROW_H
  const minuteSegmentH = BASE_MINUTES.length * ROW_H

  const initialHour = value.getHours()
  const initialMinute = snapMinutesTo5(value.getMinutes())

  const [hour, setHour] = useState<number>(initialHour)
  const [minute, setMinute] = useState<number>(initialMinute)

  const hourRef = useRef<HTMLDivElement | null>(null)
  const minuteRef = useRef<HTMLDivElement | null>(null)
  const hourTimerRef = useRef<number | null>(null)
  const minuteTimerRef = useRef<number | null>(null)

  const preview = useMemo(() => {
    const next = new Date(value)
    next.setHours(hour, minute, 0, 0)
    return next
  }, [value, hour, minute])

  function normalizeHourScroll(el: HTMLDivElement) {
    const min = hourSegmentH * 2
    const max = hourSegmentH * (COPIES - 2)
    if (el.scrollTop < min) el.scrollTop += hourSegmentH * Math.floor(COPIES / 2)
    if (el.scrollTop > max) el.scrollTop -= hourSegmentH * Math.floor(COPIES / 2)
  }

  function normalizeMinuteScroll(el: HTMLDivElement) {
    const min = minuteSegmentH * 2
    const max = minuteSegmentH * (COPIES - 2)
    if (el.scrollTop < min) el.scrollTop += minuteSegmentH * Math.floor(COPIES / 2)
    if (el.scrollTop > max) el.scrollTop -= minuteSegmentH * Math.floor(COPIES / 2)
  }

  function centerHourIndex(rawIndex: number) {
    const el = hourRef.current
    if (!el) return
    el.scrollTo({
      top: rawIndex * ROW_H - CENTER_TOP,
      behavior: 'smooth',
    })
  }

  function centerMinuteIndex(rawIndex: number) {
    const el = minuteRef.current
    if (!el) return
    el.scrollTo({
      top: rawIndex * ROW_H - CENTER_TOP,
      behavior: 'smooth',
    })
  }

  function pickHourFromScroll() {
    const el = hourRef.current
    if (!el) return
    normalizeHourScroll(el)

    const rawIndex = Math.round((el.scrollTop + CENTER_TOP) / ROW_H)
    const baseIndex = ((rawIndex % BASE_HOURS.length) + BASE_HOURS.length) % BASE_HOURS.length
    setHour(BASE_HOURS[baseIndex])
    centerHourIndex(rawIndex)
  }

  function pickMinuteFromScroll() {
    const el = minuteRef.current
    if (!el) return
    normalizeMinuteScroll(el)

    const rawIndex = Math.round((el.scrollTop + CENTER_TOP) / ROW_H)
    const baseIndex = ((rawIndex % BASE_MINUTES.length) + BASE_MINUTES.length) % BASE_MINUTES.length
    setMinute(BASE_MINUTES[baseIndex])
    centerMinuteIndex(rawIndex)
  }

  useEffect(() => {
    const hourEl = hourRef.current
    const minuteEl = minuteRef.current
    if (!hourEl || !minuteEl) return

    const initialHourIndex = Math.floor(COPIES / 2) * BASE_HOURS.length + initialHour
    const initialMinuteIndex =
      Math.floor(COPIES / 2) * BASE_MINUTES.length + BASE_MINUTES.findIndex((m) => m === initialMinute)

    hourEl.scrollTop = initialHourIndex * ROW_H - CENTER_TOP
    minuteEl.scrollTop = initialMinuteIndex * ROW_H - CENTER_TOP
  }, [initialHour, initialMinute])

  useEffect(() => {
    return () => {
      if (hourTimerRef.current) window.clearTimeout(hourTimerRef.current)
      if (minuteTimerRef.current) window.clearTimeout(minuteTimerRef.current)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--overlay-55)]">
      <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] px-5 pt-5 pb-8">
        <div className="flex items-center justify-between">
          <div className="tracking-widest text-sm text-[color:var(--fg-70)]">{language === 'no' ? 'VELG TID' : 'SELECT TIME'}</div>
          <button onClick={onClose} className="text-[color:var(--fg-60)] text-xl">
            ✕
          </button>
        </div>

        <div className="mt-4 text-[color:var(--fg-90)] text-lg font-semibold">
          {formatTimeLabel(language, preview)}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{language === 'no' ? 'TIME' : 'HOUR'}</div>

            <div className="mt-2 relative rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] overflow-hidden">
              <div
                className="pointer-events-none absolute left-0 right-0 z-10 border-y border-[color:var(--bd-10)] bg-[color:var(--panel-08)]"
                style={{ top: CENTER_TOP, height: ROW_H }}
              />

              <div
                ref={hourRef}
                onScroll={() => {
                  const el = hourRef.current
                  if (!el) return
                  normalizeHourScroll(el)
                  if (hourTimerRef.current) window.clearTimeout(hourTimerRef.current)
                  hourTimerRef.current = window.setTimeout(() => {
                    pickHourFromScroll()
                  }, 70)
                }}
                className="overflow-y-auto no-scrollbar"
                style={{
                  height: PICKER_H,
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                {hoursLoop.map((h, idx) => {
                  const active = h === hour
                  return (
                    <button
                      key={`h-${idx}`}
                      type="button"
                      onClick={() => {
                        setHour(h)
                        centerHourIndex(idx)
                      }}
                      className={`w-full text-center transition ${
                        active ? 'text-[color:var(--fg-90)] font-semibold' : 'text-[color:var(--fg-50)]'
                      }`}
                      style={{ height: ROW_H }}
                    >
                      {pad2(h)}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div>
            <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{language === 'no' ? 'MINUTT' : 'MINUTE'}</div>

            <div className="mt-2 relative rounded-2xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] overflow-hidden">
              <div
                className="pointer-events-none absolute left-0 right-0 z-10 border-y border-[color:var(--bd-10)] bg-[color:var(--panel-08)]"
                style={{ top: CENTER_TOP, height: ROW_H }}
              />

              <div
                ref={minuteRef}
                onScroll={() => {
                  const el = minuteRef.current
                  if (!el) return
                  normalizeMinuteScroll(el)
                  if (minuteTimerRef.current) window.clearTimeout(minuteTimerRef.current)
                  minuteTimerRef.current = window.setTimeout(() => {
                    pickMinuteFromScroll()
                  }, 70)
                }}
                className="overflow-y-auto no-scrollbar"
                style={{
                  height: PICKER_H,
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                {minutesLoop.map((m, idx) => {
                  const active = m === minute
                  return (
                    <button
                      key={`m-${idx}`}
                      type="button"
                      onClick={() => {
                        setMinute(m)
                        centerMinuteIndex(idx)
                      }}
                      className={`w-full text-center transition ${
                        active ? 'text-[color:var(--fg-90)] font-semibold' : 'text-[color:var(--fg-50)]'
                      }`}
                      style={{ height: ROW_H }}
                    >
                      {pad2(m)}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={onClose}
            className="h-12 rounded-2xl border border-[color:var(--bd-15)] text-[color:var(--fg-60)] tracking-widest text-sm"
          >
            {language === 'no' ? 'AVBRYT' : 'CANCEL'}
          </button>

          <button
            onClick={() => onApply(preview)}
            className="h-12 rounded-2xl border border-[#2aa3ff] text-[#2aa3ff] tracking-widest text-sm"
          >
            {language === 'no' ? 'BRUK' : 'APPLY'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 items-center rounded-full border transition ${
        checked ? 'bg-[#2aa3ff] border-[#2aa3ff]' : 'bg-[color:var(--panel-05)] border-[color:var(--bd-15)]'
      }`}
      style={{ padding: 2 }}
    >
      <span
        className={`block h-6 w-6 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        style={{ boxShadow: '0 6px 18px rgba(0,0,0,0.25)' }}
      />
    </button>
  )
}

type SpotItem = {
  spotId: string
  label: string
  lat?: number
  lon?: number
  custom?: boolean
}

type CustomSurfSpot = {
  id: string
  user_id: string
  name: string
  lat: number
  lon: number
  spot_zoom?: number
  parking_lat: number
  parking_lon: number
  parking_zoom?: number
  swell_sector_start_deg: number
  swell_sector_end_deg: number
  swell_main_deg: number
  wind_sector_start_deg: number
  wind_sector_end_deg: number
  wind_main_deg: number
}

type SurfSpotSelection = { spot: string; spotId: string; lat?: number; lon?: number }
type CustomSurfSpotWizardProps = {
  language: AppLanguage
  onClose: () => void
  onSaved: (picked: SurfSpotSelection) => void
  editingSpot?: CustomSurfSpot | null
  onDeleted?: () => void
}

function SurfSpotSheet({
  language,
  title,
  onClose,
  onPicked,
  hideTodaysBest = false,
}: {
  language: AppLanguage
  title: string
  onClose: () => void
  onPicked: (cfgPatch: { spot: string; spotId: string; lat?: number; lon?: number }) => void
  hideTodaysBest?: boolean
}) {
  const [query, setQuery] = useState('')
  const [spots, setSpots] = useState<SpotItem[]>([])
  const [loading, setLoading] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingSpot, setEditingSpot] = useState<CustomSurfSpot | null>(null)
  const [customSpots, setCustomSpots] = useState<CustomSurfSpot[]>([])
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 50)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setLoading(true)
        const resp = await fetch('/api/surf/spots', { cache: 'no-store' })
        if (!resp.ok) throw new Error('Failed')
        const data: any = await resp.json()

        const rawItems = Array.isArray(data?.items) ? data.items : []
        let list: SpotItem[] = []

        if (rawItems.length > 0 && typeof rawItems[0] === 'object') {
          list = rawItems
            .map((s: any) => ({
              spotId: String(s?.spotId ?? '').trim(),
              label: String(s?.label ?? '').trim(),
              lat: Number.isFinite(Number(s?.lat)) ? Number(s.lat) : undefined,
              lon: Number.isFinite(Number(s?.lon)) ? Number(s.lon) : undefined,
            }))
            .filter((s: any) => s.spotId.length > 0 && s.label.length > 0)
        } else {
          const rawSpots = Array.isArray(data?.spots) ? data.spots : []
          list = rawSpots
            .map((name: any) => {
              const label = String(name ?? '').trim()
              const found = findSpotByLabel(label)
              return {
                spotId: found?.spotId ?? '',
                label,
              }
            })
            .filter((s: any) => s.label.length > 0)
        }

        const accessToken = (await supabase.auth.getSession())?.data?.session?.access_token || ''
        let customList: SpotItem[] = []
        if (accessToken) {
          const customResp = await fetch('/api/surf/custom-spots', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' })
          if (customResp.ok) {
            const customJson: any = await customResp.json()
            const rows: CustomSurfSpot[] = Array.isArray(customJson?.items) ? customJson.items : []
            if (!cancelled) setCustomSpots(rows)
            customList = rows.map((row: CustomSurfSpot) => ({
              spotId: `custom:${row.id}`,
              label: String(row.name || '').trim(),
              lat: Number(row.lat),
              lon: Number(row.lon),
              custom: true,
            }))
          }
        }
        if (!cancelled) setSpots((hideTodaysBest ? list.filter((s) => String(s.spotId || '').trim() !== '__todays_best__') : list).concat(customList))
      } catch {
        if (!cancelled) setSpots([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [hideTodaysBest])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return spots
    return spots.filter((s) => s.label.toLowerCase().includes(q))
  }, [query, spots])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--overlay-55)]">
      <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] px-5 pt-5 pb-8">
        <div className="flex items-center justify-between">
          <div className="tracking-widest text-sm text-[color:var(--fg-70)]">{title.toUpperCase()}</div>
          <button onClick={onClose} className="text-[color:var(--fg-60)] text-xl">
            ✕
          </button>
        </div>

        <div className="mt-4">
          <button
            onClick={() => setWizardOpen(true)}
            className="mb-3 h-11 w-full rounded-2xl border border-[#2aa3ff] text-[#2aa3ff] text-sm font-semibold"
          >
            + {language === 'no' ? 'Legg til hemmelig spot' : 'Add secret spot'}
          </button>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={language === 'no' ? 'Søk spot' : 'Search spot'}
            className="w-full h-12 rounded-2xl bg-[color:var(--panel-05)] border border-[color:var(--bd-10)] px-4 text-[color:var(--fg-90)] outline-none"
          />
        </div>

        <div className="mt-3 text-xs tracking-widest text-[color:var(--fg-40)]">
                  {loading ? (language === 'no' ? 'LASTER…' : 'LOADING…') : filtered.length > 0 ? (language === 'no' ? 'SPOTS' : 'SPOTS') : (language === 'no' ? 'INGEN SPOTS' : 'NO SPOTS')}
        </div>

        <div className="mt-3 max-h-[52vh] overflow-auto rounded-2xl border border-[color:var(--bd-10)]">
                  {loading ? (
            <div className="px-4 py-4 text-[color:var(--fg-50)]">{language === 'no' ? 'Laster…' : 'Loading…'}</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-4 text-[color:var(--fg-50)]">{language === 'no' ? 'Ingen spots funnet' : 'No spots found'}</div>
          ) : (
            filtered.map((s) => {
              const customRow = s.custom ? customSpots.find((row) => `custom:${row.id}` === s.spotId) : null
              return <div key={`${s.spotId || 'label'}-${s.label}`} className="w-full text-left px-4 py-4 border-b border-[color:var(--bd-10)] last:border-b-0 hover:bg-[color:var(--panel-05)]">
                <div className="flex items-center justify-between gap-3">
                  <button onClick={() => onPicked({ spot: s.label, spotId: s.spotId, lat: s.lat, lon: s.lon })} className="text-left flex-1">
                    <div className="text-[color:var(--fg-90)] text-base font-medium">
                      {language === 'no' && isTodaysBestLabel(s.label) ? 'Dagens Beste' : s.label}
                    </div>
                    {s.custom ? <div className="mt-1 text-[10px] tracking-[0.12em] uppercase text-[#26b6b6]">{language === 'no' ? 'Privat' : 'Private'}</div> : null}
                  </button>
                  {s.custom ? (
                    <button
                      onClick={() => customRow && setEditingSpot(customRow)}
                      className="h-6.5 px-2.5 rounded-lg border border-[color:var(--bd-20)] text-[10px] tracking-widest text-[color:var(--fg-70)]"
                    >
                      {language === 'no' ? 'REDIGER' : 'EDIT'}
                    </button>
                  ) : null}
                </div>
              </div>
            })
          )}
        </div>
        {wizardOpen ? (
          <CustomSurfSpotWizard
            language={language}
            onClose={() => setWizardOpen(false)}
            onSaved={(picked: SurfSpotSelection) => {
              onPicked(picked)
              setWizardOpen(false)
              onClose()
            }}
          />
        ) : null}
        {editingSpot ? (
          <CustomSurfSpotWizard
            language={language}
            editingSpot={editingSpot}
            onClose={() => setEditingSpot(null)}
            onDeleted={() => {
              setEditingSpot(null)
              setSpots((prev) => prev.filter((x) => x.spotId !== `custom:${editingSpot.id}`))
            }}
            onSaved={(picked: SurfSpotSelection) => {
              setEditingSpot(null)
              setSpots((prev) => prev.map((x) => x.spotId === picked.spotId ? { ...x, label: picked.spot, lat: picked.lat, lon: picked.lon } : x))
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

function WeatherLocationRow({
  language,
  id,
  title,
  label,
  onPicked,
}: {
  language: AppLanguage
  id: number
  title: string
  label: string
  onPicked: (cfgPatch: any) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="rounded-3xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{title.toUpperCase()}</div>
            <div className="mt-1 text-[color:var(--fg-90)] text-xl font-semibold leading-tight">{label === 'Not set' ? (language === 'no' ? 'Velg sted' : 'Choose location') : label}</div>
          </div>

          <button
            onClick={() => setOpen(true)}
            className="shrink-0 h-10 px-4 rounded-2xl border border-[color:var(--bd-15)] text-[color:var(--fg-70)] tracking-widest text-xs hover:bg-[color:var(--panel-05)]"
          >
            {language === 'no' ? 'ENDRE' : 'CHANGE'}
          </button>
        </div>
      </div>

      {open && (
        <WeatherLocationSheet
          language={language}
          title={title}
          onClose={() => setOpen(false)}
          onPicked={(picked) => {
            onPicked(picked)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function CustomSurfSpotWizard({ language, onClose, onSaved, editingSpot = null, onDeleted }: CustomSurfSpotWizardProps) {
  const isEdit = !!editingSpot
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [name, setName] = useState(editingSpot?.name || '')
  const [spotCenter, setSpotCenter] = useState({ lat: Number(editingSpot?.lat ?? 62.2), lon: Number(editingSpot?.lon ?? 10.4) })
  const [parkingCenter, setParkingCenter] = useState({ lat: Number(editingSpot?.parking_lat ?? editingSpot?.lat ?? 62.2), lon: Number(editingSpot?.parking_lon ?? editingSpot?.lon ?? 10.4) })
  const [spotZoom, setSpotZoom] = useState(Number(editingSpot?.spot_zoom ?? 5))
  const [parkingZoom, setParkingZoom] = useState(Number(editingSpot?.parking_zoom ?? Number(editingSpot?.spot_zoom ?? 5)))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [swellStart, setSwellStart] = useState(Number(editingSpot?.swell_sector_start_deg ?? 315))
  const [swellEnd, setSwellEnd] = useState(Number(editingSpot?.swell_sector_end_deg ?? 45))
  const [swellMain, setSwellMain] = useState(Number(editingSpot?.swell_main_deg ?? 0))
  const [swellArrowMoved, setSwellArrowMoved] = useState(false)
  const [windStart, setWindStart] = useState(Number(editingSpot?.wind_sector_start_deg ?? 45))
  const [windEnd, setWindEnd] = useState(Number(editingSpot?.wind_sector_end_deg ?? 135))
  const [windMain, setWindMain] = useState(Number(editingSpot?.wind_main_deg ?? 90))
  const [windArrowMoved, setWindArrowMoved] = useState(false)

  const lat = spotCenter.lat
  const lon = spotCenter.lon
  const parkingLat = parkingCenter.lat
  const parkingLon = parkingCenter.lon

  useEffect(() => {
    if (!swellArrowMoved) setSwellMain(sectorMidpoint(swellStart, swellEnd))
    else setSwellMain((curr) => clampAngleToSector(curr, swellStart, swellEnd))
  }, [swellStart, swellEnd, swellArrowMoved])
  useEffect(() => {
    if (!windArrowMoved) setWindMain(sectorMidpoint(windStart, windEnd))
    else setWindMain((curr) => clampAngleToSector(curr, windStart, windEnd))
  }, [windStart, windEnd, windArrowMoved])

  async function save() {
    setSaving(true)
    const accessToken = (await supabase.auth.getSession())?.data?.session?.access_token || ''
    const payload = { id: editingSpot?.id, name, lat, lon, spot_zoom: spotZoom, parking_lat: parkingLat, parking_lon: parkingLon, parking_zoom: parkingZoom, swell_sector_start_deg: swellStart, swell_sector_end_deg: swellEnd, swell_main_deg: swellMain, wind_sector_start_deg: windStart, wind_sector_end_deg: windEnd, wind_main_deg: windMain }
    const resp = await fetch('/api/surf/custom-spots', { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify(payload) })
    setSaving(false)
    if (!resp.ok) return
    const json: any = await resp.json()
    onSaved({ spot: name.trim(), spotId: `custom:${json?.item?.id}`, lat, lon })
    onClose()
  }
  async function onDelete() {
    if (!editingSpot?.id) return
    if (!window.confirm(language === 'no' ? 'Slette denne custom spoten?' : 'Delete this custom spot?')) return
    setDeleting(true)
    const accessToken = (await supabase.auth.getSession())?.data?.session?.access_token || ''
    await fetch('/api/surf/custom-spots', { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ id: editingSpot.id }) })
    setDeleting(false)
    onDeleted?.()
    onClose()
  }

  return <div className="fixed inset-0 z-[60] bg-[#0c1117] flex flex-col">
    <div className="absolute left-4 right-4 top-4 z-20 rounded-2xl bg-black/45 p-4 backdrop-blur-sm border border-white/10">
      <div className="text-xs tracking-[0.14em] text-white/80">{isEdit ? (language === 'no' ? 'REDIGER HEMMELIG SPOT' : 'EDIT SECRET SPOT') : (language === 'no' ? 'LEGG TIL HEMMELIG SPOT' : 'ADD SECRET SPOT')}</div>
      <div className="mt-1 text-[11px] text-white/70">
        {language === 'no' ? 'Kun synlig for deg — denne spoten deles ikke med andre.' : 'Private to your account — this spot is not shared with other users.'}
      </div>
      {step === 1 ? <><input value={name} onChange={(e) => setName(e.target.value)} placeholder={language === 'no' ? 'Spotnavn' : 'Spot name'} className="mt-2 w-full h-11 rounded-xl border border-white/20 bg-black/35 px-3 text-white" />
        <div className="mt-3 text-[11px] tracking-[0.14em] text-white/75">{language === 'no' ? 'BØLGE' : 'WAVE'}</div>
        <div className="mt-1 text-sm text-white/90">• Move the map to center your surf spot</div><div className="text-sm text-white/90">• Drag the handles to set swell exposure</div><div className="text-sm text-white/90">• Drag the arrow to set best swell direction</div></> : null}
      {step === 2 ? <><div className="mt-2 text-[11px] tracking-[0.14em] text-white/75">{language === 'no' ? 'VIND' : 'WIND'}</div><div className="mt-1 text-sm text-white/90">• Drag the handles to set good wind directions</div><div className="text-sm text-white/90">• Drag the arrow to set best wind direction</div></> : null}
      {step === 3 ? <><div className="mt-2 text-[11px] tracking-[0.14em] text-white/75">{language === 'no' ? 'PARKERING' : 'PARKING'}</div><div className="mt-1 text-sm text-white/90">• Move the map to the closest parking spot</div><div className="text-sm text-white/90">• Place the marker where you usually park</div></> : null}
    </div>
    <div className="flex-1 relative">
      <RealTileMap
        center={step === 3 ? parkingCenter : spotCenter}
        onCenterChange={step === 3 ? setParkingCenter : setSpotCenter}
        zoom={step === 3 ? parkingZoom : spotZoom}
        onZoomChange={step === 3 ? setParkingZoom : setSpotZoom}
        markerType={step === 3 ? 'parking' : 'spot'}
        draggable={step !== 2}
      />
      {step === 1 ? <DirectionDial start={swellStart} end={swellEnd} main={swellMain} onStart={setSwellStart} onEnd={setSwellEnd} onMain={(v) => { setSwellArrowMoved(true); setSwellMain(v) }} /> : null}
      {step === 2 ? <DirectionDial start={windStart} end={windEnd} main={windMain} onStart={setWindStart} onEnd={setWindEnd} onMain={(v) => { setWindArrowMoved(true); setWindMain(v) }} /> : null}

    </div>
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(20px,calc(env(safe-area-inset-bottom)+10px))]">
      <div className="pointer-events-auto grid grid-cols-2 gap-3">
        {step === 1 ? <button className="h-12 rounded-xl border border-white/60 bg-black/40 text-white" onClick={onClose}>{language === 'no' ? 'Lukk' : 'Close'}</button> : <button className="h-12 rounded-xl border border-white/60 bg-black/40 text-white" onClick={() => setStep((step - 1) as 1 | 2 | 3)}>{language === 'no' ? 'Tilbake' : 'Back'}</button>}
        {step < 3 ? (
          <button
            disabled={step === 1 && !name.trim()}
            className={`h-12 rounded-xl border border-[#2aa3ff] ${step === 1 && !name.trim() ? 'cursor-not-allowed bg-[#2aa3ff]/30 text-[#7caed6]' : 'bg-[#2aa3ff] text-[#07131f]'}`}
            onClick={() => {
              if (step === 1 && !name.trim()) return
              setStep((step + 1) as 1 | 2 | 3)
            }}
          >
            {language === 'no' ? 'Neste' : 'Next'}
          </button>
        ) : (
          <button disabled={saving || !name.trim()} className="h-12 rounded-xl border border-[#2aa3ff] bg-[#2aa3ff] text-[#07131f] disabled:cursor-not-allowed disabled:bg-[#2aa3ff]/30 disabled:text-[#7caed6]" onClick={save}>{saving ? 'Saving…' : (language === 'no' ? 'Lagre endringer' : 'Save changes')}</button>
        )}
      </div>
      {isEdit ? <div className="pointer-events-auto pt-3"><button disabled={deleting || saving} className="w-full h-12 rounded-xl border border-[color:var(--danger-bd)] bg-[color:var(--danger)]/18 text-[color:var(--danger)] disabled:cursor-not-allowed disabled:opacity-45" onClick={onDelete}>{deleting ? '…' : (language === 'no' ? 'Slett spot' : 'Delete spot')}</button></div> : null}
    </div>
  </div>
}

function RealTileMap({
  center,
  onCenterChange,
  zoom = 5,
  onZoomChange,
  markerType = 'spot',
  draggable = true,
}: {
  center: { lat: number; lon: number }
  onCenterChange: (v: { lat: number; lon: number }) => void
  zoom?: number
  onZoomChange?: (value: number) => void
  markerType?: 'spot' | 'parking'
  draggable?: boolean
}) {
  const TILE = 256
  const [localZoom, setLocalZoom] = useState(Math.max(2, Math.min(18, Math.round(zoom))))
  const [localCenter, setLocalCenter] = useState(center)
  const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180
  const clampLat = (lat: number) => Math.max(-85.0511, Math.min(85.0511, lat))
  const project = (lat: number, lon: number, z: number) => {
    const scale = TILE * (2 ** z)
    const x = (wrapLon(lon) + 180) / 360 * scale
    const sinLat = Math.sin(clampLat(lat) * Math.PI / 180)
    const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
    return { x, y }
  }
  const unproject = (x: number, y: number, z: number) => {
    const scale = TILE * (2 ** z)
    const lon = x / scale * 360 - 180
    const n = Math.PI - 2 * Math.PI * y / scale
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
    return { lat: clampLat(lat), lon: wrapLon(lon) }
  }

  const rootRef = useRef<HTMLDivElement | null>(null)
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchRef = useRef<{ dist: number; zoomStart: number } | null>(null)
  const [viewport, setViewport] = useState({ w: 390, h: 844 })
  const rafRef = useRef<number | null>(null)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!rootRef.current || !pointers.current.has(e.pointerId)) return
    const prev = pointers.current.get(e.pointerId)!
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) {
      const dx = e.clientX - prev.x
      const dy = e.clientY - prev.y
      const c = project(localCenter.lat, localCenter.lon, localZoom)
      const nextCenter = unproject(c.x - dx, c.y - dy, localZoom)
      setLocalCenter(nextCenter)
      if (rafRef.current == null) {
        rafRef.current = window.requestAnimationFrame(() => {
          rafRef.current = null
          onCenterChange(nextCenter)
        })
      }
      return
    }
    if (pointers.current.size === 2) {
      const vals = [...pointers.current.values()]
      const dist = Math.hypot(vals[0].x - vals[1].x, vals[0].y - vals[1].y)
      if (!pinchRef.current) pinchRef.current = { dist, zoomStart: localZoom }
      const delta = Math.log2(Math.max(0.2, dist / pinchRef.current.dist))
      const rawNext = Math.max(2, Math.min(18, pinchRef.current.zoomStart + delta))
      const snappedNext = Math.round(rawNext)
      if (snappedNext !== localZoom) {
        setLocalZoom(snappedNext)
        onZoomChange?.(snappedNext)
      }
    }
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable) return
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchRef.current = null
    onCenterChange(localCenter)
  }

  useEffect(() => { setLocalCenter(center) }, [center.lat, center.lon])
  useEffect(() => {
    const next = Math.max(2, Math.min(18, Math.round(zoom)))
    setLocalZoom(next)
  }, [zoom])
  useEffect(() => {
    const updateSize = () => {
      if (!rootRef.current) return
      setViewport({ w: rootRef.current.clientWidth || 390, h: rootRef.current.clientHeight || 844 })
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => {
      window.removeEventListener('resize', updateSize)
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const viewportW = viewport.w
  const viewportH = viewport.h
  const tileZoom = Math.max(2, Math.min(18, Math.round(localZoom)))
  const world = project(localCenter.lat, localCenter.lon, tileZoom)
  const halfW = viewportW / 2
  const halfH = viewportH / 2
  const left = world.x - halfW
  const top = world.y - halfH
  const firstX = Math.floor(left / TILE)
  const firstY = Math.floor(top / TILE)
  const lastX = Math.floor((left + viewportW) / TILE)
  const lastY = Math.floor((top + viewportH) / TILE)
  const maxIdx = 2 ** tileZoom

  const tiles: React.ReactNode[] = []
  for (let tx = firstX; tx <= lastX; tx += 1) {
    for (let ty = firstY; ty <= lastY; ty += 1) {
      if (ty < 0 || ty >= maxIdx) continue
      const wrappedX = ((tx % maxIdx) + maxIdx) % maxIdx
      const leftPx = tx * TILE - left
      const topPx = ty * TILE - top
      tiles.push(<img key={`${tileZoom}-${tx}-${ty}`} src={`https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${tileZoom}/${ty}/${wrappedX}`} alt="Satellite map tile" draggable={false} className="absolute select-none pointer-events-none [image-rendering:auto] [backface-visibility:hidden] [transform:translateZ(0)]" style={{ width: TILE, height: TILE, left: leftPx, top: topPx }} />)
    }
  }

  return <div ref={rootRef} className={`absolute inset-0 overflow-hidden bg-[#253744] ${draggable ? 'touch-none' : ''}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
    {tiles}
    <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/30 pointer-events-none" />
    {markerType === 'parking' ? (
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full pointer-events-none drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
        <svg width="34" height="42" viewBox="0 0 34 42" fill="none" aria-hidden="true">
          <path d="M17 3.5C9.54416 3.5 3.5 9.54416 3.5 17C3.5 27.1259 17 38.5 17 38.5C17 38.5 30.5 27.1259 30.5 17C30.5 9.54416 24.4558 3.5 17 3.5Z" fill="#2aa3ff" stroke="white" strokeWidth="2" />
          <circle cx="17" cy="17" r="5.2" fill="#0c1117" stroke="white" strokeWidth="1.8" />
        </svg>
      </div>
    ) : (
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-white bg-[#3ad6d0] shadow-[0_0_0_2px_rgba(0,0,0,0.35)] pointer-events-none" />
    )}
  </div>
}

function DirectionDial({ start, end, main, onStart, onEnd, onMain }: { start: number; end: number; main: number; onStart: (v: number) => void; onEnd: (v: number) => void; onMain: (v: number) => void }) {
  const size = 290
  const center = size / 2
  const r = 115
  const toXY = (deg: number, radius = r) => { const rad = (normalizeAngle(deg) - 90) * Math.PI / 180; return { x: center + Math.cos(rad) * radius, y: center + Math.sin(rad) * radius } }
  const s = toXY(start); const e = toXY(end); const m = toXY(main)
  const mainUnit = { x: m.x - center, y: m.y - center }
  const mainLen = Math.hypot(mainUnit.x, mainUnit.y) || 1
  const ux = mainUnit.x / mainLen
  const uy = mainUnit.y / mainLen
  const px = -uy
  const py = ux
  const arrowTip = { x: center, y: center }
  const arrowBase = toXY(main, r * 0.16)
  const arrowHalfWidth = 6
  const largeArc = ((end - start + 360) % 360) > 180 ? 1 : 0
  const move = (clientX: number, clientY: number, setter: (v: number) => void) => {
    const rect = (document.getElementById('direction-dial') as HTMLElement).getBoundingClientRect()
    const x = clientX - rect.left - center
    const y = clientY - rect.top - center
    setter(normalizeAngle(Math.atan2(y, x) * 180 / Math.PI + 90))
  }
  return <div id="direction-dial" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ width: size, height: size }}>
    <svg width={size} height={size} className="pointer-events-none">
      <circle cx={center} cy={center} r={r} stroke="rgba(255,255,255,.55)" strokeWidth="2" fill="none" />
      <path d={`M ${center} ${center} L ${s.x} ${s.y} A ${r} ${r} 0 ${largeArc} 1 ${e.x} ${e.y} Z`} fill="rgba(42,211,201,.35)" />
      <line x1={center} y1={center} x2={m.x} y2={m.y} stroke="#3ad6d0" strokeWidth="2.5" />
      <polygon
        points={`${arrowTip.x},${arrowTip.y} ${arrowBase.x + px * arrowHalfWidth},${arrowBase.y + py * arrowHalfWidth} ${arrowBase.x - px * arrowHalfWidth},${arrowBase.y - py * arrowHalfWidth}`}
        fill="#3ad6d0"
      />
      <circle cx={s.x} cy={s.y} r="10" fill="#3ad6d0" style={{ pointerEvents: "auto", touchAction: "none" }} onPointerDown={(ev) => { const mv = (e2: PointerEvent) => move(e2.clientX, e2.clientY, onStart); const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); ev.preventDefault() }} />
      <circle cx={e.x} cy={e.y} r="10" fill="#3ad6d0" style={{ pointerEvents: "auto", touchAction: "none" }} onPointerDown={(ev) => { const mv = (e2: PointerEvent) => move(e2.clientX, e2.clientY, onEnd); const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); ev.preventDefault() }} />
      <circle cx={m.x} cy={m.y} r="11" fill="#2aa3ff" style={{ pointerEvents: "auto", touchAction: "none" }} onPointerDown={(ev) => { const mv = (e2: PointerEvent) => move(e2.clientX, e2.clientY, (v) => onMain(clampAngleToSector(v, start, end))); const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up) }; window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); ev.preventDefault() }} />
    </svg>
  </div>
}

function WeatherLocationSheet({
  language,
  title,
  onClose,
  onPicked,
}: {
  language: AppLanguage
  title: string
  onClose: () => void
  onPicked: (cfgPatch: any) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 50)
    return () => window.clearTimeout(t)
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)

    const handle = window.setTimeout(async () => {
      try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=${language === 'no' ? 'no' : 'en'}&format=json`

        const resp = await fetch(url)
        if (!resp.ok) throw new Error('Search failed')

        const data = await resp.json()
        setResults(Array.isArray(data?.results) ? data.results : [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => window.clearTimeout(handle)
  }, [query, language])

  function pick(r: any) {
    const label = String(r?.name || '').trim()

    const lat = Number(r?.latitude)
    const lon = Number(r?.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return

    onPicked({
      label: label.slice(0, 40),
      lat,
      lon,
      units: 'metric',
      refresh: 1800000,
      hiLo: true,
      cond: true,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--overlay-55)]">
      <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] px-5 pt-5 pb-8">
        <div className="flex items-center justify-between">
          <div className="tracking-widest text-sm text-[color:var(--fg-70)]">{title.toUpperCase()}</div>
          <button onClick={onClose} className="text-[color:var(--fg-60)] text-xl">
            ✕
          </button>
        </div>

        <div className="mt-4">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={language === 'no' ? 'Søk by' : 'Search city'}
            className="w-full h-12 rounded-2xl bg-[color:var(--panel-05)] border border-[color:var(--bd-10)] px-4 text-[color:var(--fg-90)] outline-none"
          />
        </div>

        <div className="mt-3 text-xs tracking-widest text-[color:var(--fg-40)]">
                  {loading ? (language === 'no' ? 'SØKER…' : 'SEARCHING…') : results.length > 0 ? (language === 'no' ? 'RESULTATER' : 'RESULTS') : query.trim().length >= 2 ? (language === 'no' ? 'INGEN RESULTATER' : 'NO RESULTS') : ''}
        </div>

        <div className="mt-3 max-h-[52vh] overflow-auto rounded-2xl border border-[color:var(--bd-10)]">
          {results.map((r, idx) => {
            const name = String(r?.name || '')
            const admin1 = r?.admin1 ? String(r.admin1) : ''
            const country = r?.country_code ? String(r.country_code) : r?.country ? String(r.country) : ''
            const line = [name, admin1, country].filter(Boolean).join(', ')

            return (
              <button
                key={idx}
                onClick={() => pick(r)}
                className="w-full text-left px-4 py-4 border-b border-[color:var(--bd-10)] last:border-b-0 hover:bg-[color:var(--panel-05)]"
              >
                <div className="text-[color:var(--fg-90)] text-base font-medium">{line}</div>
                <div className="text-[color:var(--fg-40)] text-xs mt-1">{`${r?.latitude}, ${r?.longitude}`}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function FramePreview({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`w-full h-full flex flex-col ${className}`}>{children}</div>
}
function HLine() {
  return <div className="h-px bg-[color:var(--bd-15)]" />
}
function VLine() {
  return <div className="w-px bg-[color:var(--bd-15)]" />
}
