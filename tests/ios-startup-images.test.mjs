import test from 'node:test'
import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import { iosPortraitLaunchSizes, iosLaunchStartupImages } from '../app/lib/iosStartupImages.mjs'
import { renderStartupPng } from '../scripts/generate-ios-startup-images.mjs'

test('every iOS PWA media query has its own physical-pixel launch PNG', () => {
  assert.equal(iosPortraitLaunchSizes.length, iosLaunchStartupImages.length)
  assert.equal(new Set(iosLaunchStartupImages.map((image) => image.media)).size, iosLaunchStartupImages.length)
  for (const [index, [cssWidth, cssHeight, dpr]] of iosPortraitLaunchSizes.entries()) {
    const asset = iosLaunchStartupImages[index]
    assert.equal(asset.url, `/ios-startup/${cssWidth * dpr}x${cssHeight * dpr}.png`)
    assert.match(asset.media, new RegExp(`device-width: ${cssWidth}px`))
    assert.match(asset.media, new RegExp(`device-height: ${cssHeight}px`))
    assert.match(asset.media, /orientation: portrait/)
  }
})

test('generated iOS launch images are correctly sized, valid and branded', () => {
  for (const dpr of [2, 3]) {
    const width = 240 * dpr, height = 480 * dpr
    const png = renderStartupPng(width, height, dpr)
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
    assert.equal(png.readUInt32BE(16), width)
    assert.equal(png.readUInt32BE(20), height)
    assert.equal(png[24], 8)
    assert.equal(png[25], 2)
    const idatSize = png.readUInt32BE(33)
    assert.equal(png.toString('ascii', 37, 41), 'IDAT')
    const rgb = inflateSync(png.subarray(41, 41 + idatSize))
    const stride = width * 3 + 1
    assert.equal(rgb.length, stride * height)
    assert.deepEqual([...rgb.subarray(1, 4)], [245, 246, 248])
    let brandedPixels = 0
    for (let y = Math.floor(height / 3); y < Math.floor(height * 2 / 3); y++) {
      for (let x = Math.floor(width / 5); x < Math.floor(width * 4 / 5); x++) {
        if (rgb[y * stride + 1 + x * 3] < 245) brandedPixels++
      }
    }
    assert.ok(brandedPixels > 200, 'expected the centered RE:MIND wordmark, not a blank image')
  }
})
