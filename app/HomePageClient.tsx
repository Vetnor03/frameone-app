// app/page.tsx
'use client'

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { findSpotByLabel } from './lib/surf/spots'
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

function allLayouts(language: AppLanguage): { key: LayoutKey; title: string; subtitle: string }[] {
  const t = tx(language)
  return [
    { key: 'default', title: t.layouts.default.title, subtitle: t.layouts.default.subtitle },
    { key: 'pyramid', title: t.layouts.pyramid.title, subtitle: t.layouts.pyramid.subtitle },
    { key: 'square', title: t.layouts.square.title, subtitle: t.layouts.square.subtitle },
    { key: 'full', title: t.layouts.full.title, subtitle: t.layouts.full.subtitle },
  ]
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
  isTodaysBest?: boolean
  isExperienceBased?: boolean
  ratingFromExperience?: boolean
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
  reminderHeader?: string
  dinnerTodayTitle?: string
  groceryDinnerPlan?: Array<{ date: string; title: string }>
  groceryRunningLow?: Array<{ name: string; label?: string }>
  groceryMealIdeas?: Array<{ name: string; missing?: string[] }>
  weatherLowTemp?: string
  weatherHighTemp?: string
  weatherAdvice?: string
  weatherWindLine?: string
  weatherPrecipLine?: string
  weatherWmo?: number | null
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
  stockPurchasePrice?: number | null
  countdownTitle?: string
  countdownDaysLeft?: number
  countdownTargetDate?: string
  countdownPinned?: boolean
  countdownUpcoming?: Array<{ title: string; targetDate: string; daysLeft: number }>
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
  const [dirty, setDirty] = useState(false)

  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null)
  const [frames, setFrames] = useState<MemberRow[]>([])
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
  const autoPersistingRef = useRef(false)
  const [pinnedModuleTabs, setPinnedModuleTabs] = useState<ModuleKey[]>([])

  const [saveToast, setSaveToast] = useState<{ visible: boolean; text: string }>({ visible: false, text: tx(language).saved })
  const saveToastTimerRef = useRef<number | null>(null)

  function showSavedToast(text = tx(language).saved) {
    setSaveToast({ visible: true, text })
    if (saveToastTimerRef.current) window.clearTimeout(saveToastTimerRef.current)
    saveToastTimerRef.current = window.setTimeout(() => {
      setSaveToast((t) => ({ ...t, visible: false }))
    }, 1400)
  }

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
      if (saveToastTimerRef.current) window.clearTimeout(saveToastTimerRef.current)
      if (dirtyFrameRef.current != null) window.cancelAnimationFrame(dirtyFrameRef.current)
    }
  }, [])

  const layoutMeta = allLayouts(language).find((l) => l.key === layoutKey) || allLayouts(language)[0]
  const activeFrameStatus = frames.find((frame) => frame.device_id === activeDeviceId) ?? null

  const stickySettingsRef = useRef(false)
  const preferInstantScrollRef = useRef(false)
  const isLoadedRef = useRef(false)

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
      pinnedTabs: args.pinnedModuleTabs,
    })
  }

  const dirtyFrameRef = useRef<number | null>(null)
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

  function orderedSlotsForLayout(targetLayout: LayoutKey) {
    return Object.keys(emptyCellsFor(targetLayout)).map(Number).sort((a, b) => a - b)
  }

  function buildSlotIndexedMemoryFromCells(cells: Record<number, ModuleKey | null>) {
    // Memory is slot-aligned: array index === slot number.
    return Object.keys(cells)
      .map(Number)
      .sort((a, b) => a - b)
      .map((slot) => cells[slot])
  }

  function projectSlotMemoryIntoLayout(moduleMemory: (ModuleKey | null)[], targetLayout: LayoutKey) {
    // We intentionally keep sparse values as null so layout switches preserve slot positions.
    const target = emptyCellsFor(targetLayout)
    const targetSlots = orderedSlotsForLayout(targetLayout)

    targetSlots.forEach((slot, idx) => {
      target[slot] = moduleMemory[idx] ?? null
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

    layoutModuleMemoryRef.current = buildSlotIndexedMemoryFromCells(nextCellsForLayout)

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

    savedStateRef.current = JSON.stringify({
      theme: nextTheme,
      language: nextLanguage,
      fontSize: nextFontSize,
      layout: nextLayout,
      cells: cellsMapToArray(nextCellsByLayout[nextLayout]),
      modules: normalizedModules,
      pinnedTabs: nextPinnedTabs,
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
      setBooting(false)
      setShowSplash(false)
      setShouldRenderApp(false)

      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session

      if (!session) {
        setFrames([])
        setActiveDeviceId(null)
        setBooting(false)
        setShowSplash(false)
        setShouldRenderApp(false)
        router.replace('/login')
        return
      }

      setShouldRenderApp(true)
      setShowSplash(true)
      setBooting(true)

      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (!nextSession) {
          setShouldRenderApp(false)
          setShowSplash(false)
          setBooting(false)
          router.replace('/login')
        }
      })
      unsub = data.subscription

      const { data: members, error } = await supabase
        .from('device_members')
        .select('device_id, role')
        .eq('user_id', session.user.id)
        .order('device_id', { ascending: true })

      if (error) {
        setFrames([])
        setActiveDeviceId(null)
        setBooting(false)
        return
      }

      const memberRows = (members || []) as Array<{ device_id: string; role: string | null }>
      const deviceIds = memberRows.map((m) => m.device_id).filter(Boolean)
      const statusMap = await fetchDeviceStatusMap(deviceIds)

      const list: MemberRow[] = memberRows.map((m) => ({
        device_id: m.device_id,
        role: m.role,
        current_version: statusMap.get(m.device_id)?.current_version ?? null,
        battery_percent: statusMap.get(m.device_id)?.battery_percent ?? null,
        battery_voltage: statusMap.get(m.device_id)?.battery_voltage ?? null,
        is_charging: statusMap.get(m.device_id)?.is_charging ?? null,
        is_usb_present: statusMap.get(m.device_id)?.is_usb_present ?? null,
      }))
      setFrames(list)

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

      await finishBoot()
    })()

    return () => {
      cancelled = true
      if (unsub) unsub.unsubscribe()
    }
  }, [router])

  useEffect(() => {
    if (booting) {
      setShowSplash(true)
      return
    }

    const splashFadeTimer = window.setTimeout(() => setShowSplash(false), 720)
    return () => window.clearTimeout(splashFadeTimer)
  }, [booting])

  async function selectDevice(id: string) {
    setActiveDeviceId(id)
    setPhysicalFrameSnapshot(null)
    physicalFrameSnapshotRef.current = null
    physicalFrameRenderAtRef.current = null
    if (typeof window !== 'undefined') localStorage.setItem('activeDeviceId', id)
    await loadDeviceSettings(id)
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
  }

  async function persistSettings(showToast = true) {
    if (!activeDeviceId) return
    if (persisting) return

    try {
      setPersisting(true)

      const modulesForSave = normalizeModulesForSave(modulesJson)

      const settingsJson: SettingsJson = {
        theme,
        language,
        fontSize,
        layout: layoutKey,
        cells: cellsMapToArray(cellsByLayout[layoutKey]),
        modules: modulesForSave,
        pinned_tabs: pinnedModuleTabs,
      }

      const { data, error } = await supabase.rpc('upsert_device_settings', {
        p_device_id: activeDeviceId,
        p_settings: settingsJson,
      })

      if (error) throw error
      if (data !== true) throw new Error(language === 'no' ? 'Ikke tilgang til å oppdatere dette framet.' : 'Not allowed to update this frame.')

      const savedCellsForLayout = { ...cellsByLayout[layoutKey] }

      const nextCellsByLayout = {
        ...makeEmptyCellsByLayout(),
        [layoutKey]: savedCellsForLayout,
      }

      layoutModuleMemoryRef.current = buildSlotIndexedMemoryFromCells(savedCellsForLayout)

      setCellsByLayout(nextCellsByLayout)
      setModulesJson(modulesForSave)

      savedStateRef.current = JSON.stringify({
        theme,
        language,
        fontSize,
        layout: layoutKey,
        cells: cellsMapToArray(nextCellsByLayout[layoutKey]),
        modules: modulesForSave,
        pinned_tabs: pinnedModuleTabs,
      })
      savedFrameStateRef.current = {
        theme,
        language,
        fontSize,
        layoutKey,
        cellsByLayout: nextCellsByLayout,
      }

      setDirty(false)
      if (showToast) showSavedToast(tx(language).saved)
    } catch (e: any) {
      alert(String(e?.message || e))
    } finally {
      setPersisting(false)
    }
  }



  async function logout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const appBg = 'var(--app-bg)'
  const appText = 'text-[color:var(--fg)]'

  useEffect(() => {
    if (!activeDeviceId || activeTab === 'frame' || !isLoadedRef.current || persisting || autoPersistingRef.current) return
    if (activeTab === 'settings') return

    const timer = window.setTimeout(async () => {
      const baseline = savedFrameStateRef.current
      if (!baseline) return

      const modulesForSave = normalizeModulesForSave(modulesJson)
      const settingsJson: SettingsJson = {
        theme: baseline.theme,
        language: baseline.language,
        fontSize: baseline.fontSize,
        layout: baseline.layoutKey,
        cells: cellsMapToArray(baseline.cellsByLayout[baseline.layoutKey]),
        modules: modulesForSave,
        pinned_tabs: pinnedModuleTabs,
      }

      try {
        autoPersistingRef.current = true
        const { data, error } = await supabase.rpc('upsert_device_settings', {
          p_device_id: activeDeviceId,
          p_settings: settingsJson,
        })
        if (error) throw error
        if (data !== true) throw new Error('Failed to auto-save module settings')

        savedStateRef.current = serializeComparableState({
          theme,
          language,
          fontSize,
          layoutKey,
          cellsByLayout,
          modulesJson: modulesForSave,
          pinnedModuleTabs,
        })
        refreshDirtyState()
      } catch {
        // keep unsaved state; user can still tap UPDATE manually
      } finally {
        autoPersistingRef.current = false
      }
    }, 550)

    return () => window.clearTimeout(timer)
  }, [activeDeviceId, activeTab, modulesJson, pinnedModuleTabs])

