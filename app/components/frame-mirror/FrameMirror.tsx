'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { FRAME_CANVAS, getFrameCells, getFrameDividers, type FrameCellRect, type FrameLayoutKey } from '@/app/lib/frameLayout'

type MirrorModuleKey = 'date' | 'weather' | 'surf' | 'reminders' | 'countdown' | 'soccer' | 'stocks' | 'groceries'

type FrameConfigPayload = {
  settings_json?: {
    layout?: FrameLayoutKey
    cells?: { slot: number; module: string }[]
    modules?: Record<string, unknown>
    language?: 'en' | 'no'
  }
}

type BatteryStatus = { battery_percent: number | null; is_charging: boolean | null }

type FrameMirrorFallback = {
  layout: FrameLayoutKey
  cells: Record<number, MirrorModuleKey | null>
  modules: Record<string, unknown>
  language: 'en' | 'no'
  batteryPercent?: number | null
  isCharging?: boolean | null
}

function normalizeLayout(value: unknown): FrameLayoutKey {
  return value === 'pyramid' || value === 'square' || value === 'full' ? value : 'default'
}

function moduleBase(moduleName: string): MirrorModuleKey | null {
  const base = String(moduleName || '').split(':')[0].trim().toLowerCase()
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
    return base
  }
  return null
}

function normalizePercent(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.min(100, Math.max(0, Math.round(n)))
}

function normalizeBool(value: unknown) {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true') return true
  if (value === 0 || value === '0' || value === 'false') return false
  return null
}

function usePhoneLandscapeMirror() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const compute = () => {
      const width = window.innerWidth || 0
      const height = window.innerHeight || 0
      const landscape = width > height
      const minSide = Math.min(width, height)
      const maxSide = Math.max(width, height)
      const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
      const phoneSized = minSide <= 520 && maxSide <= 960
      setActive(Boolean(landscape && phoneSized && coarse))
    }

    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('orientationchange', compute)
    const mq = window.matchMedia?.('(orientation: landscape)')
    mq?.addEventListener?.('change', compute)

    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('orientationchange', compute)
      mq?.removeEventListener?.('change', compute)
    }
  }, [])

  return active
}

function useCanvasScale(active: boolean) {
  const [scale, setScale] = useState(1)

  useEffect(() => {
    if (!active) return

    const compute = () => {
      const width = window.innerWidth || FRAME_CANVAS.width
      const height = window.innerHeight || FRAME_CANVAS.height
      setScale(Math.min(width / FRAME_CANVAS.width, height / FRAME_CANVAS.height))
    }

    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('orientationchange', compute)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('orientationchange', compute)
    }
  }, [active])

  return scale
}

export default function FrameMirror({ activeDeviceId, fallback }: { activeDeviceId: string | null; fallback: FrameMirrorFallback }) {
  const isActive = usePhoneLandscapeMirror()
  const scale = useCanvasScale(isActive)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [payload, setPayload] = useState<FrameConfigPayload | null>(null)
  const [status, setStatus] = useState<BatteryStatus>({
    battery_percent: fallback.batteryPercent ?? null,
    is_charging: fallback.isCharging ?? null,
  })

  useEffect(() => {
    if (!isActive) return
    document.body.classList.add('frame-mirror-active')
    const el = viewportRef.current
    if (el && !document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen().catch(() => undefined)
    }
    return () => {
      document.body.classList.remove('frame-mirror-active')
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => undefined)
      }
    }
  }, [isActive])

  useEffect(() => {
    if (!isActive || !activeDeviceId) return
    let cancelled = false

    async function load() {
      try {
        const [configResp, statusResp] = await Promise.all([
          fetch(`/api/device/frame-config?device_id=${encodeURIComponent(activeDeviceId!)}`, { cache: 'no-store' }),
          fetch(`/api/device/status?device_id=${encodeURIComponent(activeDeviceId!)}`, { cache: 'no-store' }),
        ])

        if (!cancelled && configResp.ok) setPayload(await configResp.json())
        if (!cancelled && statusResp.ok) {
          const s = await statusResp.json()
          setStatus({ battery_percent: normalizePercent(s?.battery_percent), is_charging: normalizeBool(s?.is_charging) })
        }
      } catch {
        // Keep rendering the last known app state if network or auth is temporarily unavailable.
      }
    }

    load()
    const timer = window.setInterval(load, 15000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeDeviceId, isActive])

  const model = useMemo(() => {
    const settings = payload?.settings_json
    const layout = normalizeLayout(settings?.layout ?? fallback.layout)
    const firmwareCells = Array.isArray(settings?.cells) ? settings.cells : null
    const cells = new Map<number, string>()

    if (firmwareCells) {
      for (const c of firmwareCells) cells.set(Number(c.slot), String(c.module || ''))
    } else {
      Object.entries(fallback.cells).forEach(([slot, mod]) => cells.set(Number(slot), mod || ''))
    }

    return {
      layout,
      language: settings?.language === 'no' ? 'no' : fallback.language,
      modules: settings?.modules && typeof settings.modules === 'object' ? settings.modules : fallback.modules,
      cells,
    }
  }, [fallback, payload])

  if (!isActive) return null

  return (
    <div ref={viewportRef} className="frameMirrorViewport" aria-label="Frame Mirror" role="img">
      <FrameCanvas scale={scale} layout={model.layout} cells={model.cells} modules={model.modules} language={model.language} status={status} />
    </div>
  )
}

