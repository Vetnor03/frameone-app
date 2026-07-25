import type { Metadata } from 'next'
import Configurator from './Configurator'
import { ShopFooter, ShopHeader } from '../ShopChrome'

export const metadata: Metadata = {
  title: 'Build your RE:MIND',
  description: 'Configure your RE:MIND frame and matte.',
}

function pickLang(value?: string): 'en' | 'no' { return value === 'no' ? 'no' : 'en' }

export default async function ConfigurePage({ searchParams }: { searchParams?: Promise<{ lang?: string; currency?: string }> }) {
  const params = await searchParams
  const language = pickLang(params?.lang)
  const currency = 'NOK' as const

  return (
    <main className="shop-page min-h-screen overflow-x-hidden bg-white text-[#141414]">
      <ShopHeader language={language} currency={currency} />
      <Configurator />
      <ShopFooter language={language} currency={currency} />
    </main>
  )
}
