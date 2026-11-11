// Transparent colour-only overlay; the original JPG pixels remain the base.
export type EnhancedPilotMatte = 'green' | 'sanguine'
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export function createPilotMatteOverlay(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  matte: EnhancedPilotMatte,
): Uint8ClampedArray {
  const overlay = new Uint8ClampedArray(pixels.length)
  if (width < 24 || height < 24 || pixels.length < width * height * 4) return overlay

  // Find the photographed frame rather than relying on the unequal JPG margins.
  const rows = new Uint32Array(height)
  const columns = new Uint32Array(width)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const brightness = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114
      if (pixels[i + 3] >= 128 && brightness < 240) {
        rows[y]++
        columns[x]++
      }
    }
  }
  const minRow = Math.max(2, Math.ceil(width * 0.025))
  const minColumn = Math.max(2, Math.ceil(height * 0.025))
  const top = rows.findIndex(count => count >= minRow)
  const left = columns.findIndex(count => count >= minColumn)
  let bottom = height - 1
  let right = width - 1
  while (bottom >= 0 && rows[bottom] < minRow) bottom--
  while (right >= 0 && columns[right] < minColumn) right--
  if (top < 0 || left < 0 || bottom <= top || right <= left) return overlay

  const boxWidth = right - left
  const boxHeight = bottom - top
  for (let y = top; y <= bottom; y++) {
    const ny = (y - top) / boxHeight
    if (ny <= 0.09 || ny >= 0.91) continue
    const edgeY = Math.min(clamp01((ny - 0.09) / 0.025), clamp01((0.91 - ny) / 0.025))
    for (let x = left; x <= right; x++) {
      const nx = (x - left) / boxWidth
      if (nx <= 0.09 || nx >= 0.91) continue
      // Keep the screen, printed RE:MIND mark and outer wooden rim untouched.
      if (nx > 0.20 && nx < 0.80 && ny > 0.23 && ny < 0.77) continue
      const i = (y * width + x) * 4
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
      const brightness = r * 0.299 + g * 0.587 + b * 0.114
      if (pixels[i + 3] < 128 || brightness < 13 || brightness > 175) continue

      // The greenish/red-burgundy colour clue rejects neutral black and warm wood.
      const confidence = matte === 'green'
        ? clamp01((g - (r + b) / 2 - 1) / 9)
        : clamp01((r - g - 4) / 15) * clamp01((b - g + 12) / 16)
      if (confidence <= 0) continue
      const edgeX = Math.min(clamp01((nx - 0.09) / 0.025), clamp01((0.91 - nx) / 0.025))
      const alpha = Math.round(255 * 0.85 * confidence * edgeX * edgeY)
      if (alpha === 0) continue

      if (matte === 'green') {
        overlay[i] = Math.round(r * 0.82)
        overlay[i + 1] = Math.min(255, Math.round(g * 1.21 + 2))
        overlay[i + 2] = Math.round(b * 0.91)
      } else {
        overlay[i] = Math.min(255, Math.round(r * 1.16 + 3))
        overlay[i + 1] = Math.round(g * 0.88)
        overlay[i + 2] = Math.round(b * 0.98)
      }
      overlay[i + 3] = alpha
    }
  }
  return overlay
}
