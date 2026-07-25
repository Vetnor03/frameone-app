export type LayerType = 'device' | 'matte' | 'frame'

export type VisibleBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type NormalizedTarget = {
  centerX: number
  centerY: number
  width: number
  height: number
}

export type NormalizedImageMetadata = {
  naturalWidth: number
  naturalHeight: number
  visibleBounds: VisibleBounds
}

export type NormalizedTransform = {
  scale: number
  translateX: number
  translateY: number
}

// Coordinates are fractions of the one shared preview canvas. Each material in a
// group deliberately uses the same target; per-asset corrections belong only to
// its measured alpha bounds.
export const NORMALIZED_TARGETS: Record<LayerType, NormalizedTarget> = {
  device: { centerX: 0.5, centerY: 0.5, width: 0.82, height: 0.82 },
  matte: { centerX: 0.5, centerY: 0.5, width: 0.82, height: 0.82 },
  frame: { centerX: 0.5, centerY: 0.5, width: 0.82, height: 0.82 },
}

// Promise values also deduplicate scans when two consumers request an asset at
// the same time (including React's development-mode effect replay).
const normalizationCache = new Map<string, Promise<NormalizedImageMetadata>>()

export function getVisibleBounds(image: HTMLImageElement): VisibleBounds {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas 2D context is unavailable')

  context.drawImage(image, 0, 0)
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
  let left = canvas.width
  let top = canvas.height
  let right = -1
  let bottom = -1

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (data[(y * canvas.width + x) * 4 + 3] === 0) continue
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }

  if (right < left || bottom < top) {
    throw new Error(`Image has no visible pixels: ${image.currentSrc || image.src}`)
  }

  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}

export function getNormalizedImageMetadata(src: string, image: HTMLImageElement) {
  const existing = normalizationCache.get(src)
  if (existing) return existing

  const analysis = Promise.resolve().then(() => ({
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    visibleBounds: getVisibleBounds(image),
  }))
  normalizationCache.set(src, analysis)
  // A transient decode/canvas error should not poison the asset for the session.
  void analysis.catch(() => normalizationCache.delete(src))
  return analysis
}

export function calculateNormalizedTransform(
  metadata: NormalizedImageMetadata,
  target: NormalizedTarget,
  previewWidth: number,
  previewHeight: number,
): NormalizedTransform {
  const targetWidth = target.width * previewWidth
  const targetHeight = target.height * previewHeight
  const scale = Math.min(
    targetWidth / metadata.visibleBounds.width,
    targetHeight / metadata.visibleBounds.height,
  )
  const visibleCenterX = metadata.visibleBounds.x + metadata.visibleBounds.width / 2
  const visibleCenterY = metadata.visibleBounds.y + metadata.visibleBounds.height / 2

  return {
    scale,
    translateX: target.centerX * previewWidth - visibleCenterX * scale,
    translateY: target.centerY * previewHeight - visibleCenterY * scale,
  }
}
