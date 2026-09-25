import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const directory = resolve(process.argv[2] || 'supabase/migrations')
const sqlFiles = readdirSync(directory)
  .filter((name) => name.endsWith('.sql'))
  .sort()

if (sqlFiles.length === 0) {
  console.error(`No SQL migration files found in ${directory}`)
  process.exit(1)
}

const versions = new Map()
const errors = []

for (const name of sqlFiles) {
  const match = name.match(/^(\d{14})_[a-z0-9_]+\.sql$/)
  if (!match) {
    errors.push(`Invalid migration filename: ${name}`)
    continue
  }

  const version = match[1]
  const previous = versions.get(version)
  if (previous) {
    errors.push(`Duplicate migration version ${version}: ${previous}, ${name}`)
  } else {
    versions.set(version, name)
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error)
  process.exit(1)
}

console.log(`Migration filenames OK: ${sqlFiles.length} files, ${versions.size} unique versions.`)
