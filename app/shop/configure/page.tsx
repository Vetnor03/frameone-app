import type { Metadata } from 'next'
import Configurator from './Configurator'
import { ShopFooter, ShopHeader } from '../ShopChrome'

export const metadata: Metadata = {
  title: 'Build your RE:MIND',
  description: 'Configure your RE:MIND frame and matte.',
}

function pickLang(value?: string): 'en' | 'no' { return value === 'no' ? 'no' : 'en' }

export default async function ConfigurePage({ searchParams }: { searchParams?: Promise<{ lang?: string; frame?: string; matte?: string }> }) {
  const params = await searchParams
  const language = pickLang(params?.lang)

  return (
    <main
      className="shop-page h-screen overflow-y-auto overflow-x-hidden bg-white text-[#141414]"
      style={{
        marginTop: 'calc(env(safe-area-inset-top) * -1)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="shop-shell w-full max-w-[2560px] mx-auto bg-white 2xl:max-w-[1720px]">
        <ShopHeader language={language} />
        <Configurator initialFrameId={params?.frame} initialMatteId={params?.matte} />
        <ShopFooter language={language} />
      </div>
    </main>
  )
}
