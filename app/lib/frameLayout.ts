export type FrameLayoutKey = 'default' | 'pyramid' | 'square' | 'full'
export type FrameCellSize = 'small' | 'medium' | 'large' | 'xl'

export type FrameCellRect = {
  x: number
  y: number
  width: number
  height: number
  slot: number
  size: FrameCellSize
}

export type FrameDivider =
  | { type: 'h'; x1: number; x2: number; y: number }
  | { type: 'v'; x: number; y1: number; y2: number }

// Mirrors firmware constants from frame/src/core/Config.h and frame/src/core/Layout.cpp.
export const FRAME_ORIGIN = { x: 58, y: 39 } as const
export const FRAME_CANVAS = { width: 680, height: 436 } as const

function span95(start: number, length: number) {
  const margin = Math.trunc(length * 0.025)
  return { a: start + margin, b: start + length - margin }
}

export function getFrameCells(layout: FrameLayoutKey): FrameCellRect[] {
  const x = 0
  const y = 0
  const w = FRAME_CANVAS.width
  const h = FRAME_CANVAS.height

  const halfY = y + Math.trunc(h / 2)
  const quarterY = y + Math.trunc(h / 4)
  const midX = x + Math.trunc(w / 2)

  if (layout === 'full') {
    return [{ x, y, width: w, height: h, slot: 0, size: 'xl' }]
  }

  if (layout === 'default') {
    return [
      { x, y, width: w, height: quarterY - y, slot: 0, size: 'small' },
      { x, y: quarterY, width: w, height: halfY - quarterY, slot: 1, size: 'small' },
      { x, y: halfY, width: w, height: y + h - halfY, slot: 2, size: 'large' },
    ]
  }

  if (layout === 'pyramid') {
    const bottomH = y + h - halfY
    return [
      { x, y, width: w, height: quarterY - y, slot: 0, size: 'small' },
      { x, y: quarterY, width: w, height: halfY - quarterY, slot: 1, size: 'small' },
      { x, y: halfY, width: midX - x, height: bottomH, slot: 2, size: 'medium' },
      { x: midX, y: halfY, width: x + w - midX, height: bottomH, slot: 3, size: 'medium' },
    ]
  }

  const topH = halfY - y
  const bottomH = y + h - halfY
  const leftW = midX - x
  const rightW = x + w - midX
  return [
    { x, y, width: leftW, height: topH, slot: 0, size: 'medium' },
    { x: midX, y, width: rightW, height: topH, slot: 1, size: 'medium' },
    { x, y: halfY, width: leftW, height: bottomH, slot: 2, size: 'medium' },
    { x: midX, y: halfY, width: rightW, height: bottomH, slot: 3, size: 'medium' },
  ]
}

export function getFrameDividers(layout: FrameLayoutKey): FrameDivider[] {
  const w = FRAME_CANVAS.width
  const h = FRAME_CANVAS.height
  const halfY = Math.trunc(h / 2)
  const quarterY = Math.trunc(h / 4)
  const midX = Math.trunc(w / 2)
  const hx = span95(0, w)
  const vy = span95(0, h)

  if (layout === 'full') return []
  if (layout === 'default') {
    return [
      { type: 'h', y: quarterY, x1: hx.a, x2: hx.b },
      { type: 'h', y: halfY, x1: hx.a, x2: hx.b },
    ]
  }
  if (layout === 'pyramid') {
    const bottomY = span95(halfY, h - Math.trunc(h / 2))
    return [
      { type: 'h', y: quarterY, x1: hx.a, x2: hx.b },
      { type: 'h', y: halfY, x1: hx.a, x2: hx.b },
      { type: 'v', x: midX, y1: bottomY.a, y2: bottomY.b },
    ]
  }
  return [
    { type: 'h', y: halfY, x1: hx.a, x2: hx.b },
    { type: 'v', x: midX, y1: vy.a, y2: vy.b },
  ]
}
