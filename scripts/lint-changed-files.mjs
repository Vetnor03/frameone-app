import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const baseSha = process.env.BASE_SHA?.trim()
if (!baseSha) {
  console.error('BASE_SHA is required')
  process.exit(1)
}

const diff = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACMR', baseSha, 'HEAD'], {
  encoding: 'utf8',
})

if (diff.status !== 0) {
  process.stderr.write(diff.stderr || '')
  process.exit(diff.status ?? 1)
}

const lintable = diff.stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((file) => /\.(?:[cm]?[jt]sx?)$/.test(file))
  .filter((file) => existsSync(file))

if (lintable.length === 0) {
  console.log('No changed lintable files.')
  process.exit(0)
}

console.log('Linting changed files:')
for (const file of lintable) console.log(`  - ${file}`)

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['eslint', ...lintable],
  { stdio: 'inherit' }
)

if (result.error) {
  console.error(result.error)
  process.exit(1)
}
process.exit(result.status ?? 1)
