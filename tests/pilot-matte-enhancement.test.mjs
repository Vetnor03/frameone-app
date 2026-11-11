import test from 'node:test'
import assert from 'node:assert/strict'
import { createPilotMatteOverlay } from '../app/lib/pilotMatteEnhancement.ts'

const width = 120, height = 90
function photo(matteColor) {
  const px = new Uint8ClampedArray(width * height * 4).fill(255)
  function rect(l, t, r, b, color) {
    for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) {
      px.set([...color, 255], (y * width + x) * 4)
    }
  }
  rect(10, 10, 109, 79, [110, 75, 47]) // wooden frame
  rect(19, 19, 100, 70, matteColor) // matte
  rect(33, 29, 86, 60, [230, 229, 224]) // screen
  rect(60, 29, 86, 60, [30, 30, 29]) // dark screen half
  return px
}
const at = (x, y) => (y * width + x) * 4

test('green matte changes, but not the wood, screen or white background', () => {
  const pixels = photo([43, 57, 46])
  const overlay = createPilotMatteOverlay(pixels, width, height, 'green')
  assert.ok(overlay[at(24, 42) + 3] > 100)
  assert.ok(overlay[at(24, 42) + 1] > pixels[at(24, 42) + 1])
  assert.equal(overlay[at(12, 42) + 3], 0)
  assert.equal(overlay[at(40, 40) + 3], 0)
  assert.equal(overlay[at(0, 0) + 3], 0)
})
test('red matte changes, while warm wood remains untouched', () => {
  const pixels = photo([88, 53, 57])
  const overlay = createPilotMatteOverlay(pixels, width, height, 'sanguine')
  assert.ok(overlay[at(24, 42) + 3] > 100)
  assert.ok(overlay[at(24, 42)] > pixels[at(24, 42)])
  assert.equal(overlay[at(12, 42) + 3], 0)
})
test('black and neutral colors are not tinted', () => {
  const overlay = createPilotMatteOverlay(photo([44, 44, 43]), width, height, 'green')
  assert.equal(overlay[at(24, 42) + 3], 0)
})
test('invalid image dimensions return a clear overlay', () => {
  assert.deepEqual(createPilotMatteOverlay(new Uint8ClampedArray(16), width, height, 'green'), new Uint8ClampedArray(16))
})
