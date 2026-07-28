import type { Metadata } from 'next'
import Configurator from './Configurator'
import { ShopFooter, ShopHeader } from '../ShopChrome'
import { shopMetadata } from '../seo'

export const metadata: Metadata = shopMetadata({
  title: 'Build your RE:MIND',
  description: 'Choose a frame and matte to create a customizable RE:MIND e-paper display that feels at home in your space.',
  path: '/shop/configure',
})

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
        <ShopHeader language={language} activeSection="configure" />
        <Configurator initialFrameId={params?.frame} initialMatteId={params?.matte} />
        <ShopFooter language={language} />
      </div>
    </main>
  )
}
