#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const appIconDir = path.join(repoRoot, 'ios', 'App', 'Assets.xcassets', 'AppIcon.appiconset')
const sourceSvg = path.join(appIconDir, 'AppIcon.svg')
const contentsPath = path.join(appIconDir, 'Contents.json')

function expectedPixels(image) {
  const pointSize = Number(String(image.size).split('x')[0])
  const scale = Number(String(image.scale).replace('x', ''))
  return Math.round(pointSize * scale)
}

async function generateIcon(image) {
  const px = expectedPixels(image)
  const outputPath = path.join(appIconDir, image.filename)

  await sharp(sourceSvg, { density: 1024 })
    .resize(px, px, { fit: 'fill', kernel: 'lanczos3' })
    .removeAlpha()
    .png()
    .toFile(outputPath)
}

async function verifyIcon(image) {
  const px = expectedPixels(image)
  const outputPath = path.join(appIconDir, image.filename)
  const meta = await sharp(outputPath).metadata()

  if (meta.width !== px || meta.height !== px) {
    throw new Error(`${image.filename}: expected ${px}x${px}, got ${meta.width}x${meta.height}`)
  }

  if (meta.hasAlpha) {
    throw new Error(`${image.filename}: expected an opaque PNG without alpha`)
  }
}

async function main() {
  if (!fs.existsSync(sourceSvg)) {
    throw new Error(`Missing SVG source: ${path.relative(repoRoot, sourceSvg)}`)
  }
  if (!fs.existsSync(contentsPath)) {
    throw new Error(`Missing app icon manifest: ${path.relative(repoRoot, contentsPath)}`)
  }

  const contents = JSON.parse(fs.readFileSync(contentsPath, 'utf8'))
  const images = contents.images.filter((image) => image.filename)

  for (const image of images) {
    await generateIcon(image)
  }

  for (const image of images) {
    await verifyIcon(image)
  }

  console.log(`Generated and verified ${images.length} iOS app icon PNG files in ${path.relative(repoRoot, appIconDir)}.`)
  console.log('Generated PNGs are local build artifacts and are intentionally ignored by git.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
