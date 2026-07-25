import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const nextConfig = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8')

test('shop HTML cannot remain pinned in an intermediary production cache', () => {
  assert.match(nextConfig, /source:\s*["']\/shop["']/)
  assert.match(nextConfig, /key:\s*["']Cache-Control["'][\s\S]*?value:\s*["']no-store, max-age=0, must-revalidate["']/)
  assert.match(nextConfig, /key:\s*["']CDN-Cache-Control["'][\s\S]*?value:\s*["']no-store["']/)
  assert.match(nextConfig, /key:\s*["']Vercel-CDN-Cache-Control["'][\s\S]*?value:\s*["']no-store["']/)
})

test('shop responses identify the Vercel commit that produced them', () => {
  assert.match(nextConfig, /process\.env\.VERCEL_GIT_COMMIT_SHA/)
  assert.match(nextConfig, /key:\s*["']X-Re-Mind-Deployment-Commit["']/)
})
