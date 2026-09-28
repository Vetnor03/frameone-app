/** Staging-only quarantine of the insecure legacy enrollment paths.
 *
 * This is intentionally pinned to BOTH the independent Vercel project and
 * staging Supabase database. Never use VERCEL_ENV alone: the staging project's
 * primary deployment also reports VERCEL_ENV=production.
 *
 * Not a pairing-v2 feature switch. All v2 credential issuance remains OFF.
 */
export function legacyPairingQuarantined(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.VERCEL_PROJECT_ID === 'prj_H8CovSaYkhbYg8CCvpl4N2hjsFaR' &&
    env.REMIND_STAGING_VERCEL_PROJECT_ID === 'prj_H8CovSaYkhbYg8CCvpl4N2hjsFaR' &&
    env.REMIND_STAGING_SUPABASE_REF === 'ouwhfzjaahdipwmelzvf' &&
    env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') === 'https://ouwhfzjaahdipwmelzvf.supabase.co'
  )
}

/** No client, token, pairing code, or database lookup should precede this. */
export const LEGACY_PAIRING_DISABLED_RESPONSE = {
  error: 'legacy_pairing_disabled',
} as const
