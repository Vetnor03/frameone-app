import { notFound } from 'next/navigation'
import StagingSecurityCheckClient from './StagingSecurityCheckClient'

export const dynamic = 'force-dynamic'

/**
 * Staging-only manual acceptance harness. This must never be usable by a
 * production deployment, even if a URL from staging is copied to the live app.
 */
export default function StagingSecurityCheckPage() {
  const isolatedStaging =
    process.env.VERCEL_PROJECT_ID === 'prj_H8CovSaYkhbYg8CCvpl4N2hjsFaR' &&
    process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://ouwhfzjaahdipwmelzvf.supabase.co'

  if (!isolatedStaging) notFound()

  return <StagingSecurityCheckClient />
}
