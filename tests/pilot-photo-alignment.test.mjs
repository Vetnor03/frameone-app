import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultPilotPhotoAlignment, getPilotPhotoAlignment } from '../app/lib/pilotPhotoAlignment.ts'

const width = 200
const height = 150

function photograph(left, top, right, bottom, withDust = false) {
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255)
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const p = (y * width + x) * 4
      pixels[p] = 95
      pixels[p + 1] = 74
      pixels[p + 2] = 58
    }
  }
  if (withDust) {
    // Tiny JPEG/dust specks outside the real outer frame must be ignored.
    pixels[0] = 0
    pixels[1] = 0
    pixels[2] = 0
  }
  return pixels
}

test('white or incomplete photos use safe, unchanged geometry', () => {
  const white = new Uint8ClampedArray(width * height * 4).fill(255)
  assert.deepEqual(getPilotPhotoAlignment(white, width, height), defaultPilotPhotoAlignment)
  assert.deepEqual(getPilotPhotoAlignment(white.subarray(0, 12), width, height), defaultPilotPhotoAlignment)
})

test('different white margins yield the same outer-frame width on screen', () => {
  const photos = [
    { bounds: [20, 25, 179, 124] },
    { bounds: [30, 31, 169, 118] },
  ]
  for (const photo of photos) {
    const [left, top, right, bottom] = photo.bounds
    const alignment = getPilotPhotoAlignment(photograph(left, top, right, bottom), width, height)
    const finalWidth = ((right - left + 1) / width) * alignment.scale
    assert.ok(Math.abs(finalWidth - 0.88) < 0.012, `frame width ${finalWidth} should be 88%`)
    const centerX = ((left + right + 1) / (2 * width) - 0.5) * alignment.scale * 100
    const centerY = ((top + bottom + 1) / (2 * height) - 0.5) * alignment.scale * 100
    assert.ok(Math.abs(centerX + alignment.offsetX) < 0.01)
    assert.ok(Math.abs(centerY + alignment.offsetY) < 0.01)
  }
})

test('isolated background noise cannot change frame alignment', () => {
  const bounds = [25, 26, 174, 123]
  assert.deepEqual(
    getPilotPhotoAlignment(photograph(...bounds), width, height),
    getPilotPhotoAlignment(photograph(...bounds, true), width, height),
  )
})

test('very tall objects never overflow the preview', () => {
  const alignment = getPilotPhotoAlignment(photograph(40, 8, 159, 141), width, height)
  assert.ok(((141 - 8 + 1) / height) * alignment.scale <= 0.87)
})
