import Script from 'next/script'

export default function VercelAnalytics() {
  return <Script src="/_vercel/insights/script.js" strategy="afterInteractive" />
}
