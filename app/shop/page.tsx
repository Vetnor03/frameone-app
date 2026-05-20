import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Re-mind Shop',
  description: 'Official Re-mind storefront',
}

const products = [
  {
    name: 'Re-mind Frame',
    description: 'The connected e-paper display for reminders, weather, and more.',
    price: 'NOK 2,490',
  },
  {
    name: 'Wall Mount Kit',
    description: 'Slim bracket and mounting hardware for clean wall placement.',
    price: 'NOK 249',
  },
  {
    name: 'Desktop Stand',
    description: 'Minimal angled stand for kitchen counters and desks.',
    price: 'NOK 199',
  },
]

export default function ShopPage() {
  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--fg)]">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
        <header className="space-y-3">
          <p className="text-xs tracking-[0.24em] text-[var(--fg-60)]">RE-MIND</p>
          <h1 className="text-4xl font-semibold tracking-tight">Shop</h1>
          <p className="max-w-2xl text-[var(--fg-70)]">
            A minimal public storefront route at <code>/shop</code>. This is intentionally static for now and
            can be replaced later with Shopify Storefront API data.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {products.map((product) => (
            <article
              key={product.name}
              className="rounded-2xl border border-[var(--bd-15)] bg-[var(--panel-05)] p-5"
            >
              <h2 className="text-lg font-medium">{product.name}</h2>
              <p className="mt-2 text-sm text-[var(--fg-70)]">{product.description}</p>
              <p className="mt-4 text-sm font-semibold">{product.price}</p>
              <button
                type="button"
                className="mt-4 w-full rounded-xl border border-[var(--bd-20)] bg-[var(--panel-10)] px-4 py-2 text-sm text-[var(--fg-90)]"
              >
                Coming soon
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
