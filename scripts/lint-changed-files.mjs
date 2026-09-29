import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { ESLint } from 'eslint'

// This is a no-NEW-debt gate. Large legacy files already have findings; merely
// touching them must not force an unrelated whole-file cleanup or mask new debt.
const baseSha = process.env.BASE_SHA?.trim()
if (!baseSha) {
  console.error('BASE_SHA is required')
  process.exit(1)
}

const diff = spawnSync('git', ['diff', '--name-only', '--diff-filter=ACMR', baseSha, 'HEAD'], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
})
if (diff.status !== 0) {
  process.stderr.write(diff.stderr || '')
  process.exit(diff.status ?? 1)
}

const lintable = diff.stdout.split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((file) => /\.(?:[cm]?[jt]sx?)$/.test(file))
  .filter((file) => existsSync(file))

if (lintable.length === 0) {
  console.log('No changed lintable files.')
  process.exit(0)
}

console.log('Checking for introduced lint findings in:')
for (const file of lintable) console.log(`  - ${file}`)

const eslint = new ESLint()
let introduced = 0
let existing = 0

function findingsBySignature(result, source) {
  const lines = source.split(/\r?\n/)
  const findings = new Map()
  for (const message of result.messages) {
    // Keep unchanged findings stable when preceding code shifts line numbers.
    // The occurrence count prevents identical old findings from hiding extras.
    const sourceLine = (lines[(message.line || 1) - 1] || '').trim().replace(/\s+/g, ' ')
    // React Hooks diagnostics include generated code frames and absolute line numbers;
    // compare the stable headline so an earlier insert does not look like new debt.
    const headline = message.message.split(/\r?\n/, 1)[0].replace(/\bline\s+\d+\b/g, 'line #')
    const signature = JSON.stringify([message.severity, message.ruleId, headline, sourceLine])
    const previous = findings.get(signature)
    findings.set(signature, { count: (previous?.count || 0) + 1, message })
  }
  return findings
}

for (const file of lintable) {
  const source = readFileSync(file, 'utf8')
  const [current] = await eslint.lintText(source, { filePath: file })
  const original = spawnSync('git', ['show', `${baseSha}:${file}`], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  const originalSource = original.status === 0 ? original.stdout : null
  const baseline = originalSource === null
    ? new Map()
    : findingsBySignature((await eslint.lintText(originalSource, { filePath: file }))[0], originalSource)
  const currentFindings = findingsBySignature(current, source)

  for (const [signature, value] of currentFindings) {
    const oldCount = baseline.get(signature)?.count || 0
    existing += Math.min(value.count, oldCount)
    const extra = value.count - oldCount
    if (extra <= 0) continue
    introduced += extra
    const { message } = value
    console.error(`${file}:${message.line}:${message.column} ${message.ruleId || 'parser'}: ${message.message} (+${extra})`)
  }
}

console.log(`Existing baseline findings unchanged: ${existing}; introduced: ${introduced}.`)
if (introduced > 0) process.exit(1)
console.log('No new lint debt.')
