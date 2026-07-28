type LegalSection = {
  title: string
  text: string
}

type ShopLegalPageProps = {
  title: string
  updatedText: string
  sections: LegalSection[]
}

export default function ShopLegalPage({ title, updatedText, sections }: ShopLegalPageProps) {
  return (
    <main className="shop-page h-screen overflow-y-auto overflow-x-hidden bg-[#faf9f7] text-[#141414]">
      <div className="mx-auto w-full max-w-[1200px] px-6 pb-20 pt-7 md:px-14 md:pb-28 md:pt-10">
        <a
          href="/shop"
          className="shop-footer-link inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-black/60 hover:text-black"
        >
          <span aria-hidden>←</span>
          Back to home
        </a>

        <header className="mt-16 border-b border-black/10 pb-10 md:mt-24 md:pb-14">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-black/50">RE:MIND</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-medium tracking-[-0.035em] sm:text-5xl md:text-6xl">
            {title}
          </h1>
          <p className="mt-5 text-sm text-black/50">{updatedText}</p>
        </header>

        <div className="max-w-3xl divide-y divide-black/10">
          {sections.map((section) => (
            <section key={section.title} className="grid gap-4 py-8 sm:grid-cols-[12rem_1fr] md:py-10">
              <h2 className="text-xs font-medium uppercase tracking-[0.16em] text-black/65">
                {section.title}
              </h2>
              <p className="max-w-[62ch] text-[15px] leading-7 text-black/70 sm:text-base">
                {section.text}
              </p>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
