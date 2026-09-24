import { readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const testsDir = resolve('tests')
const baselinePath = resolve('tests/ci-known-failing-files.txt')

const excluded = new Set(
  readFileSync(baselinePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
)

const allTests = readdirSync(testsDir)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()

const missingBaselineEntries = [...excluded].filter((name) => !allTests.includes(name))
if (missingBaselineEntries.length > 0) {
  console.error('CI baseline contains test files that no longer exist:')
  for (const name of missingBaselineEntries) console.error(`  - ${name}`)
  process.exit(1)
}

const selected = allTests.filter((name) => !excluded.has(name))
if (selected.length === 0) {
  console.error('CI stable test set is empty')
  process.exit(1)
}

console.log(`Running ${selected.length} stable test files; ${excluded.size} known-failing files remain in the audit baseline.`)

const result = spawnSync(
  process.execPath,
  ['--test', ...selected.map((name) => resolve(testsDir, name))],
  { stdio: 'inherit' }
)

if (result.error) {
  console.error(result.error)
  process.exit(1)
}
process.exit(result.status ?? 1)
