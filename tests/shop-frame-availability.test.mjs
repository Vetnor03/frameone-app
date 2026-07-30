import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')
const products = read('app/shop/productData.ts')
const catalogData = read('app/shop/catalogData.ts')
const catalog = read('app/shop/CatalogPage.tsx')
const framesPage = read('app/shop/frames/page.tsx')
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

test('only in-stock mattes appear in selectors that add products to cart', () => {
  assert.match(products, /new Set\(\['classic-white', 'soft-black', 'warm-beige', 'cocoa-brown'\]\)/)
  assert.match(products, /export function isMattePurchasable/)
  assert.match(configurator, /const purchasableMattes = shopMattes\.filter\(isMattePurchasable\)/)
  assert.match(configurator, /\{purchasableMattes\.map\(\(item\) => <option/)
  assert.doesNotMatch(configurator, /\{shopMattes\.map\(\(item\) => <option/)
  assert.match(bundle, /isMattePurchasable\(item\)/)
})

test('frame and matte collections show availability and accessible card hearts', () => {
  assert.match(catalog, /<p className="mt-5[^>]*><span[^>]*>More styles are coming\.<\/span> Heart your favourites and help us choose what comes next\.<\/p>/)
  assert.match(catalog, /<span className="font-medium text-black\/65">Flere varianter er på vei\.<\/span> Marker favorittene dine og hjelp oss velge hva vi tar inn i neste runde\./)
  assert.doesNotMatch(catalog, /kind === 'frames' && <p[^>]*>[^<]*<span[^>]*>More styles are coming\./)
  assert.match(catalog, /Heart your favourites and help us choose what comes next\./)
  assert.match(catalogData, /availability: matteAvailability\(id\)/)
  assert.match(catalog, /const comingSoon = item\.availability === 'coming-soon'/)
  assert.match(catalog, /const availability = item\.availability/)
  assert.match(catalog, /frameAvailabilityLabels\[availability\]/)
  assert.match(catalog, /availability !== 'in-stock'/)
  assert.match(detail, /item\.availability !== 'in-stock'/)
  assert.match(catalog, /comingSoon \? 'pr-14' : ''/)
  assert.match(catalog, /<FrameFavouriteButton frameId=\{item\.id\} frameName=\{displayName\}/)
  assert.match(favourite, /min-h-11 min-w-11/)
  assert.match(favourite, /Remove \$\{frameName\} from favourites/)
  assert.match(favourite, /Favourite \$\{frameName\}/)
})

test('remaining Norwegian matte translations are used by shared shop displays', () => {
  assert.match(products, /'dusty-blue': \{ name: 'Støvblå', subtitle: 'Rolig, dempet blå' \}/)
  assert.match(products, /'blush-pink': \{ name: 'Pudderrosa', subtitle: 'Myk, varm rosatone' \}/)
  assert.match(products, /'ochre': \{ name: 'Oker', subtitle: 'Varm, gyllen tone' \}/)
  assert.match(products, /'forest-green': \{ name: 'Skoggrønn', subtitle: 'Dyp, naturlig grønn' \}/)
  assert.match(products, /'burgundy': \{ name: 'Burgunder', subtitle: 'Dyp vinrød' \}/)
  assert.match(products, /'natural-linen': \{ name: 'Naturlig lin', subtitle: 'Strukturert linuttrykk' \}/)
  assert.match(products, /locale === 'no' \? norwegianMatteLabels\[id\]\?\.name \?\? fallback : fallback/)
  assert.match(products, /locale === 'no' \? norwegianMatteLabels\[id\]\?\.subtitle \?\? fallback : fallback/)
})

test('Norwegian frame catalog and shared frame displays use localized copy', () => {
  assert.match(framesPage, /title=\{language === 'no' \? 'ALLE RAMMER' : 'All Frames'\}/)
  assert.match(catalog, /\{language === 'no' \? 'TILBAKE TIL FORSIDEN' : 'Back to home'\}/)
  assert.match(catalog, /language === 'no'\s*\? <p[^>]*><span className="font-medium text-black\/65">Flere varianter er på vei\.<\/span> Marker favorittene dine og hjelp oss velge hva vi tar inn i neste runde\.<\/p>/)

  const expectedLabels = [
    ['midnight-black', 'Midnattsort', 'Matt aluminium'],
    ['natural-oak', 'Nordisk eik', 'Ekte eik'],
    ['walnut-wood', 'Mørk valnøtt', 'Ekte valnøtt'],
    ['cloud-white', 'Vinterhvit', 'Matt aluminium'],
    ['brushed-silver', 'Børstet sølv', 'Børstet aluminium'],
    ['charcoal-grey', 'Antrasittgrå', 'Matt aluminium'],
    ['smoked-oak', 'Røkt eik', 'Ekte eik'],
    ['honey-oak', 'Honningeik', 'Ekte eik'],
    ['espresso-wood', 'Espressobrun', 'Ekte ask'],
    ['sandstone', 'Sandstein', 'Myk soft-touch overflate'],
    ['sage-green', 'Salviegrønn', 'Pulverlakkert aluminium'],
    ['deep-navy', 'Dyp marineblå', 'Pulverlakkert aluminium'],
    ['terracotta', 'Terrakotta', 'Pulverlakkert aluminium'],
    ['limited-birch', 'Eksklusiv bjørk', 'Ekte bjørk'],
  ]
  for (const [id, name, subtitle] of expectedLabels) {
    assert.ok(products.includes(`'${id}': { name: '${name}', subtitle: '${subtitle}' }`))
  }
  assert.match(products, /locale === 'no' \? norwegianFrameLabels\[id\]\?\.name \?\? fallback : fallback/)
  assert.match(products, /locale === 'no' \? norwegianFrameLabels\[id\]\?\.subtitle \?\? fallback : fallback/)
  assert.match(products, /return `\$\{amount\}\\u00a0\$\{locale === 'no' \? 'kr' : 'NOK'\}`/)
})

test('Norwegian frame detail pages localize purchase and benefit copy without changing mattes', () => {
  assert.match(detail, /const isNorwegianFrame = kind === 'frames' && language === 'no'/)
  for (const translation of [
    'ALLE RAMMER',
    'RAMME TIL RE:MIND',
    'Utviklet spesielt for RE:MIND og kan byttes på sekunder når du ønsker et nytt uttrykk.',
    'UTFØRELSE',
    'LEGG I HANDLEKURV',
    'RE:MIND-enheten selges separat.',
    'UTVIKLET FOR RE:MIND',
    'Presis passform, utviklet som en del av RE:MIND-systemet.',
    'BYTT PÅ SEKUNDER',
    'Bytt ramme og uttrykk på sekunder – helt uten verktøy.',
    'LAGET FOR Å VARE',
    'Holdbare materialer, valgt for å tåle hverdagen.',
  ]) {
    assert.ok(detail.includes(translation), `missing Norwegian frame copy: ${translation}`)
  }
  assert.match(detail, /\{displaySubtitle\}\. \{language === 'no' \? 'Utviklet spesielt/)
  assert.match(detail, /isNorwegianFrame \? 'ALLE RAMMER' : isNorwegianMatte \? 'ALLE INNLEGG' : `All \$\{kind\}`/)
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

test('coming-soon items stay out of add-to-cart selectors and purchase paths', () => {
  assert.match(detail, /if \(comingSoon\) return/)
  assert.match(detail, /Not yet available to purchase\./)
  assert.match(configurator, /const purchasableFrames = shopFrames\.filter\(isFramePurchasable\)/)
  assert.match(configurator, /\{purchasableFrames\.map\(\(item\) => <option/)
  assert.doesNotMatch(configurator, /\{shopFrames\.map\(\(item\) => <option/)
  assert.doesNotMatch(configurator, /IN STOCK|in-stock frame/)
  assert.match(bundle, /isFramePurchasable\(item\)/)
  assert.match(bundle, /Dark and light modes are both included\. This only changes the preview; select the display mode in the app settings\./)
})

test('coming-soon detail copy is localized by product type without changing English', () => {
  for (const copy of [
    'MARKER DENNE RAMMEN SOM FAVORITT OG HJELP OSS VELGE HVA VI TAR INN I NESTE RUNDE.',
    'MARKER DETTE INNLEGGET SOM FAVORITT OG HJELP OSS VELGE HVA VI TAR INN I NESTE RUNDE.',
    'Kan ikke kjøpes ennå.',
    'Heart this ${singular} to help choose what comes next.',
    'Not yet available to purchase.',
  ]) {
    assert.ok(detail.includes(copy), `missing coming-soon detail copy: ${copy}`)
  }
  assert.match(detail, /language === 'no'\s*\? kind === 'frames'/)
  assert.match(detail, /comingSoon \? language === 'no' \? 'Kan ikke kjøpes ennå\.' : 'Not yet available to purchase\.'/)
  assert.match(detail, /language === 'no' \? 'Tilgjengelighet' : 'Availability'/)
  assert.match(detail, /<FrameFavouriteButton frameId=\{item\.id\} frameName=\{item\.name\} \/>/)
})
