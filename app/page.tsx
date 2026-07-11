import { Suspense } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import HomePageClient from './HomePageClient'

export const dynamic = 'force-dynamic'

function isDesktopUserAgent(userAgent: string | null) {
  if (!userAgent) return false

  const normalized = userAgent.toLowerCase()
  const isMobileOrTablet = /android|iphone|ipad|ipod|mobile|tablet|blackberry|iemobile|opera mini/.test(normalized)
  if (isMobileOrTablet) return false

  return /windows nt|macintosh|x11|linux x86_64|cros/.test(normalized)
}

export default async function Page() {
  const headerStore = await headers()
  const host = headerStore.get('host')?.split(':')[0]

  if (host === 're-mind.no' && isDesktopUserAgent(headerStore.get('user-agent'))) {
    redirect('/shop')
  }

  return (
    <Suspense fallback={null}>
      <HomePageClient />
    </Suspense>
  )
}
