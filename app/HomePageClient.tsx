// app/page.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from './lib/supabase'
import { findSpotByLabel } from './lib/surf/spots'
import SoccerTeamSheet from './components/SoccerTeamSheet'

type CoreTabKey = 'frame' | 'settings'
type ModuleKey = 'date' | 'weather' | 'surf' | 'reminders' | 'countdown' | 'soccer'
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

type SettingsJson = {
  theme?: 'dark' | 'light'
  language?: AppLanguage
  fontSize?: AppFontSize
  layout?: LayoutKey
  cells?: { slot: number; module: string }[]
  modules?: Record<string, any>
}

type MemberRow = {
  device_id: string
  role: string | null
  current_version?: string | null
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
    base === 'soccer'
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

function isSpotReadyForExperience(spotLabel: string, spotId: string) {
  const label = String(spotLabel || '').trim()
  const id = String(spotId || '').trim()
  if (!label || label === 'Not set') return false
  if (!id) return false
  if (id === '__todays_best__') return false
  return true
}

export default function HomePage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<TabKey>('frame')
  const [dirty, setDirty] = useState(false)

  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null)
  const [frames, setFrames] = useState<MemberRow[]>([])
  const [booting, setBooting] = useState(true)

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
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme

    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
    if (meta) meta.content = theme === 'dark' ? '#061b24' : '#eef2f6'
  }, [theme])

  useEffect(() => {
    if (!activeDeviceId) return
    if (activeTab !== 'frame') return

    loadDeviceStatus(activeDeviceId)

    const t = window.setInterval(() => {
      loadDeviceStatus(activeDeviceId)
    }, 15000)

    return () => window.clearInterval(t)
  }, [activeDeviceId, activeTab])

  useEffect(() => {
    return () => {
      if (saveToastTimerRef.current) window.clearTimeout(saveToastTimerRef.current)
    }
  }, [])

  const layoutMeta = allLayouts(language).find((l) => l.key === layoutKey) || allLayouts(language)[0]

  const stickySettingsRef = useRef(false)
  const preferInstantScrollRef = useRef(false)
  const autoSaveTimerRef = useRef<number | null>(null)
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
    const mods = Object.values(cellsByLayout[layoutKey]).filter(Boolean) as ModuleKey[]

    return Array.from(new Set(mods))
      .filter((m) => m !== 'date')
      .map((m) => ({ key: m as ModuleKey, label: moduleLabel(language, m) }))
  }, [cellsByLayout, layoutKey, language])

  const tabs = useMemo(() => {
    return [
      { key: 'frame' as const, label: tx(language).frame },
      ...dynamicTabs,
      { key: 'settings' as const, label: tx(language).settings },
    ]
  }, [dynamicTabs, language])

  const savedStateRef = useRef<string>('')
  const layoutModuleMemoryRef = useRef<(ModuleKey | null)[]>([])

  function serializeComparableState(args: {
    theme: 'dark' | 'light'
    language: AppLanguage
    fontSize: AppFontSize
    layoutKey: LayoutKey
    cellsByLayout: Record<LayoutKey, Record<number, ModuleKey | null>>
    modulesJson: Record<string, any>
  }) {
    const normalizedModules = normalizeModulesForSave(args.modulesJson)

    return JSON.stringify({
      theme: args.theme,
      language: args.language,
      fontSize: args.fontSize,
      layout: args.layoutKey,
      cells: cellsMapToArray(args.cellsByLayout[args.layoutKey]),
      modules: normalizedModules,
    })
  }

  function refreshDirtyState(next?: {
    theme?: 'dark' | 'light'
    language?: AppLanguage
    fontSize?: AppFontSize
    layoutKey?: LayoutKey
    cellsByLayout?: Record<LayoutKey, Record<number, ModuleKey | null>>
    modulesJson?: Record<string, any>
  }) {
    const serialized = serializeComparableState({
      theme: next?.theme ?? theme,
      language: next?.language ?? language,
      fontSize: next?.fontSize ?? fontSize,
      layoutKey: next?.layoutKey ?? layoutKey,
      cellsByLayout: next?.cellsByLayout ?? cellsByLayout,
      modulesJson: next?.modulesJson ?? modulesJson,
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
  }) {
    refreshDirtyState(next)
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
      if (diffSec < 10) return 'Oppdatert akkurat nå'
      if (diffSec < 60) return `Oppdatert for ${diffSec} sekunder siden`

      const diffMin = Math.floor(diffSec / 60)
      if (diffMin < 60) return `Oppdatert for ${diffMin} minutt${diffMin === 1 ? '' : 'er'} siden`

      const diffHr = Math.floor(diffMin / 60)
      if (diffHr < 24) return `Oppdatert for ${diffHr} time${diffHr === 1 ? '' : 'r'} siden`

      const diffDay = Math.floor(diffHr / 24)
      return `Oppdatert for ${diffDay} dag${diffDay === 1 ? '' : 'er'} siden`
    }

    if (diffSec < 10) return 'Updated just now'
    if (diffSec < 60) return `Updated ${diffSec} seconds ago`

    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `Updated ${diffMin} minute${diffMin === 1 ? '' : 's'} ago`

    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `Updated ${diffHr} hour${diffHr === 1 ? '' : 's'} ago`

    const diffDay = Math.floor(diffHr / 24)
    return `Updated ${diffDay} day${diffDay === 1 ? '' : 's'} ago`
  }

  async function loadDeviceStatus(deviceId: string) {
    try {
      const resp = await fetch(`/api/device/status?device_id=${encodeURIComponent(deviceId)}`, { cache: 'no-store' })
      if (!resp.ok) return

      const data = await resp.json()
      const iso = data?.last_refresh_at ? String(data.last_refresh_at) : ''

      if (!iso) {
        setLastUpdatedAt(null)
        return
      }

      const text = formatRelative(iso)
      setLastUpdatedAt(text)
    } catch {
      setLastUpdatedAt(null)
    }
  }

  async function loadDeviceSettings(deviceId: string) {
    const { data, error } = await supabase
      .from('device_settings')
      .select('settings_json')
      .eq('device_id', deviceId)
      .maybeSingle()

    if (error) return

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

    setTheme(nextTheme)
    setLanguage(nextLanguage)
    setFontSize(nextFontSize)
    setCellsByLayout(nextCellsByLayout)
    setLayoutKey(nextLayout)
    setModulesJson(normalizedModules)

    savedStateRef.current = JSON.stringify({
      theme: nextTheme,
      language: nextLanguage,
      fontSize: nextFontSize,
      layout: nextLayout,
      cells: cellsMapToArray(nextCellsByLayout[nextLayout]),
      modules: normalizedModules,
    })

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

    ;(async () => {
      setBooting(true)

      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session

      if (!session) {
        setFrames([])
        setActiveDeviceId(null)
        setBooting(false)
        router.replace('/login')
        return
      }

      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (!nextSession) router.replace('/login')
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

      const list = (members || []) as MemberRow[]
      setFrames(list)

      const saved = typeof window !== 'undefined' ? localStorage.getItem('activeDeviceId') : null
      const savedExists = saved && list.some((x) => x.device_id === saved)
      const selected = savedExists ? saved! : (list[0]?.device_id ?? null)

      setActiveDeviceId(selected)

      if (selected) {
        await loadDeviceSettings(selected)
      }

      setBooting(false)
    })()

    return () => {
      if (unsub) unsub.unsubscribe()
    }
  }, [router])

  async function selectDevice(id: string) {
    setActiveDeviceId(id)
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
      })

      setDirty(false)
      if (showToast) showSavedToast(tx(language).saved)
    } catch (e: any) {
      alert(String(e?.message || e))
    } finally {
      setPersisting(false)
    }
  }

