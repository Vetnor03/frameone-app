import type { Metadata } from 'next'
import CompanyPageShell from '../CompanyPageShell'
import { shopMetadata } from '../seo'
import { pickShopLocale } from '../productData'

export const metadata: Metadata = shopMetadata({
  title: 'Contact | RE:MIND',
  description: 'Get in touch with the RE:MIND team in Stavanger, Norway.',
  path: '/shop/contact',
})

export default async function ContactPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const language = pickShopLocale((await searchParams)?.lang)
  const isNorwegian = language === 'no'
  const localizedHref = (href: string) => isNorwegian ? `${href}?lang=no` : href

  return (
    <CompanyPageShell
      language={language}
      backLabel={isNorwegian ? 'TILBAKE TIL FORSIDEN' : 'Back to home'}
      eyebrow={isNorwegian ? 'KONTAKT' : 'Contact'}
      title={isNorwegian ? 'Vi vil gjerne høre fra deg.' : 'We would love to hear from you.'}
      intro={isNorwegian ? 'Har du spørsmål om RE:MIND, en bestilling eller et mulig samarbeid? Send oss en melding – den går direkte til vårt lille team i Stavanger.' : 'Questions about RE:MIND, an order or a possible collaboration? Send a note and it will reach our small team in Stavanger.'}
    >
      <div className="grid overflow-hidden rounded-[30px] border border-black/10 bg-[#fffdf9] shadow-[0_24px_70px_rgba(73,54,34,0.08)] lg:grid-cols-[1.1fr_0.9fr]">
        <div className="p-7 sm:p-10 md:p-14">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-black/45">{isNorwegian ? 'KUNDESERVICE' : <>General &amp; customer care</>}</p>
          <a
            href="mailto:support@re-mind.no"
            className="mt-5 block break-all text-2xl font-medium tracking-[-0.025em] underline decoration-black/20 underline-offset-8 sm:text-3xl"
          >
            support@re-mind.no
          </a>
          <p className="mt-7 max-w-[52ch] text-[15px] leading-7 text-black/60">
            {isNorwegian ? 'Gjelder det en bestilling, legg ved ordrenummeret. For produkthjelp kan du beskrive hva du opplever og gjerne legge ved et bilde dersom det gjør problemet lettere å forstå.' : 'For help with an order, include your order number. For product support, tell us what you are seeing and attach a photo if it helps explain the issue.'}
          </p>
        </div>
        <aside className="bg-[#e9dfd1] p-7 sm:p-10 md:p-14">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-black/45">RE:MIND</p>
          <h2 className="mt-5 text-3xl font-medium tracking-[-0.035em]">{isNorwegian ? 'Designet i Stavanger.' : 'Designed in Stavanger.'}</h2>
          <p className="mt-5 max-w-[35ch] text-[15px] leading-7 text-black/62">
            {isNorwegian ? 'RE:MIND er et uavhengig norsk prosjekt, utviklet med mål om roligere teknologi i hverdagen.' : 'RE:MIND is an independent Norwegian project built around calmer technology for everyday life.'}
          </p>
          <p className="mt-10 text-sm leading-6 text-black/55">Stavanger<br />{isNorwegian ? 'Norge' : 'Norway'}</p>
        </aside>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <a href={localizedHref('/shop/faq')} className="shop-card rounded-[24px] border border-black/10 bg-white p-7 sm:p-9">
          <p className="text-xs uppercase tracking-[0.18em] text-black/40">{isNorwegian ? 'RASKE SVAR' : 'Quick answers'}</p>
          <h2 className="mt-4 text-2xl font-medium">{isNorwegian ? 'SE SPØRSMÅL OG SVAR' : 'Visit our FAQ'} <span aria-hidden>↗</span></h2>
          <p className="mt-3 text-sm leading-6 text-black/55">{isNorwegian ? 'Oppsett, hva som følger med og andre vanlige spørsmål.' : 'Setup, what is included and other common questions.'}</p>
        </a>
        <a href={localizedHref('/shop/press')} className="shop-card rounded-[24px] border border-black/10 bg-white p-7 sm:p-9">
          <p className="text-xs uppercase tracking-[0.18em] text-black/40">{isNorwegian ? 'MEDIEHENVENDELSER' : 'Media enquiries'}</p>
          <h2 className="mt-4 text-2xl font-medium">{isNorwegian ? 'PRESSEMATERIELL' : 'Press resources'} <span aria-hidden>↗</span></h2>
          <p className="mt-3 text-sm leading-6 text-black/55">{isNorwegian ? 'Kort presentasjon, logo og produktbilder.' : 'Our short introduction, brand mark and product imagery.'}</p>
        </a>
      </div>
    </CompanyPageShell>
  )
}