async function handleSelectTab(k: TabKey) {
  preferInstantScrollRef.current = false
  stickySettingsRef.current = k === 'settings'

  setActiveTab(k)
}

  if (isPhoneLandscapeMirror) {
    return (
      <LandscapeFrameMirror
        snapshot={physicalFrameSnapshot}
        fallbackLanguage={language}
        theme={theme}
        status={activeFrameStatus}
      />
    )
  }

  return (
    <main className={`h-screen overflow-hidden ${appText} flex justify-center`} style={{ background: appBg }}>
      <div className="w-full max-w-[420px] h-full px-5 pt-10 pb-6 flex flex-col relative">
        <div
          className={`remind-app-shell ${!shouldRenderApp ? 'hidden' : ''} ${booting ? 'remind-app-shell-booting' : 'remind-app-shell-ready'} flex flex-col flex-1 min-h-0`}
          aria-hidden={!shouldRenderApp || booting}
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
                  onFramesChanged={setFrames}
                  onLogout={logout}
                  onGo={(path) => router.push(path)}
                />
              )}

              {activeTab !== 'frame' && activeTab !== 'settings' && (
                <div className="relative h-full">
                  <div className="absolute right-0 -top-4 z-20">
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
                </div>
              )}
            </div>

            {activeTab === 'frame' && (
  <div className="pt-5 pb-[20px] flex flex-col items-center relative z-20">
    <button
      onClick={() => persistSettings(true)}
      className={`w-[260px] h-[56px] rounded-2xl border tracking-widest transition bg-[color:var(--app-bg)] ${
        dirty
          ? 'border-[#2aa3ff] text-[#2aa3ff]'
          : 'border-[color:var(--bd-30)] text-[color:var(--fg-50)]'
      }`}
      style={{ backgroundColor: 'var(--app-bg)' }}
      disabled={!dirty || persisting}
    >
      {persisting ? tx(language).saving : tx(language).update}
    </button>

    <div className="mt-6 h-[16px] text-xs tracking-widest text-[color:var(--fg-40)]">
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

            <SaveToast visible={saveToast.visible} text={saveToast.text} />
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

function SaveToast({ visible, text }: { visible: boolean; text: string }) {
  return (
    <div
      className={`pointer-events-none fixed left-1/2 -translate-x-1/2 bottom-[28px] z-[80] transition-all duration-200 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      <div className="px-4 py-2 rounded-2xl border border-[color:var(--bd-15)] bg-[color:var(--toast-bg)] backdrop-blur text-[color:var(--fg-80)] tracking-widest text-xs">
        {text}
      </div>
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
        <div className="max-w-full truncate text-[clamp(1rem,2.55vw,1.7rem)] font-semibold tracking-[0.08em]">
          {title}
        </div>
      </div>
    )
  }

  const daysNumber = formatMirrorCountdownDaysNumber(daysLeft)
  const daysUnit = formatMirrorCountdownDaysUnit(daysLeft)
  const badge = formatMirrorCountdownMediumBadge(daysLeft, detail.countdownTargetDate)

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden px-[clamp(0.5rem,1.45vw,0.95rem)] py-[clamp(0.45rem,1.2vw,0.8rem)] text-center leading-none">
      <div className="flex max-h-full w-full flex-col items-center justify-center gap-[clamp(0.42rem,1.22vw,0.72rem)] overflow-hidden">
        <div className="max-w-full shrink-0 truncate text-[clamp(0.78rem,1.8vw,1.18rem)] font-semibold tracking-[0.08em]" title={title}>
          {title}
        </div>

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
            <div className="mb-[clamp(0.42rem,1.22vw,0.72rem)] shrink-0 text-center text-[clamp(0.58rem,1.34vw,0.86rem)] font-semibold tracking-[0.16em]">
              COMING UP
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
}: {
  textColor: string
  language: AppLanguage
  monthOffset?: number
  holidays?: MirrorHoliday[]
  showHolidayDots?: boolean
}) {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const today = monthOffset === 0 ? now.getDate() : -1
  const { days, usedRows } = mirrorCalendarDays(now, monthOffset)
  const locale = language === 'no' ? 'nb-NO' : 'en-US'
  const monthTitle = new Intl.DateTimeFormat(locale, { month: 'long' }).format(target).toLocaleUpperCase(locale)

  return (
    <div className="flex h-full w-full min-w-0 translate-y-[clamp(0.18rem,0.62vw,0.42rem)] items-center justify-center overflow-hidden px-0 py-[clamp(0.16rem,0.44vw,0.32rem)] leading-none">
      <div className="grid h-full max-h-[min(90%,11.1rem)] w-full max-w-[min(100%,15.8rem)] grid-rows-[auto_auto_1fr] gap-[clamp(0.18rem,0.5vw,0.38rem)]">
        <div className="min-w-0 truncate text-center text-[clamp(0.68rem,1.55vw,1rem)] font-bold tracking-[0.14em]">
          {monthTitle}
        </div>

        <div className="grid grid-cols-7 gap-x-[clamp(0.1rem,0.5vw,0.36rem)] text-center text-[clamp(0.54rem,1.18vw,0.78rem)] font-bold tracking-[0.1em]">
          {MIRROR_CALENDAR_WEEKDAYS.map((weekday, index) => (
            <div key={weekday} className={index >= 5 ? 'opacity-45' : 'opacity-80'}>
              {weekday}
            </div>
          ))}
        </div>

        <div
          className="grid min-h-0 grid-cols-7 items-center gap-x-[clamp(0.1rem,0.5vw,0.36rem)] gap-y-[clamp(0.1rem,0.48vw,0.32rem)] text-center text-[clamp(0.72rem,1.72vw,1.12rem)] font-semibold tracking-[0.02em]"
          style={{ gridTemplateRows: `repeat(${usedRows}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: usedRows * 7 }).map((_, index) => {
            const day = days[index] ?? null
            const weekdayIndex = index % 7
            const isWeekend = weekdayIndex >= 5
            const isToday = day === today
            const isHoliday = day != null && showHolidayDots && isMirrorHoliday(holidays, target.getFullYear(), target.getMonth(), day)

            return (
              <div key={index} className="flex min-h-0 items-center justify-center">
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
                    {isHoliday ? (
                      <span
                        aria-hidden="true"
                        className="absolute bottom-[clamp(0.12rem,0.36vw,0.24rem)] h-[clamp(0.12rem,0.34vw,0.22rem)] w-[clamp(0.12rem,0.34vw,0.22rem)] rounded-full"
                        style={{ backgroundColor: isToday ? '#061b24' : textColor }}
                      />
                    ) : null}
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
  return (
    <div className="max-w-full truncate border-b border-current pb-[clamp(0.08rem,0.22vw,0.14rem)] text-[clamp(0.72rem,1.7vw,1.05rem)] font-semibold tracking-[0.055em]" title={header}>
      {header}
    </div>
  )
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
  const locale = language === 'no' ? 'nb-NO' : 'en-US'
  const header = typeof detail.reminderHeader === 'string' ? detail.reminderHeader.trim() : ''
  if (header) return header.toLocaleUpperCase(locale)

  const fallbackDate = typeof detail.tertiary === 'string' ? detail.tertiary.trim() : ''
  return fallbackDate ? fallbackDate.toLocaleUpperCase(locale) : (language === 'no' ? 'PÅMINNELSER' : 'REMINDERS')
}

function mirrorReminderItems(detail: MirrorModuleDetail) {
  const rawItems = Array.isArray(detail.reminderItems) ? detail.reminderItems : []
  return rawItems.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
}

function mirrorRemindersEmptyMessage(language: AppLanguage) {
  return language === 'no' ? 'Alt gjort' : 'All done'
}

function MirrorSurfRatingBars({ rating, muted }: { rating: number | undefined; muted: string }) {
  const value = Math.max(0, Math.min(6, Math.round(Number(rating) || 0)))
  return (
    <div className="flex items-center justify-center gap-[clamp(0.18rem,0.55vw,0.45rem)]" aria-label={`Surf rating ${value} of 6`}>
      {Array.from({ length: 6 }).map((_, index) => (
        <span
          key={index}
          className="block h-[clamp(0.42rem,1.15vw,0.72rem)] w-[clamp(0.7rem,1.65vw,1.05rem)] rounded-[0.18rem] border"
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

function DiceRating({ value, rating, isExperienceBased, muted, paperColor, className = '' }: DiceRatingProps) {
  const displayRating = rating ?? value
  if (!isExperienceBased) return <MirrorSurfRatingBars rating={displayRating} muted={muted} />

  const normalizedValue = Math.max(0, Math.min(6, Math.round(Number(displayRating) || 0)))
  return (
    <div className={`flex items-center justify-center gap-[clamp(0.12rem,0.38vw,0.28rem)] ${className}`} aria-label={`Experience-based surf rating ${normalizedValue} of 6`}>
      {Array.from({ length: 6 }).map((_, index) => {
        const face = index + 1
        const filled = face <= normalizedValue
        const dots = filled ? MIRROR_DICE_DOTS[face] ?? [] : []
        return (
          <span
            key={face}
            className="relative block h-[clamp(0.58rem,1.42vw,0.9rem)] w-[clamp(0.58rem,1.42vw,0.9rem)] shrink-0 rounded-[clamp(0.12rem,0.32vw,0.22rem)] border"
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
                className="absolute h-[clamp(0.085rem,0.24vw,0.15rem)] w-[clamp(0.085rem,0.24vw,0.15rem)] rounded-full"
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

function MirrorSurfWaveIcon({ periodSeconds }: { periodSeconds: number | undefined }) {
  const peaks = mirrorWavePeakCount(periodSeconds)
  const items = Array.from({ length: peaks })
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

function MirrorSurfWindIcon() {
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
        <div className="max-w-full truncate text-[clamp(0.95rem,2.6vw,1.55rem)] font-semibold tracking-[0.08em]">
          {title}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden px-[clamp(0.5rem,1.4vw,0.95rem)] py-[clamp(0.52rem,1.45vw,1rem)] text-center leading-tight">
      <div className="mx-auto max-w-full shrink-0 truncate border-b border-current px-[clamp(0.25rem,0.7vw,0.5rem)] pb-[clamp(0.05rem,0.18vw,0.12rem)] text-[clamp(0.7rem,1.7vw,1.06rem)] font-semibold tracking-[0.08em]">
        {title}
      </div>

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

function buildMirrorStockChartGeometry(values: number[], previousClose?: number | null, purchasePrice?: number | null): MirrorStockChartGeometry {
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
  const hasPurchasePrice = typeof purchasePrice === 'number' && Number.isFinite(purchasePrice) && purchasePrice > 0
  const referenceValue = hasPurchasePrice ? purchasePrice : previousClose

  if (hasPurchasePrice) {
    min = Math.min(min, purchasePrice)
    max = Math.max(max, purchasePrice)
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
  const shouldShowReference = hasReferenceValue && (hasPurchasePrice || (referenceValue >= seriesMin && referenceValue <= seriesMax))
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
  previousClose,
  purchasePrice,
  textColor,
  moduleId,
  chartRange,
}: {
  series?: number[]
  previousClose?: number | null
  purchasePrice?: number | null
  textColor: string
  moduleId?: number
  chartRange?: StockChartRange
}) {
  const values = useMemo(() => (series || []).filter((value) => Number.isFinite(value)), [series])

  const geometry = useMemo(() => {
    if (values.length < 2) return null
    return buildMirrorStockChartGeometry(values, previousClose, purchasePrice)
  }, [values, previousClose, purchasePrice])

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
        <div className="max-w-full truncate text-[clamp(1rem,2.55vw,1.7rem)] font-semibold tracking-[0.08em]">
          {title}
        </div>
      </div>
    )
  }

  return (
    <div className="grid h-full w-full grid-cols-[1fr_1fr] overflow-hidden px-[clamp(0.65rem,1.65vw,1.25rem)] py-[clamp(0.45rem,1.15vw,0.9rem)] text-center leading-tight">
      <div className="flex min-w-0 flex-col overflow-hidden pr-[clamp(0.35rem,0.95vw,0.8rem)]">
        <div className="mx-auto max-w-full shrink-0 truncate border-b border-current px-[clamp(0.2rem,0.6vw,0.46rem)] pb-[clamp(0.05rem,0.16vw,0.12rem)] text-[clamp(0.64rem,1.24vw,0.96rem)] font-semibold tracking-[0.08em]">
          {title}
        </div>

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
            previousClose={detail.stockPreviousClose}
            purchasePrice={detail.stockPurchasePrice}
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
        <div className="mx-auto max-w-full shrink-0 truncate border-b border-current px-[clamp(0.24rem,0.72vw,0.55rem)] pb-[clamp(0.05rem,0.2vw,0.14rem)] text-[clamp(0.72rem,1.55vw,1.05rem)] font-semibold tracking-[0.08em]">
          {title}
        </div>

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
            previousClose={detail.stockPreviousClose}
            purchasePrice={detail.stockPurchasePrice}
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
        <div className="max-w-full truncate text-[clamp(1rem,2.55vw,1.7rem)] font-semibold tracking-[0.08em]">
          {title}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden px-[clamp(0.75rem,1.9vw,1.5rem)] pt-[clamp(0.75rem,1.95vw,1.45rem)] pb-[clamp(0.8rem,2vw,1.55rem)] text-center leading-tight">
      <div className="mx-auto max-w-full shrink-0 truncate border-b border-current px-[clamp(0.24rem,0.72vw,0.55rem)] pb-[clamp(0.05rem,0.2vw,0.14rem)] text-[clamp(0.78rem,1.8vw,1.18rem)] font-semibold tracking-[0.08em]">
        {title}
      </div>

      <div className="shrink-0 pt-[clamp(0.55rem,1.25vw,0.95rem)] text-[clamp(0.56rem,1.22vw,0.78rem)] font-semibold tracking-[0.08em]">
        {mirrorStockRangeLabel(detail.stockChartRange, language)}
      </div>

      <div className="min-h-0 flex-1 px-[clamp(0.45rem,1.15vw,0.85rem)] pt-[clamp(0.45rem,1vw,0.8rem)] pb-[clamp(0.55rem,1.35vw,1rem)]">
        <MirrorStockChart
          series={detail.stockSeries}
          previousClose={detail.stockPreviousClose}
          purchasePrice={detail.stockPurchasePrice}
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

    const detail = snapshot.detailsBySlot[String(slot)] ?? frameModuleDetail(module, slot, snapshot.modulesJson, language, snapshot.cells)
    const cfg = moduleConfigForSlot(module, slot, snapshot.cells, snapshot.modulesJson)

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

    if ((module === 'groceries' || module === 'reminders') && size === 'small') {
      const isGroceries = module === 'groceries'
      const visibleItems = isGroceries ? mirrorGroceriesVisibleItems(detail) : mirrorReminderItems(detail)
      const overflowLabel = isGroceries ? mirrorGroceriesOverflowLabel(detail, language) : ''
      const header = isGroceries ? mirrorGroceriesHeader(detail, language) : mirrorRemindersHeader(detail, language)
      const emptyMessage = isGroceries ? mirrorGroceriesEmptyMessage(language) : mirrorRemindersEmptyMessage(language)

      const hasVisibleItems = visibleItems.length > 0
      const headerOffsetStyle = {
        transform: hasVisibleItems
          ? 'translateY(clamp(5px, 0.7vw, 8px))'
          : 'translateY(clamp(1px, 0.25vw, 3px))',
      }
      const contentOffsetStyle = { transform: 'translateY(clamp(3px, 0.45vw, 5px))' }

      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-[clamp(0.22rem,0.65vw,0.42rem)] px-[clamp(0.45rem,1.2vw,0.8rem)] py-[clamp(0.35rem,0.9vw,0.55rem)] text-center leading-none">
          <div
            className="max-w-full truncate border-b border-current pb-[clamp(0.06rem,0.18vw,0.12rem)] text-[clamp(0.72rem,1.8vw,1.08rem)] font-semibold tracking-[0.08em]"
            style={headerOffsetStyle}
            title={header}
          >
            {header}
          </div>

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

    if (module === 'surf' && size === 'small' && detail.isTodaysBest) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-[clamp(0.25rem,0.9vw,0.55rem)] px-3 text-center leading-tight">
          <div className="max-w-full truncate text-[clamp(0.62rem,1.45vw,0.9rem)] font-semibold tracking-[0.18em] uppercase">
            Todays best
          </div>
          <div className="max-w-full truncate text-[clamp(0.95rem,2.7vw,1.55rem)] font-semibold tracking-[0.14em] uppercase">
            {detail.secondary || detail.primary}
          </div>
          {detail.tertiary && (
            <div className="max-w-full truncate text-[clamp(0.58rem,1.25vw,0.8rem)] tracking-[0.12em]" style={{ color: mutedColor }}>
              {detail.tertiary}
            </div>
          )}
        </div>
      )
    }

    if (module === 'surf' && size === 'medium') {
      const rating = detail.rating ?? Number(detail.primary)
      const waveRange = detail.waveRange || detail.tertiary || '--'
      const spotName = detail.secondary || detail.primary || 'Surf'

      return (
        <div className="relative flex h-full w-full flex-col px-[clamp(0.7rem,2.2vw,1.6rem)] py-[clamp(0.45rem,1.5vw,1.1rem)] text-center leading-tight">
          {detail.isTodaysBest && (
            <div className="absolute left-[clamp(0.45rem,1.4vw,0.9rem)] top-[clamp(0.3rem,0.9vw,0.65rem)] max-w-[52%] truncate text-[clamp(0.45rem,1vw,0.68rem)] font-semibold tracking-[0.16em]" style={{ color: mutedColor }}>
              Best next 4h:
            </div>
          )}

          <div className="mx-auto max-w-[78%] truncate border-b border-current pb-[clamp(0.12rem,0.4vw,0.24rem)] text-[clamp(0.72rem,1.8vw,1.08rem)] font-semibold tracking-[0.14em] uppercase" style={{ borderColor: textColor }}>
            {spotName}
          </div>

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

    const primarySize = size === 'large' ? 'text-[clamp(1.8rem,7vw,4.5rem)]' : 'text-[clamp(1rem,3vw,2rem)]'
    const secondarySize = size === 'large' ? 'text-[clamp(0.85rem,2vw,1.4rem)]' : 'text-[clamp(0.65rem,1.6vw,1rem)]'

    return (
      <div className="max-w-full px-3 text-center leading-tight">
        <div className={`${primarySize} font-semibold tracking-[0.14em] uppercase truncate`}>{detail.primary}</div>
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

      const { data: members, error: membersError } = await supabase
        .from('device_members')
        .select('device_id, role')
        .eq('user_id', session.user.id)
        .order('device_id', { ascending: true })

      if (membersError) {
        onFramesChanged([])
        return
      }

      const memberRows = (members || []) as Array<{ device_id: string; role: string | null }>
      const deviceIds = memberRows.map((m) => m.device_id).filter(Boolean)

      const statusMap = await fetchDeviceStatusMap(deviceIds)

      const merged: MemberRow[] = memberRows.map((m) => ({
        device_id: m.device_id,
        role: m.role,
        current_version: statusMap.get(m.device_id)?.current_version ?? null,
        battery_percent: statusMap.get(m.device_id)?.battery_percent ?? null,
        battery_voltage: statusMap.get(m.device_id)?.battery_voltage ?? null,
        is_charging: statusMap.get(m.device_id)?.is_charging ?? null,
        is_usb_present: statusMap.get(m.device_id)?.is_usb_present ?? null,
      }))

      onFramesChanged(merged)
    } finally {
      setLoading(false)
    }
  }

async function addFrame() {
  const wasEmpty = frames.length === 0

  const code = prompt(t.addFramePrompt)
  if (!code) return
  const cleaned = code.trim().toUpperCase()

  const { data, error } = await supabase.rpc('claim_pair_code', { p_code: cleaned })
  if (error) return alert(error.message)
  if (data !== true) return alert(t.invalidPairCode)

  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData.session

  if (!session) {
    await reload()
    return
  }

  const { data: members, error: membersError } = await supabase
    .from('device_members')
    .select('device_id, role')
    .eq('user_id', session.user.id)
    .order('device_id', { ascending: true })

  if (membersError) {
    await reload()
    alert(t.frameAdded)
    return
  }

  const memberRows = (members || []) as Array<{ device_id: string; role: string | null }>
  const deviceIds = memberRows.map((m) => m.device_id).filter(Boolean)

  const statusMap = await fetchDeviceStatusMap(deviceIds)

  const merged: MemberRow[] = memberRows.map((m) => ({
    device_id: m.device_id,
    role: m.role,
    current_version: statusMap.get(m.device_id)?.current_version ?? null,
    battery_percent: statusMap.get(m.device_id)?.battery_percent ?? null,
    battery_voltage: statusMap.get(m.device_id)?.battery_voltage ?? null,
    is_charging: statusMap.get(m.device_id)?.is_charging ?? null,
    is_usb_present: statusMap.get(m.device_id)?.is_usb_present ?? null,
  }))

  onFramesChanged(merged)

  if (wasEmpty && merged.length > 0) {
    onSelectDevice(merged[0].device_id)
  }

  alert(t.frameAdded)
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

        const out: SurfCfg = { id, spot, spotId }
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
  onPicked: (cfgPatch: { spot: string; spotId: string }) => void
  hideTodaysBest?: boolean
}) {
  const [query, setQuery] = useState('')
  const [spots, setSpots] = useState<SpotItem[]>([])
  const [loading, setLoading] = useState(false)
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

        if (!cancelled) {
          setSpots(
            hideTodaysBest
              ? list.filter((s) => String(s.spotId || '').trim() !== '__todays_best__')
              : list
          )
        }
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
            filtered.map((s) => (
              <button
                key={`${s.spotId || 'label'}-${s.label}`}
                onClick={() => onPicked({ spot: s.label, spotId: s.spotId })}
                className="w-full text-left px-4 py-4 border-b border-[color:var(--bd-10)] last:border-b-0 hover:bg-[color:var(--panel-05)]"
              >
<div className="text-[color:var(--fg-90)] text-base font-medium">
  {language === 'no' && isTodaysBestLabel(s.label) ? 'Dagens Beste' : s.label}
</div>
              </button>
            ))
          )}
        </div>
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