useEffect(() => {
  if (!isLoadedRef.current) return
  if (!activeDeviceId) return
  if (!dirty) return
  if (activeTab === 'frame') return

  if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current)

  autoSaveTimerRef.current = window.setTimeout(() => {
    persistSettings(true)
  }, 550)

  return () => {
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current)
  }
}, [dirty, theme, language, fontSize, layoutKey, cellsByLayout, modulesJson, activeDeviceId, activeTab])

  async function logout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const appBg = 'var(--app-bg)'
  const appText = 'text-[color:var(--fg)]'

async function handleSelectTab(k: TabKey) {
  preferInstantScrollRef.current = false
  stickySettingsRef.current = k === 'settings'

  if (activeTab !== 'frame' && k !== activeTab && dirty) {
    await persistSettings(true)
  }

  setActiveTab(k)
}

  return (
    <main className={`h-screen overflow-hidden ${appText} flex justify-center`} style={{ background: appBg }}>
      <div className="w-full max-w-[420px] h-full px-5 pt-10 pb-6 flex flex-col relative">
        {booting ? (
          <div className="flex-1 flex items-center justify-center text-[color:var(--fg-40)] tracking-widest">
            {tx(language).loadingFrame}
          </div>
        ) : (
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
      {lastUpdatedAt ?? ''}
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
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
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
        {layoutKey === 'default' && <LayoutDefault language={language} cells={cells} onCellTap={onCellTap} />}
        {layoutKey === 'pyramid' && <LayoutPyramid language={language} cells={cells} onCellTap={onCellTap} />}
        {layoutKey === 'square' && <LayoutSquare language={language} cells={cells} onCellTap={onCellTap} />}
        {layoutKey === 'full' && <LayoutFull language={language} cells={cells} onCellTap={onCellTap} />}
      </div>
    </div>
  )
}

function LayoutDefault({
  cells,
  onCellTap,
  language,
}: {
  cells: Record<number, ModuleKey | null>
  onCellTap: (slot: number) => void
  language: AppLanguage
}) {
  return (
    <FramePreview>
      <div className="h-1/2 flex flex-col">
        <div className="flex-1">
          <CellButton language={language} slot={0} size="small" module={cells[0]} onTap={onCellTap} />
        </div>
        <HLine />
        <div className="flex-1">
          <CellButton language={language} slot={1} size="small" module={cells[1]} onTap={onCellTap} />
        </div>
      </div>

      <HLine />

      <div className="h-1/2">
        <CellButton language={language} slot={2} size="large" module={cells[2]} onTap={onCellTap} />
      </div>
    </FramePreview>
  )
}

function LayoutPyramid({
  cells,
  onCellTap,
  language,
}: {
  cells: Record<number, ModuleKey | null>
  onCellTap: (slot: number) => void
  language: AppLanguage
}) {
  return (
    <FramePreview>
      <div className="h-1/2 flex flex-col">
        <div className="flex-1">
          <CellButton language={language} slot={0} size="small" module={cells[0]} onTap={onCellTap} />
        </div>
        <HLine />
        <div className="flex-1">
          <CellButton language={language} slot={1} size="small" module={cells[1]} onTap={onCellTap} />
        </div>
      </div>

      <HLine />

      <div className="h-1/2 grid grid-cols-[1fr_auto_1fr]">
        <CellButton language={language} slot={2} size="medium" module={cells[2]} onTap={onCellTap} />
        <VLine />
        <CellButton language={language} slot={3} size="medium" module={cells[3]} onTap={onCellTap} />
      </div>
    </FramePreview>
  )
}

function LayoutSquare({
  cells,
  onCellTap,
  language,
}: {
  cells: Record<number, ModuleKey | null>
  onCellTap: (slot: number) => void
  language: AppLanguage
}) {
  return (
    <FramePreview>
      <div className="h-full grid grid-rows-[1fr_auto_1fr]">
        <div className="grid grid-cols-[1fr_auto_1fr]">
          <CellButton language={language} slot={0} size="medium" module={cells[0]} onTap={onCellTap} />
          <VLine />
          <CellButton language={language} slot={1} size="medium" module={cells[1]} onTap={onCellTap} />
        </div>

        <HLine />

        <div className="grid grid-cols-[1fr_auto_1fr]">
          <CellButton language={language} slot={2} size="medium" module={cells[2]} onTap={onCellTap} />
          <VLine />
          <CellButton language={language} slot={3} size="medium" module={cells[3]} onTap={onCellTap} />
        </div>
      </div>
    </FramePreview>
  )
}

function LayoutFull({
  cells,
  onCellTap,
  language,
}: {
  cells: Record<number, ModuleKey | null>
  onCellTap: (slot: number) => void
  language: AppLanguage
}) {
  return (
    <FramePreview>
      <div className="h-full">
        <CellButton language={language} slot={0} size="large" module={cells[0]} onTap={onCellTap} />
      </div>
    </FramePreview>
  )
}

function CellButton({
  slot,
  module,
  onTap,
  language,
}: {
  slot: number
  size: CellSize
  module: ModuleKey | null | undefined
  onTap: (slot: number) => void
  language: AppLanguage
}) {
  const label = module ? moduleLabel(language, module) : '+'
  return (
    <button onClick={() => onTap(slot)} className="w-full h-full flex items-center justify-center">
      <div
        className={`tracking-widest ${
          module ? 'text-[color:var(--fg)] font-semibold text-lg' : 'text-[color:var(--fg-50)] text-2xl'
        }`}
      >
        {label}
      </div>
    </button>
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
  const options: ModuleKey[] = ['date', 'weather', 'surf', 'reminders', 'countdown', 'soccer']
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
          {options.map((m) => (
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

      let statusMap = new Map<string, string | null>()

      if (deviceIds.length > 0) {
        const { data: statuses } = await supabase
          .from('device_status')
          .select('device_id, current_version')
          .in('device_id', deviceIds)

        statusMap = new Map(
          ((statuses || []) as Array<{ device_id: string; current_version: string | null }>).map((s) => [
            s.device_id,
            s.current_version ?? null,
          ])
        )
      }

      const merged: MemberRow[] = memberRows.map((m) => ({
        device_id: m.device_id,
        role: m.role,
        current_version: statusMap.get(m.device_id) ?? null,
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

  let statusMap = new Map<string, string | null>()

  if (deviceIds.length > 0) {
    const { data: statuses } = await supabase
      .from('device_status')
      .select('device_id, current_version')
      .in('device_id', deviceIds)

    statusMap = new Map(
      ((statuses || []) as Array<{ device_id: string; current_version: string | null }>).map((s) => [
        s.device_id,
        s.current_version ?? null,
      ])
    )
  }

  const merged: MemberRow[] = memberRows.map((m) => ({
    device_id: m.device_id,
    role: m.role,
    current_version: statusMap.get(m.device_id) ?? null,
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

                <div className="text-xs opacity-70">{(f.role || 'member').toUpperCase()}</div>
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

function RemindersModuleSettingsTab({
  language,
  activeDeviceId,
}: {
  language: AppLanguage
  activeDeviceId: string | null
}) {
  const [reminders, setReminders] = useState<ReminderUiItem[]>([])
  const [loading, setLoading] = useState(false)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editingReminder, setEditingReminder] = useState<ReminderUiItem | null>(null)
  const [tagFilter, setTagFilter] = useState<ReminderTagFilter>('all')

  const [selectedDayYmd, setSelectedDayYmd] = useState<string | null>(null)

  const listRef = useRef<HTMLDivElement | null>(null)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)

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
        return
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

  function updateListFadeState() {
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

    updateListFadeState()

    const onScroll = () => updateListFadeState()
    el.addEventListener('scroll', onScroll, { passive: true })

    const ro = new ResizeObserver(() => updateListFadeState())
    ro.observe(el)

    const t1 = window.setTimeout(updateListFadeState, 50)
    const t2 = window.setTimeout(updateListFadeState, 180)

    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [reminders.length, loading, selectedDayYmd])

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
        <div className="mt-4 flex-1 min-h-0 flex flex-col">
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

            <div className="mt-4 grid grid-cols-7 text-center text-[11px] font-medium tracking-wide text-[color:var(--fg-55)]">
              {weekdayShort.map((x) => (
                <div key={x} className="h-5 flex items-center justify-center">
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
              <div className={`grid grid-cols-7 gap-y-0.5 ${calendarAnimClass}`}>
                {calendarCells.map((cell) => {
                  const showFilledBlue = cell.isSelected || (!selectedDayYmd && cell.isToday)
                  const showBlueTextOnly = selectedDayYmd && cell.isToday && !cell.isSelected

                  return (
                    <button
                      key={cell.ymd}
                      onClick={() => toggleSelectedDay(cell.ymd)}
                      className="h-10 flex items-center justify-center"
                    >
                      <div className="relative h-9 w-9 flex items-start justify-center">
                        <span
                          className={`mt-[1px] flex h-7 w-7 items-center justify-center rounded-full text-sm transition ${
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
                          <div className="absolute bottom-[1px] left-1/2 -translate-x-1/2 flex items-center justify-center gap-[3px]">
                            {Array.from({ length: Math.min(3, cell.dotCount) }).map((_, idx) => (
                              <span
                                key={idx}
                                className={`block w-[4px] h-[4px] rounded-full ${
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

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] tracking-widest text-[color:var(--fg-50)] uppercase">
                {selectedDayYmd ? (language === 'no' ? 'Valgt dag' : 'Selected day') : (language === 'no' ? 'Alle påminnelser' : 'All reminders')}
              </div>

              <div className="mt-1 text-sm text-[color:var(--fg-90)] truncate">
                {selectedDayYmd ? formatReminderDateLabel(language, selectedDayYmd) : (language === 'no' ? 'Viser alle datoer' : 'Showing all dates')}
              </div>
            </div>

            {selectedDayYmd && (
              <button
                onClick={() => setSelectedDayYmd(null)}
                className="shrink-0 h-8 px-3 rounded-xl border border-[color:var(--bd-15)] text-[color:var(--fg-70)] tracking-widest text-[11px]"
              >
                {language === 'no' ? 'TØM' : 'CLEAR'}
              </button>
            )}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {(['all', 'work', 'personal', 'sports', 'chores', 'event'] as ReminderTagFilter[]).map((opt) => {
              const active = tagFilter === opt
              return (
                <button
                  key={opt}
                  onClick={() => setTagFilter(opt)}
                  className={`h-9 rounded-xl border text-xs tracking-widest transition ${
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

          <div className="mt-3 relative rounded-3xl border border-[color:var(--bd-10)] bg-[color:var(--panel-05)] px-4 py-4 flex-1 min-h-0">
            <div ref={listRef} className="h-full overflow-y-auto no-scrollbar pr-1">
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
                <div className="space-y-2.5">
                  {sortedReminders.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[color:var(--fg-95)] text-[15px] leading-tight font-medium">
                        {formatReminderTitleWithTime(item)}
                        </div>

                        <div className="mt-0.5 text-[12px] text-[color:var(--fg-55)]">
  {`${formatReminderFullDateLabel(language, item.displayDate)}${
  normalizeReminderTime(item.time) ? ` • ${normalizeReminderTime(item.time)}` : ''
} • ${reminderRepeatLabel(language, item.repeat, item.customRepeatDays)}`}
</div>
                      </div>

                      <div className="shrink-0 flex flex-col gap-1.5">
                        <button
                          onClick={() => {
                            setEditingReminder(item)
                            setSheetOpen(true)
                          }}
                          className="h-7 px-3 rounded-lg border border-[color:var(--bd-20)] text-[10px] tracking-widest text-[color:var(--fg-70)]"
                        >
                          {language === 'no' ? 'REDIGER' : 'EDIT'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pt-5 pb-[20px] flex flex-col items-center relative z-20">
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
}: {
  language: AppLanguage
  activeDeviceId: string
  editingReminder: ReminderUiItem | null
  initialDate: string
  onClose: () => void
  onSaved: () => void | Promise<void>
  onDeleted: () => void | Promise<void>
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

            <button onClick={onClose} disabled={saving || deleting} className="text-[color:var(--fg-60)] text-xl">
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
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={saving || deleting}
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
              disabled={saving || deleting}
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

function CompleteReminderSheet({
  language,
  completing,
  repeating,
  occurrenceDate,
  onCancel,
  onConfirm,
}: {
  language: AppLanguage
  completing: boolean
  repeating: boolean
  occurrenceDate: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[color:var(--overlay-55)]">
      <div className="w-full max-w-[420px] rounded-t-3xl bg-[color:var(--sheet-bg)] border-t border-[color:var(--bd-10)] px-5 pt-5 pb-8">
        <div className="flex items-center justify-between">
          <div className="tracking-widest text-sm text-[color:var(--fg-70)]">
            {repeating
              ? language === 'no'
                ? 'FULLFØR FOREKOMST'
                : 'COMPLETE OCCURRENCE'
              : language === 'no'
                ? 'MARKER PÅMINNELSE SOM FERDIG'
                : 'MARK REMINDER DONE'}
          </div>
          <button onClick={onCancel} disabled={completing} className="text-[color:var(--fg-60)] text-xl">
            ✕
          </button>
        </div>

        <div className="mt-4 text-[color:var(--fg-90)] text-base font-medium">
          {repeating
            ? language === 'no'
              ? `Fullfør bare ${formatReminderFullDateLabel(language, occurrenceDate)}?`
              : `Complete only ${formatReminderFullDateLabel(language, occurrenceDate)}?`
            : language === 'no'
              ? 'Marker denne påminnelsen som ferdig?'
              : 'Mark this reminder as done?'}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3">
          <button
            onClick={onConfirm}
            disabled={completing}
            className={`h-12 rounded-2xl border tracking-widest text-sm ${
              completing
                ? 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]'
                : 'border-[#2aa3ff] text-[#2aa3ff]'
            }`}
          >
            {completing
              ? language === 'no'
                ? 'JOBBER…'
                : 'WORKING…'
              : repeating
                ? language === 'no'
                  ? 'FULLFØR FOREKOMST'
                  : 'COMPLETE OCCURRENCE'
                : language === 'no'
                  ? 'MARKER SOM FERDIG'
                  : 'MARK DONE'}
          </button>

          <button
            onClick={onCancel}
            disabled={completing}
            className="h-12 rounded-2xl border border-[color:var(--bd-15)] text-[color:var(--fg-60)] tracking-widest text-sm"
          >
            {language === 'no' ? 'AVBRYT' : 'CANCEL'}
          </button>
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

        {surfView === 'main' && showBottomFade && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 h-12 bg-gradient-to-t from-[color:var(--app-bg)] to-transparent" />
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
                onDeleted={() => {
                  setExperienceListVersion((v) => v + 1)
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
  onDeleted,
  onExpandedLatest,
}: {
  language: AppLanguage
  refreshKey: number
  onOpenLog: () => void
  onEditExperience: (experienceId: string) => void
  onDeleted: () => void
  onExpandedLatest: () => void
}) {
  const [items, setItems] = useState<SurfExperienceRowData[]>([])
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [latestOpen, setLatestOpen] = useState(false)

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
        .limit(4)

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

  async function deleteExperience(id: string) {
    try {
      setDeletingId(id)

      const { error } = await supabase.from('user_surf_experiences').delete().eq('id', id)
      if (error) {
        alert(error.message)
        return
      }

      setItems((prev) => prev.filter((x) => x.id !== id))
      onDeleted()
    } finally {
      setDeletingId(null)
      setConfirmDeleteId(null)
    }
  }

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
              <div className="tracking-widest text-xs text-[color:var(--fg-50)]">{language === 'no' ? 'SISTE 4' : 'LATEST 4'}</div>
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
            <div className="mt-3 space-y-2">
              {loading ? (
                <div className="text-sm text-[color:var(--fg-50)]">{language === 'no' ? 'Laster…' : 'Loading…'}</div>
              ) : items.length === 0 ? (
                <div className="text-sm text-[color:var(--fg-50)]">{language === 'no' ? 'Ingen erfaringer logget ennå.' : 'No experiences logged yet.'}</div>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-[color:var(--bd-10)] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[color:var(--fg-90)] font-medium truncate">{item.spot || '--'}</div>
                        <div className="mt-1 text-xs text-[color:var(--fg-50)]">{formatTimeLabel(language, new Date(item.logged_at))}</div>
                        <div className="mt-1 text-sm text-[color:var(--fg-70)]">{formatFeelingFromRating(language, item.rating_1_6)}</div>
                      </div>

                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          onClick={() => onEditExperience(item.id)}
                          className="h-9 px-3 rounded-xl border border-[color:var(--bd-15)] text-[color:var(--fg-70)] tracking-widest text-xs"
                        >
                          {language === 'no' ? 'REDIGER' : 'EDIT'}
                        </button>

                        <button
                          onClick={() => setConfirmDeleteId(item.id)}
                          disabled={deletingId === item.id}
                          className={`h-9 px-3 rounded-xl border tracking-widest text-xs ${
                            deletingId === item.id
                              ? 'border-[color:var(--bd-10)] text-[color:var(--fg-40)]'
                              : 'border-[color:var(--danger-bd)] text-[color:var(--danger)]'
                          }`}
                        >
                          {deletingId === item.id ? '…' : language === 'no' ? 'SLETT' : 'DELETE'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {confirmDeleteId && (
        <DeleteExperienceSheet
          language={language}
          deleting={deletingId === confirmDeleteId}
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => deleteExperience(confirmDeleteId)}
        />
      )}
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
                disabled={saving}
                className="w-full h-12 rounded-2xl border border-[color:var(--bd-10)] text-[color:var(--fg-60)] tracking-widest text-sm"
              >
                {language === 'no' ? 'AVBRYT' : 'CANCEL'}
              </button>
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

function FramePreview({ children }: { children: React.ReactNode }) {
  return <div className="w-full h-full flex flex-col">{children}</div>
}
function HLine() {
  return <div className="h-px bg-[color:var(--bd-15)]" />
}
function VLine() {
  return <div className="w-px bg-[color:var(--bd-15)]" />
}
