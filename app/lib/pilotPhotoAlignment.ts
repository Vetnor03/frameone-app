// Align the photographed outer frame, not the JPG canvas or its varying white margins.
// The original files remain unchanged; this only adjusts their on-page presentation.
export type PilotPhotoAlignment = {
  scale: number
  offsetX: number
  offsetY: number
}

export const defaultPilotPhotoAlignment: PilotPhotoAlignment = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
}

export function getPilotPhotoAlignment(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): PilotPhotoAlignment {
  if (width < 8 || height < 8 || pixels.length < width * height * 4) {
    return defaultPilotPhotoAlignment
  }

  const rows = new Uint32Array(height)
  const columns = new Uint32Array(width)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      // A generous near-white threshold ignores the JPG's white background and
      // faint compression/shadow artefacts, while including light oak and mattes.
      const brightness = (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114)
      if (pixels[i + 3] >= 128 && brightness < 240) {
        rows[y]++
        columns[x]++
      }
    }
  }

  // Ignore isolated edge pixels. The actual rectangular frame occupies many
  // pixels on each of its four outermost rows/columns.
  const minRowPixels = Math.max(2, Math.ceil(width * 0.025))
  const minColumnPixels = Math.max(2, Math.ceil(height * 0.025))
  const top = rows.findIndex((count) => count >= minRowPixels)
  const left = columns.findIndex((count) => count >= minColumnPixels)
  let bottom = height - 1
  let right = width - 1
  while (bottom >= 0 && rows[bottom] < minRowPixels) bottom--
  while (right >= 0 && columns[right] < minColumnPixels) right--

  if (top < 0 || left < 0 || bottom <= top || right <= left) {
    return defaultPilotPhotoAlignment
  }

  const subjectWidth = (right - left + 1) / width
  const subjectHeight = (bottom - top + 1) / height
  // Same outer-frame width, while leaving comfortable space around the whole
  // product so even the tallest photo cannot be cropped.
  const scale = Math.min(1.3, Math.max(0.85, Math.min(0.88 / subjectWidth, 0.86 / subjectHeight)))
  const centerX = (left + right + 1) / (2 * width)
  const centerY = (top + bottom + 1) / (2 * height)

  return {
    scale,
    offsetX: -scale * (centerX - 0.5) * 100,
    offsetY: -scale * (centerY - 0.5) * 100,
  }
}
