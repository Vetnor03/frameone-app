import { pathToFileURL } from 'node:url'

const STAGING_REF = 'ouwhfzjaahdipwmelzvf'
const STAGING_URL = `https://${STAGING_REF}.supabase.co`

// Run at build time for the isolated staging project's primary deployment
// as well as its previews. Reject inherited production credentials.
// This reads only authentication configuration and one admin page; no users
// are created and the response body and credential values are never logged.
export async function verifyPreviewSupabaseCredentials(
  env = process.env,
  request = fetch,
) {
  const liveProductionProjectId = 'prj_boLzA3f5Ntu4r4Ei0AeqYCPhNgv0'
  const isLiveProduction =
    env.VERCEL_ENV === 'production' &&
    env.VERCEL_PROJECT_ID === liveProductionProjectId &&
    env.VERCEL_GIT_COMMIT_REF === 'main'
  const isStagingDeployment =
    env.VERCEL_ENV === 'preview' ||
    (env.VERCEL_ENV === 'production' && !isLiveProduction)
  if (!isStagingDeployment) return { skipped: true }

  const pinnedStagingProjectId = 'prj_H8CovSaYkhbYg8CCvpl4N2hjsFaR'
  if (
    env.VERCEL_PROJECT_ID !== pinnedStagingProjectId ||
    env.REMIND_STAGING_VERCEL_PROJECT_ID !== pinnedStagingProjectId
  ) {
    throw new Error('Staging credential check blocked: unapproved Vercel project.')
  }
  if (env.VERCEL_ENV === 'production' && env.VERCEL_GIT_COMMIT_REF !== 'development') {
    throw new Error('Staging credential check blocked: production branch must be development.')
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  if (env.REMIND_STAGING_SUPABASE_REF !== STAGING_REF || url !== STAGING_URL) {
    throw new Error('Staging credential check blocked: wrong staging project.')
  }

  const publicKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!publicKey || !serviceKey) {
    throw new Error('Staging credential check blocked: staging keys missing.')
  }

  async function check(path, key, role) {
    let response
    try {
      response = await request(`${STAGING_URL}${path}`, {
        method: 'GET',
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
        cache: 'no-store',
      })
    } catch {
      throw new Error(`Staging credential check blocked: ${role} project verification unavailable.`)
    }
    if (!response.ok) {
      throw new Error(`Staging credential check blocked: ${role} key was not accepted by staging (${response.status}).`)
    }
  }

  // Verifies public key belongs to staging, and secret key can actually
  // access staging's admin endpoint. Never print or parse returned users.
  await check('/auth/v1/settings', publicKey, 'public')
  await check('/auth/v1/admin/users?page=1&per_page=1', serviceKey, 'server')
  return { verified: true }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyPreviewSupabaseCredentials()
    .then((result) => {
      if (result.verified) console.info('Staging Supabase credential ownership verified.')
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'Preview credential check failed.')
      process.exitCode = 1
    })
}
