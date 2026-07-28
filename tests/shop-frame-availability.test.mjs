import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')
const products = read('app/shop/productData.ts')
const catalog = read('app/shop/CatalogPage.tsx')
const detail = read('app/shop/ProductDetailPage.tsx')
const favourite = read('app/shop/FrameFavouriteButton.tsx')
const configurator = read('app/shop/configure/Configurator.tsx')
const bundle = read('app/shop/bundles/[id]/BundleConfigurator.tsx')
const endpoint = read('app/api/shop/frame-interest/route.ts')
const migration = read('supabase/migrations/20260728150000_add_shop_frame_interest.sql')

test('only the four launch frames are manually in stock', () => {
  assert.match(products, /new Set\(\['midnight-black', 'cloud-white', 'natural-oak', 'walnut-wood'\]\)/)
  assert.match(products, /return launchFrameIds\.has\(id\) \? 'in-stock' : 'coming-soon'/)
  assert.match(products, /'low-stock': 'LOW STOCK'/)
  assert.match(products, /'out-of-stock': 'OUT OF STOCK'/)
})

test('frame collection gives one explanation and accessible card hearts', () => {
  assert.match(catalog, /More styles are coming\./)
  assert.match(catalog, /Heart your favourites and help us choose what comes next\./)
  assert.match(catalog, /frameAvailabilityLabels\[item\.availability\]/)
  assert.match(catalog, /<FrameFavouriteButton frameId=\{item\.id\}/)
  assert.match(favourite, /min-h-11 min-w-11/)
  assert.match(favourite, /Remove \$\{frameName\} from favourites/)
  assert.match(favourite, /Favourite \$\{frameName\}/)
})

test('favourites persist per browser and server demand is private and deduplicated', () => {
  assert.match(favourite, /window\.localStorage\.setItem\(STORAGE_KEY/)
  assert.match(favourite, /crypto\.randomUUID\(\)/)
  assert.match(endpoint, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(endpoint, /ignoreDuplicates: true/)
  assert.match(migration, /primary key \(frame_id, visitor_id\)/)
  assert.match(migration, /revoke all on table public\.shop_frame_interest from anon, authenticated/)
  assert.doesNotMatch(catalog, /favourites?\s*\}/i)
})

test('coming-soon purchase paths are guarded while preview remains available', () => {
  assert.match(detail, /if \(comingSoon\) return/)
  assert.match(detail, /Not yet available to purchase\./)
  assert.match(configurator, /if \(!framePurchasable\) return/)
  assert.match(configurator, /disabled=\{!framePurchasable\}/)
  assert.match(configurator, /Preview this frame now, then choose an in-stock frame to purchase\./)
  assert.match(bundle, /isFramePurchasable\(item\)/)
})
