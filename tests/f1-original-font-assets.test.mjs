import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = process.cwd();
const file = resolve(root, 'frame/src/assets/fonts/RemindEditorialFonts.cpp');
const source = readFileSync(file, 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const expected = {
  RemindFraunces72: { bitmapBytes: 46927, bitmapSha: 'f0153afa4c6bec182ac04566c0e3d21a6d5dd39905291dd585b38abf71c5d216', advance: 92 },
  RemindFraunces48: { bitmapBytes: 22127, bitmapSha: '1001c2bcbf3ab7756f2d9dbc3cae16167d420b7284a319fca2afa17bfe579eaa', advance: 62 },
  RemindDM24: { bitmapBytes: 5732, bitmapSha: 'a3ea67d87a83b7f52811992aa28fd71f0ec735c0bda7847cf2f0f1ed971c1033', advance: 34 },
  RemindDM18: { bitmapBytes: 3298, bitmapSha: 'de84365734e30c07a660fb1d2b3607ee5763d15e2ad9c69ee3882575fc8dd690', advance: 26 },
};

test('F1: committed screen-6 font C++ matches verified local archive bytes', () => {
  assert.equal(sha(Buffer.from(source, 'utf8')), 'e533f0431d3bf1d7ba47be7be2de89b8221d828d26947c17df8fae2e3a0c5083');
  assert.equal(Buffer.byteLength(source), 508302);
  assert.doesNotMatch(source, /RemindInstrument(?:48|72)/);
});

for (const [name, meta] of Object.entries(expected)) {
  test(`F1: ${name} original 1-bit data, metrics and Norwegian glyph range`, () => {
    const matchBitmaps = source.match(new RegExp(`static const uint8_t ${name}Bitmaps\\[\\] PROGMEM = \\{([\\s\\S]*?)\\};`));
    const matchGlyphs = source.match(new RegExp(`static const GFXglyph ${name}Glyphs\\[\\] PROGMEM = \\{([\\s\\S]*?)\\};`));
    const matchFont = source.match(new RegExp(`static const GFXfont ${name} PROGMEM = \\{([\\s\\S]*?)\\};`));
    assert.ok(matchBitmaps && matchGlyphs && matchFont);
    const bitmap = Buffer.from([...matchBitmaps[1].matchAll(/0x([0-9a-fA-F]{2})/g)].map((x) => Number.parseInt(x[1], 16)));
    assert.equal(bitmap.length, meta.bitmapBytes);
    assert.equal(sha(bitmap), meta.bitmapSha);
    const glyphs = [...matchGlyphs[1].matchAll(/\\{\\s*(\\d+),\\s*(\\d+),\\s*(\\d+),\\s*(\\d+),\\s*(-?\\d+),\\s*(-?\\d+)\\s*\\}/g)];
    assert.equal(glyphs.length, 224, '0x20–0xFF');
    for (const point of [0xB0, 0xC5, 0xC6, 0xD8, 0xE5, 0xE6, 0xF8]) {
      const [, offset, width, height, advance] = glyphs[point - 0x20].map(Number);
      assert.ok(width > 0 && height > 0 && advance > 0, `${name} glyph ${point.toString(16)}`);
      assert.ok(offset + Math.ceil(width * height / 8) <= bitmap.length);
    }
    assert.match(matchFont[1], new RegExp(`0x20, 0xFF, ${meta.advance}\\s*`));
  });
}

test('F1: original upstream font licenses and isolated opt-in API exist', () => {
  for (const license of ['Fraunces-OFL.txt', 'DM-Sans-OFL.txt']) {
    const content = readFileSync(resolve(root, 'frame/src/assets/fonts/licenses', license), 'utf8');
    assert.match(content, /SIL OPEN FONT LICENSE Version 1\.1/);
  }
  const header = readFileSync(resolve(root, 'frame/src/assets/fonts/RemindEditorialFonts.h'), 'utf8');
  for (const accessor of ['fraunces72', 'fraunces48', 'dm24', 'dm18']) assert.ok(header.includes(accessor + '()'));
});
