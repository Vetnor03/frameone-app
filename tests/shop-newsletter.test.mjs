import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('shop footer uses the dedicated newsletter signup flow', async () => {
  const [footer, form, route] = await Promise.all([
    read('app/shop/ShopChrome.tsx'),
    read('app/shop/NewsletterForm.tsx'),
    read('app/api/shop/newsletter/route.ts'),
  ])

  assert.match(footer, /<NewsletterForm \/>/)
  assert.match(form, /fetch\('\/api\/shop\/newsletter'/)
  assert.match(route, /from\('newsletter_subscribers'\)/)
  assert.match(route, /sendNewsletterWelcomeEmail/)
})

test('newsletter welcome email contains a tokenized unsubscribe button', async () => {
  const [email, unsubscribeRoute, migration] = await Promise.all([
    read('app/lib/newsletterEmail.ts'),
    read('app/api/shop/newsletter/unsubscribe/route.ts'),
    read('supabase/migrations/20260728120000_add_newsletter_subscribers.sql'),
  ])

  assert.match(email, /searchParams\.set\('token', unsubscribeToken\)/)
  assert.match(email, />Unsubscribe<\/a>/)
  assert.match(unsubscribeRoute, /unsubscribed_at/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all .* from anon, authenticated/)
})
