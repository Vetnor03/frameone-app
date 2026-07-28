import type { ReactNode } from 'react'
import { ShopFooter, ShopHeader } from './ShopChrome'

type CompanyPageShellProps = {
  eyebrow: string
  title: string
  intro: string
  children: ReactNode
}

export default function CompanyPageShell({ eyebrow, title, intro, children }: CompanyPageShellProps) {
  return (
    <main
      className="shop-page h-screen overflow-y-auto overflow-x-hidden bg-[#f6f3ed] text-[#171512]"
      style={{
        marginTop: 'calc(env(safe-area-inset-top) * -1)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div className="shop-shell mx-auto w-full max-w-[2560px] bg-[#f6f3ed] 2xl:max-w-[1720px]">
        <ShopHeader language="en" />

        <section className="mx-auto w-full max-w-[1200px] px-6 pb-20 pt-8 md:px-14 md:pb-28 md:pt-12">
          <a
            href="/shop"
            className="shop-footer-link inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-black/60"
          >
            <span aria-hidden>←</span>
            Back to home
          </a>

          <header className="max-w-[850px] pb-12 pt-12 md:pb-16 md:pt-20">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-black/45">{eyebrow}</p>
            <h1 className="mt-5 text-[44px] font-medium leading-[0.98] tracking-[-0.05em] sm:text-[62px] md:text-[76px]">
              {title}
            </h1>
            <p className="mt-7 max-w-[650px] text-lg leading-8 text-black/62 md:text-xl">{intro}</p>
          </header>

          {children}
        </section>

        <ShopFooter language="en" />
      </div>
    </main>
  )
}
