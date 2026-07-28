import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

const shopSourceFiles = sourceFiles('app/shop')

test('shop customer-facing content does not expose internal numbered preview labels', () => {
  for (const path of shopSourceFiles) {
    const source = readFileSync(path, 'utf8')

    assert.doesNotMatch(
      source,
      /\bpreview[\s_-]*\d{1,3}\b/i,
      `${path} contains an internal numbered preview label`,
    )
  }
})

test('shop catalog does not dynamically generate numbered preview labels', () => {
  const catalog = readFileSync('app/shop/CatalogPage.tsx', 'utf8')

  assert.doesNotMatch(catalog, /preview[\s_-]*.*padStart/i)
})