function FrameCanvas({
  scale,
  layout,
  cells,
  modules,
  language,
  status,
}: {
  scale: number
  layout: FrameLayoutKey
  cells: Map<number, string>
  modules: Record<string, unknown>
  language: 'en' | 'no'
  status: BatteryStatus
}) {
  return (
    <div className="frameMirrorCanvas" style={{ transform: `scale(${scale})` }} onContextMenu={(e) => e.preventDefault()}>
      {getFrameCells(layout).map((cell) => (
        <FrameCell key={cell.slot} cell={cell} moduleName={cells.get(cell.slot) || ''} modules={modules} language={language} />
      ))}

      <svg className="frameMirrorDividers" width={FRAME_CANVAS.width} height={FRAME_CANVAS.height} aria-hidden="true">
        {getFrameDividers(layout).map((d, idx) =>
          d.type === 'h' ? (
            <line key={idx} x1={d.x1} x2={d.x2} y1={d.y} y2={d.y} />
          ) : (
            <line key={idx} x1={d.x} x2={d.x} y1={d.y1} y2={d.y2} />
          )
        )}
      </svg>

      <BatteryOverlay status={status} />
    </div>
  )
}

function FrameCell({ cell, moduleName, modules, language }: { cell: FrameCellRect; moduleName: string; modules: Record<string, unknown>; language: 'en' | 'no' }) {
  const base = moduleBase(moduleName)
  return (
    <div
      className={`frameMirrorCell frameMirrorCell--${cell.size}`}
      style={{ left: cell.x, top: cell.y, width: cell.width, height: cell.height }}
      aria-hidden="true"
    >
      {!base ? <EmptyCell size={cell.size} /> : <ModuleRenderer base={base} moduleName={moduleName} cell={cell} modules={modules} language={language} />}
    </div>
  )
}

function EmptyCell({ size }: { size: FrameCellRect['size'] }) {
  return <div className={`frameMirrorPlus ${size === 'small' ? 'frameMirrorPlus--small' : ''}`}>+</div>
}

