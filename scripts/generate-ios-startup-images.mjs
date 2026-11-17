// Generate exact-size PNGs for the iOS standalone PWA launch screen.
// No font/system image dependency: the compact RE:MIND wordmark is antialiased at subpixel resolution and
// written to a PNG using Node's built-in zlib. These are build assets, not UI data.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
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

function paintLogo(raw, width, height, dpr) {
  const rowBytes = width * 3 + 1
  const logicalWidth = width / dpr
  // Match .remind-splash exactly, including on large-screen phones.
  const scale = dpr * Math.min(220, logicalWidth * 0.52) / 300
  const ox = (width - 300 * scale) / 2
  const oy = (height - 60 * scale) / 2
  const radius = 2.4 * scale / 2

  // Subpixel coverage prevents the thin diagonal/curved strokes from looking
  // stepped or muddy on a native launch image. Max coverage (rather than
  // repeated alpha blending) also keeps intersections from turning too dark.
  const coverage = new Uint8Array(width * height)
  const samples = [0.125, 0.375, 0.625, 0.875]
  const paintPixel = (x, y, value) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const index = y * width + x
    if (value > coverage[index]) coverage[index] = value
  }
  const rasterize = (x1, y1, x2, y2, contains) => {
    for (let y = Math.max(0, Math.floor(y1 - 1)); y < Math.min(height, Math.ceil(y2 + 1)); y += 1) {
      for (let x = Math.max(0, Math.floor(x1 - 1)); x < Math.min(width, Math.ceil(x2 + 1)); x += 1) {
        let hits = 0
        for (const sy of samples) {
          for (const sx of samples) {
            if (contains(x + sx, y + sy)) hits += 1
          }
        }
        if (hits) paintPixel(x, y, Math.round(hits * 255 / 16))
      }
    }
  }
  const line = (a, b) => {
    const x1 = ox + a[0] * scale, y1 = oy + a[1] * scale
    const x2 = ox + b[0] * scale, y2 = oy + b[1] * scale
    const dx = x2 - x1, dy = y2 - y1, lengthSquared = dx * dx + dy * dy || 1
    rasterize(Math.min(x1,x2)-radius, Math.min(y1,y2)-radius,
      Math.max(x1,x2)+radius, Math.max(y1,y2)+radius, (px,py) => {
        const t = Math.max(0, Math.min(1, ((px-x1)*dx + (py-y1)*dy) / lengthSquared))
        return Math.hypot(px - (x1+t*dx), py - (y1+t*dy)) <= radius
      })
  }
  const curve = (start, control1, control2, end) => {
    const segments = Math.max(32, Math.ceil(65 * scale))
    let previous = start
    for (let i = 1; i <= segments; i += 1) {
      const t = i / segments, u = 1 - t
      const p = [0,1].map(axis =>
        u*u*u*start[axis] + 3*u*u*t*control1[axis] +
        3*u*t*t*control2[axis] + t*t*t*end[axis])
      line(previous,p)
      previous = p
    }
  }
  const circle = (cx,cy,r) => {
    const x0 = ox + cx*scale, y0 = oy + cy*scale, rr = r*scale
    rasterize(x0-rr,y0-rr,x0+rr,y0+rr,
      (px,py) => Math.hypot(px-x0,py-y0) <= rr)
  }
  const path = points => {
    for (let i = 1; i < points.length; i += 1) line(points[i-1],points[i])
  }

  // Exact same shapes as StartupWordmark's SVG, with smooth R and D bowls.
  path([[0,60],[0,0],[17,0]])
  curve([17,0],[37,0],[38,31],[17,31])
  line([17,31],[0,31])
  line([17,31],[34,60])
  path([[76,0],[46,0],[46,60],[76,60]])
  line([46,30],[73,30])
  circle(99,21,2.4)
  circle(99,43,2.4)
  path([[123,60],[123,0],[145,33],[167,0],[167,60]])
  line([184,0],[184,60])
  path([[205,60],[205,0],[245,60],[245,0]])
  path([[261,0],[261,60],[275,60]])
  curve([275,60],[293,60],[300,47],[300,30])
  curve([300,30],[300,13],[293,0],[275,0])
  line([275,0],[261,0])

  for (let pixel = 0; pixel < coverage.length; pixel += 1) {
    const alpha = coverage[pixel] / 255
    if (!alpha) continue
    const idx = Math.floor(pixel / width) * rowBytes + 1 + (pixel % width) * 3
    for (let c = 0; c < 3; c += 1) {
      raw[idx + c] = Math.round(BACKGROUND[c] * (1-alpha) + FOREGROUND[c] * alpha)
    }
  }
}

export function renderStartupPng(width, height, dpr = 3) {
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
  paintLogo(raw, width, height, dpr)
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
    writeFileSync(join(targetDir, `${width}x${height}-v2.png`), renderStartupPng(width, height, dpr))
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateStartupImages()
  process.stdout.write('Generated iOS PWA startup images.\\n')
}
