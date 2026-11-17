// Generate exact-size PNGs for the iOS standalone PWA launch screen.
// No font/system image dependency: the slender RE:MIND wordmark is drawn as vector
// strokes to a PNG using Node's built-in zlib. These are build assets, not UI data.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { iosPortraitLaunchSizes } from '../app/lib/iosStartupImages.mjs'

const BACKGROUND = [245, 246, 248] // Must match --app-bg in the default light theme.
const FOREGROUND = [29, 37, 44]
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const CRC_TABLE = Array.from({ length: 256 }, (_, start) => {
  let crc = start
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1)
  return crc >>> 0
})

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, payload) {
  const label = Buffer.from(type, 'ascii')
  const out = Buffer.alloc(12 + payload.length)
  out.writeUInt32BE(payload.length, 0)
  label.copy(out, 4)
  payload.copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([label, payload])), 8 + payload.length)
  return out
}

function paintLogo(raw, width, height) {
  const rowBytes = width * 3 + 1
  // Use CSS-point proportions regardless of DPR.
  const logicalWidth = width / 3
  const logicalHeight = height / 3
  const factor = Math.min(1.12, logicalWidth * 0.77 / 300)
  const scale = (width / logicalWidth) * factor
  const ox = (width - 300 * scale) / 2
  const oy = (height - 60 * scale) / 2
  const stroke = 1.7 * scale
  const radius = stroke / 2
  const blendPixel = (px, py, coverage) => {
    if (px < 0 || py < 0 || px >= width || py >= height || coverage <= 0) return
    const idx = py * rowBytes + 1 + px * 3
    const alpha = Math.min(1, coverage)
    for (let c = 0; c < 3; c += 1) {
      raw[idx + c] = Math.round(raw[idx + c] * (1 - alpha) + FOREGROUND[c] * alpha)
    }
  }
  const line = (a, b) => {
    const x1 = ox + a[0] * scale, y1 = oy + a[1] * scale
    const x2 = ox + b[0] * scale, y2 = oy + b[1] * scale
    const dx = x2 - x1, dy = y2 - y1, lengthSquared = dx * dx + dy * dy || 1
    for (let y = Math.max(0, Math.floor(Math.min(y1, y2) - radius - 1)); y <= Math.min(height - 1, Math.ceil(Math.max(y1, y2) + radius + 1)); y += 1) {
      for (let x = Math.max(0, Math.floor(Math.min(x1, x2) - radius - 1)); x <= Math.min(width - 1, Math.ceil(Math.max(x1, x2) + radius + 1)); x += 1) {
        const t = Math.max(0, Math.min(1, ((x + .5 - x1) * dx + (y + .5 - y1) * dy) / lengthSquared))
        const distance = Math.hypot(x + .5 - (x1 + t * dx), y + .5 - (y1 + t * dy))
        blendPixel(x, y, radius + .5 - distance)
      }
    }
  }
  const circle = (cx, cy, r) => {
    const x0 = ox + cx * scale, y0 = oy + cy * scale, rr = r * scale
    for (let y = Math.floor(y0 - rr - 1); y <= Math.ceil(y0 + rr + 1); y += 1) {
      for (let x = Math.floor(x0 - rr - 1); x <= Math.ceil(x0 + rr + 1); x += 1) {
        blendPixel(x, y, rr + .5 - Math.hypot(x + .5 - x0, y + .5 - y0))
      }
    }
  }
  const path = (offset, points) => {
    for (let i = 1; i < points.length; i += 1) {
      line([offset + points[i - 1][0], points[i - 1][1]], [offset + points[i][0], points[i][1]])
    }
  }
  // Thin monoline wordmark, optically centered; colon dots are part of the brand.
  path(0, [[0,60],[0,0],[18,0],[28,6],[31,16],[28,26],[18,31],[0,31]])
  line([17,31],[34,60])
  path(46, [[30,0],[0,0],[0,60],[30,60]])
  line([46,30],[73,30])
  circle(99,21,2.4)
  circle(99,43,2.4)
  path(123, [[0,60],[0,0],[22,33],[44,0],[44,60]])
  line([184,0],[184,60])
  path(205, [[0,60],[0,0],[40,60],[40,0]])
  path(261, [[0,0],[0,60],[16,60],[30,54],[38,42],[39,30],[38,18],[30,6],[16,0],[0,0]])
}

export function renderStartupPng(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 3500 || height > 4000) {
    throw new Error('Invalid iOS startup PNG size')
  }
  const rowBytes = width * 3 + 1
  const raw = Buffer.alloc(rowBytes * height)
  for (let y = 0; y < height; y += 1) {
    const start = y * rowBytes + 1
    for (let x = start; x < start + width * 3; x += 3) {
      raw[x] = BACKGROUND[0]
      raw[x + 1] = BACKGROUND[1]
      raw[x + 2] = BACKGROUND[2]
    }
  }
  // All configured sizes are @3 except older @2 devices. The logo takes the
  // same share of the viewport whether the image is 2x or 3x.
  paintLogo(raw, width, height)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bits per channel
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export function generateStartupImages(targetDir = resolve(process.cwd(), 'public/ios-startup')) {
  mkdirSync(targetDir, { recursive: true })
  for (const [pointsWidth, pointsHeight, dpr] of iosPortraitLaunchSizes) {
    const width = pointsWidth * dpr, height = pointsHeight * dpr
    writeFileSync(join(targetDir, `${width}x${height}.png`), renderStartupPng(width, height))
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateStartupImages()
  process.stdout.write('Generated iOS PWA startup images.\\n')
}