function ModuleRenderer({ base, moduleName, cell, modules, language }: { base: MirrorModuleKey; moduleName: string; cell: FrameCellRect; modules: Record<string, unknown>; language: 'en' | 'no' }) {
  const id = Number(moduleName.split(':')[1] || 1)
  if (base === 'date') return <FrameDate cell={cell} modules={modules} language={language} />
  if (base === 'weather') return <FrameWeather cfg={findById(modules.weather, id)} cell={cell} />
  if (base === 'surf') return <FrameSurf cfg={findById(modules.surf, id) || asRecord(modules.surf_settings)} cell={cell} />
  if (base === 'stocks') return <FrameStocks cfg={findById(modules.stocks, id)} cell={cell} />
  if (base === 'groceries') return <FrameGroceries cfg={modules.groceries} cell={cell} language={language} />
  if (base === 'reminders') return <FrameList title={language === 'no' ? 'PÅMINNELSER' : 'REMINDERS'} rows={extractRows(modules.reminders)} cell={cell} />
  if (base === 'countdown') return <FrameList title={language === 'no' ? 'NEDTELLING' : 'COUNTDOWN'} rows={extractRows(modules.countdown)} cell={cell} />
  if (base === 'soccer') return <FrameSoccer cfg={findById(modules.soccer, id)} cell={cell} />
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function textValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function findById(raw: unknown, id: number): Record<string, unknown> | null {
  if (Array.isArray(raw)) {
    const found = raw.find((item) => Number(asRecord(item)?.id) === id) ?? raw[0]
    return asRecord(found)
  }
  return asRecord(raw)
}

function extractRows(raw: unknown) {
  const record = asRecord(raw)
  const source = Array.isArray(record?.items) ? record.items : Array.isArray(raw) ? raw : []
  return source
    .map((item) => {
      const row = asRecord(item)
      return row ? textValue(row.title || row.name || row.label) : textValue(item)
    })
    .filter(Boolean)
    .slice(0, 5)
}

function FrameDate({ cell, modules, language }: { cell: FrameCellRect; modules: Record<string, unknown>; language: 'en' | 'no' }) {
  const now = new Date()
  const weekday = now.toLocaleDateString(language === 'no' ? 'nb-NO' : 'en-US', { weekday: 'long' })
  const date = now.toLocaleDateString(language === 'no' ? 'nb-NO' : 'en-US', { month: 'short', day: 'numeric' })
  const dateModule = asRecord(modules.date)
  const holidays = Array.isArray(dateModule?.holidays) ? dateModule.holidays : []
  return (
    <div className="frameModule frameModule--center">
      <div className={cell.size === 'small' ? 'frameTextMedium' : 'frameTextHuge'}>{weekday}</div>
      <div className="frameTextSmall">{date}</div>
      {cell.size !== 'small' && textValue(asRecord(holidays[0])?.name) && <div className="frameTextTiny">{textValue(asRecord(holidays[0])?.name)}</div>}
    </div>
  )
}

function FrameWeather({ cfg, cell }: { cfg: Record<string, unknown> | null; cell: FrameCellRect }) {
  return (
    <div className="frameModule frameModule--weather">
      <div>
        <div className="frameTextTiny">WEATHER</div>
        <div className={cell.size === 'small' ? 'frameTextMedium' : 'frameTextHuge'}>{textValue(cfg?.label) || '—'}</div>
      </div>
      <div className="frameWeatherIcon">☁</div>
    </div>
  )
}

function FrameSurf({ cfg, cell }: { cfg: Record<string, unknown> | null; cell: FrameCellRect }) {
  return <FrameMetric title="SURF" main={textValue(cfg?.label) || textValue(cfg?.spotLabel) || 'Surf'} sub={cell.size === 'small' ? '' : 'Swell · Wind · Tide'} />
}

function FrameStocks({ cfg, cell }: { cfg: Record<string, unknown> | null; cell: FrameCellRect }) {
  const title = textValue(cfg?.symbol) || textValue(cfg?.name) || 'STOCKS'
  const range = textValue(cfg?.chartRange)
  return (
    <div className="frameModule frameModule--stock">
      <div>
        <div className="frameTextTiny">INVESTMENTS</div>
        <div className={cell.size === 'small' ? 'frameTextMedium' : 'frameTextHuge'}>{title}</div>
        {range && <div className="frameTextTiny">{range.toUpperCase()}</div>}
      </div>
      {cell.size !== 'small' && <div className="frameSparkline" />}
    </div>
  )
}

function FrameGroceries({ cfg, cell, language }: { cfg: unknown; cell: FrameCellRect; language: 'en' | 'no' }) {
  const rows = extractRows(cfg)
  return <FrameList title={language === 'no' ? 'HANDLELISTE' : 'GROCERIES'} rows={rows} cell={cell} />
}

function FrameSoccer({ cfg, cell }: { cfg: Record<string, unknown> | null; cell: FrameCellRect }) {
  return <FrameMetric title="SOCCER" main={textValue(cfg?.teamName) || textValue(cfg?.team) || 'Team'} sub={cell.size === 'small' ? '' : 'Fixtures · Table'} />
}

function FrameMetric({ title, main, sub }: { title: string; main: string; sub?: string }) {
  return (
    <div className="frameModule frameModule--center">
      <div className="frameTextTiny">{title}</div>
      <div className="frameTextLarge">{main}</div>
      {sub && <div className="frameTextTiny">{sub}</div>}
    </div>
  )
}

function FrameList({ title, rows, cell }: { title: string; rows: string[]; cell: FrameCellRect }) {
  const max = cell.size === 'small' ? 2 : cell.size === 'medium' ? 4 : 6
  return (
    <div className="frameModule frameModule--list">
      <div className="frameTextTiny">{title}</div>
      <div className="frameListRows">
        {rows.slice(0, max).map((row, idx) => (
          <div className="frameListRow" key={`${row}-${idx}`}>{row}</div>
        ))}
        {rows.length === 0 && <div className="frameListRow">—</div>}
      </div>
    </div>
  )
}

function BatteryOverlay({ status }: { status: BatteryStatus }) {
  if (status.battery_percent == null) return null
  return (
    <div className="frameBatteryOverlay">
      <span>{status.battery_percent}%</span>
      <span className="frameBatteryIcon"><span style={{ width: `${Math.max(8, status.battery_percent)}%` }} /></span>
      {status.is_charging === true && <span className="frameChargeIcon">⚡</span>}
    </div>
  )
}
