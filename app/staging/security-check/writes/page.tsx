import { notFound } from 'next/navigation'
import StagingWriteCheckClient from './StagingWriteCheckClient'

export const dynamic = 'force-dynamic'

/** Never expose test controls in the live Vercel project or a non-staging DB. */
export default function StagingSecurityWritePage() {
  const isolatedStaging =
    process.env.VERCEL_PROJECT_ID === 'prj_H8CovSaYkhbYg8CCvpl4N2hjsFaR' &&
    process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://ouwhfzjaahdipwmelzvf.supabase.co'
  if (!isolatedStaging) notFound()
  return <StagingWriteCheckClient />
}
