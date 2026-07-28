import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')
const page = read('app/shop/configure/page.tsx')
const configurator = read('app/shop/configure/Configurator.tsx')
const configuratorStyles = read('app/shop/configure/Configurator.module.css')
const productData = read('app/shop/productData.ts')
const shopPage = read('app/shop/page.tsx')
const logic = read('app/shop/configuratorLogic.ts')
const cart = read('app/shop/cart.ts')
const chrome = read('app/shop/ShopChrome.tsx')
const cartPage = read('app/shop/cart/CartPage.tsx')
const cartRoute = read('app/shop/cart/page.tsx')
const languageSelector = read('app/shop/ShopLanguageSelector.tsx')
const aboutPage = read('app/shop/about/page.tsx')

test('configure route and both shop entry points are present', () => {
  assert.match(page, /<Configurator initialFrameId=\{params\?\.frame\} initialMatteId=\{params\?\.matte\} \/>/)
  assert.match(configurator, /BUILD YOUR RE:MIND/)
  assert.match(configurator, /Choose the display, frame and matte that feel right at home\./)
  assert.match(shopPage, /const configureHref = `\/shop\/configure\?lang=\$\{language\}`/)
  assert.match(shopPage, /href=\{configureHref\}>SHOP FRAMES/)
  assert.match(shopPage, /href=\{configureHref\}[\s\S]{0,180}MAKE IT YOURS/)
})

test('shop and configurator share the complete storefront chrome', () => {
  assert.match(shopPage, /<ShopHeader language=\{language\}/)
  assert.match(shopPage, /<ShopFooter language=\{language\}/)
  assert.match(page, /<ShopHeader language=\{language\} \/>/)
  assert.match(page, /<ShopFooter language=\{language\} \/>/)
  assert.doesNotMatch(chrome, /Open profile|profile\.png/)
  assert.match(chrome, /href="\/shop\/cart"/)
  assert.match(chrome, /FREE SHIPPING/)
  assert.match(chrome, /STAY IN THE LOOP/)
  assert.match(chrome, /ShopLanguageSelector/)
})

test('mobile shop navigation displays page links inline without a menu toggle', () => {
  assert.match(chrome, /aria-label="Shop pages"/)
  assert.match(chrome, /shop-nav flex items-center justify-between[\s\S]*md:hidden/)
  assert.doesNotMatch(chrome, /ShopMobileMenu|shop-nav-trigger|>\s*Menu\s*</)

  const mobileNavStart = chrome.indexOf('aria-label="Shop pages"')
  const mobileNav = chrome.slice(mobileNavStart, chrome.indexOf('</nav>', mobileNavStart))
  assert.match(mobileNav, /href="\/shop\/frames"/)
  assert.match(mobileNav, /href="\/shop\/mattes"/)
  assert.match(mobileNav, /href="\/shop\/bundles"/)
  assert.match(mobileNav, /href="\/shop\/about"/)
})

test('about navigation opens a dedicated founder story with a home link', () => {
  assert.match(chrome, /href="\/shop\/about"/)
  assert.match(aboutPage, /Back to home/)
  assert.match(aboutPage, /href="\/shop"/)
  assert.match(aboutPage, /Hi, I’m Vetle, founder of RE:MIND/)
  assert.match(aboutPage, /Ask RE:MIND to keep an eye on anything\./)
  assert.match(aboutPage, /no limit to what you can ask it to watch/)
  assert.match(aboutPage, /what’s happening in Stavanger this weekend/)
  assert.doesNotMatch(aboutPage, /waitlist/i)
})

test('accessories are omitted from the storefront until they are in inventory', () => {
  assert.doesNotMatch(chrome, /accessor(?:y|ies)/i)
  assert.doesNotMatch(shopPage, /accessor(?:y|ies)/i)
})

test('footer selector changes language only and prices remain NOK', () => {
  assert.match(languageSelector, /aria-label="Language"/)
  assert.match(languageSelector, /<option value="en">English<\/option>/)
  assert.match(languageSelector, /<option value="no">Norwegian<\/option>/)
  assert.doesNotMatch(languageSelector, /NOK|English \(|Norwegian \(/)
  assert.doesNotMatch(chrome, /currency/)
  assert.doesNotMatch(shopPage, /currency/)
})

test('shop and configure routes use the same page scroll container', () => {
  const scrollContainer = /shop-page h-screen overflow-y-auto overflow-x-hidden/
  assert.match(shopPage, scrollContainer)
  assert.match(page, scrollContainer)
  assert.match(page, /shop-shell w-full max-w-\[2560px\] mx-auto bg-white 2xl:max-w-\[1720px\]/)
})

test('the configure content background is pure white at every breakpoint', () => {
  assert.match(configurator, /bg-white \$\{styles\.previewSection\}/)
  assert.doesNotMatch(configurator, /bg-\[#faf9f7\]/)
  assert.match(configuratorStyles, /\.desktopLayout[\s\S]*background: #fff;/)
  assert.doesNotMatch(configuratorStyles, /background: #faf9f7;/)
})

test('desktop shop hero begins below the shared header without a negative offset', () => {
  assert.match(shopPage, /<ShopHeader[\s\S]*<section className="relative py-10 md:min-h-\[585px\] md:py-0">/)
  assert.doesNotMatch(shopPage, /md:-mt-/)
})

test('shop and configurator consume one shared frame source', () => {
  assert.match(shopPage, /import \{ formatNok, shopFrames \} from '\.\/productData'/)
  assert.match(configurator, /shopFrames, shopMattes/)
  assert.equal((productData.match(/name: '(Midnight Black|Walnut Wood|Natural Oak|Cloud White)'/g) ?? []).length, 4)
})

test('final layered assets and their explicit catalogue order are preserved', () => {
  const framePaths = ['Dark.png', 'Metal.png', 'Oak.png', 'Walnut.png', 'White.png', 'Custom_Friends.png', 'Custom_Grinch.png', 'Custom_Snoopy.png']
  const mattePaths = ['Beige.png', 'Black.png', 'Black_White.png', 'Brown.png', 'Green.png', 'White.png', 'White_Black.png', 'Custom_Friends.png', 'Custom_Grinch.png', 'Custom_Snoopy.png']
  const matteIds = ['beige', 'black', 'black-white', 'brown', 'green', 'white', 'white-black', 'custom-friends', 'custom-grinch', 'custom-snoopy']
  assert.match(productData, /\/shop\/products\/frames\/\$\{filename\}/)
  for (const path of framePaths) assert.match(productData, new RegExp(path.replace('.', '\\.')))
  for (const path of mattePaths) assert.match(productData, new RegExp(path.replace('.', '\\.')))
  assert.ok(framePaths.every((path, index) => index === 0 || productData.indexOf(path) > productData.indexOf(framePaths[index - 1])))
  const mattes = productData.slice(productData.indexOf('export const shopMattes'))
  assert.ok(matteIds.every((id, index) => index === 0 || mattes.indexOf(`['${id}'`) > mattes.indexOf(`['${matteIds[index - 1]}'`)))
  assert.doesNotMatch(productData, /\/shop\/configurator\/(?:device|frames|mattes)/)
})

test('display is independent, defaults dark, and is persisted without entering price math', () => {
  assert.match(productData, /id: 'dark'.*\/shop\/products\/device\/Dark\.png/)
  assert.match(productData, /id: 'light'.*\/shop\/products\/device\/Light\.png/)
  assert.match(configurator, /useState<DisplayMode>\('dark'\)/)
  assert.match(configurator, /setSelectedDisplay\(item\.id\)/)
  assert.match(configurator, /display: selectedDisplay/)
  assert.match(cart, /display: DisplayMode/)
  assert.doesNotMatch(logic, /display/i)
})

test('configuration is changed only through the option lists', () => {
  assert.doesNotMatch(configurator, /Previous combination|Next combination/)
  assert.doesNotMatch(configurator, /function cycle|cycleCombination|combinationAt|combinationIndex/)
  assert.doesNotMatch(logic, /cycleCombination|combinationAt|combinationIndex/)
})

test('the combined configurator is seamless and precedes product copy on mobile', () => {
  assert.doesNotMatch(configuratorStyles, /\.summaryCard\s*\{[^}]*border-top/s)
  assert.ok(configurator.indexOf('<ProductStory className={styles.mobileStory} />') > configurator.indexOf('className={styles.purchaseColumn}'))
  assert.match(configuratorStyles, /\.mobileStory\s*\{\s*display: none;/)
  assert.match(configuratorStyles, /\.desktopStory\s*\{[\s\S]*grid-row: 3;/)
})

test('direct selectors update only their selected dimension', () => {
  assert.match(configurator, /setFrameId\(event\.target\.value\); setAdded\(false\)/)
  assert.match(configurator, /setMatteId\(event\.target\.value\); setAdded\(false\)/)
})

test('pricing charges only upgrades over the cheapest included options', () => {
  assert.match(productData, /price: number \| null/)
  assert.match(logic, /selectedPrice - Math\.min/)
  assert.match(logic, /selectedPrice === null\) return 0/)
  assert.match(logic, /basePrice \+ frameUpgrade \+ matteUpgrade/)
  assert.doesNotMatch(configurator, /Price pending|Pending matte price/)
})

test('cart persists structured display, frame, and matte data', () => {
  assert.match(cart, /frame: Pick<ShopFrame/)
  assert.match(cart, /matte: Pick<ShopMatte/)
  assert.match(cart, /window\.localStorage\.setItem/)
  assert.match(configurator, /frame: \{ id: frame\.id, name: frame\.name, price: frame\.price \}/)
  assert.match(configurator, /matte: \{ id: matte\.id, name: matte\.name, price: matte\.price \}/)
  assert.match(configurator, /frameUpgrade,/)
  assert.match(configurator, /matteUpgrade,/)
})

test('cart summary omits display appearance while retaining frame and matte', () => {
  assert.doesNotMatch(cartPage, /<dt className="inline">Display:/)
  assert.match(cartPage, /<dt className="inline">Frame:/)
  assert.match(cartPage, /<dt className="inline">Matte:/)
})

test('cart combines identical configurations into one quantity', () => {
  assert.match(cart, /const matchingItem = items\.find/)
  assert.match(cart, /existing\.productId === item\.productId/)
  assert.match(cart, /existing\.display === item\.display/)
  assert.match(cart, /existing\.frame\.id === item\.frame\.id/)
  assert.match(cart, /existing\.matte\.id === item\.matte\.id/)
  assert.match(cart, /updateCartItemQuantity\(matchingItem\.id, matchingItem\.quantity \+ addedQuantity\)/)
})

test('cart route supports quantity, removal, discounts, totals, and checkout', () => {
  assert.match(cartRoute, /<CartPage \/>/)
  assert.match(cartRoute, /<ShopHeader language="en" \/>/)
  assert.match(cartPage, /updateCartItemQuantity/)
  assert.match(cartPage, /removeCartItem/)
  assert.match(cartPage, /Discount code/)
  assert.match(cartPage, /Order summary/)
  assert.match(cartPage, /CHECKOUT/)
  assert.match(cart, /SHOP_CART_CHANGED/)
})

test('configurator implementation contains no binary assets', () => {
  function files(path) {
    return readdirSync(path).flatMap((name) => {
      const entry = `${path}/${name}`
      return statSync(entry).isDirectory() ? files(entry) : [entry]
    })
  }
  assert.equal(files('app/shop/configure').some((path) => /\.(png|jpe?g|webp|gif|svg|ico|pdf)$/i.test(path)), false)
})

test('preview uses fixed, independent CSS placeholder layers', () => {
  assert.match(configurator, /function FramePlaceholder/)
  assert.match(configurator, /function MattePlaceholder/)
  assert.match(configurator, /function DevicePlaceholder/)
  assert.match(configurator, /<FramePlaceholder frameId=/)
  assert.match(configurator, /<MattePlaceholder matteId=/)
  assert.match(configurator, /<DevicePlaceholder display=/)
  assert.match(configurator, /aspect-\[4\/3\].*max-w-\[760px\]/)
  assert.match(configurator, /frameAppearances\[frameId\]/)
  assert.match(configurator, /matteAppearances\[matteId\]/)
  assert.match(configurator, /FramePlaceholder[\s\S]*inset-\[8%\][\s\S]*h-\[12%\][\s\S]*w-\[9%\]/)
  assert.match(configurator, /FramePlaceholder[\s\S]*inset-x-\[9%\] inset-y-\[12%\]/)
  assert.match(configurator, /MattePlaceholder[\s\S]*inset-x-\[13%\] inset-y-\[15\.5%\]/)
  assert.match(configurator, /MattePlaceholder[\s\S]*h-\[14\.5%\][\s\S]*w-\[10\.15%\]/)
  assert.match(configurator, /MattePlaceholder[\s\S]*inset-x-\[10\.15%\] inset-y-\[14\.5%\]/)
  assert.match(configurator, /DevicePlaceholder[\s\S]*inset-x-\[20\.5%\] inset-y-\[25\.5%\]/)
  assert.doesNotMatch(configurator, /<img|previewSrc|configuratorPreviewSrc|NormalizedLayer/)
})

test('preview sits flat and swaps dimension layers without motion', () => {
  assert.match(configuratorStyles, /transform: scale\(0\.94\)/)
  assert.doesNotMatch(configuratorStyles, /perspective|rotate[XYZ]?\(/)
  assert.match(configurator, /FramePlaceholder[\s\S]*z-30/)
  assert.match(configurator, /MattePlaceholder[\s\S]*z-20/)
  assert.match(configurator, /DevicePlaceholder[\s\S]*z-10/)
  assert.match(configurator, /aspect-\[4\/3\].*max-w-\[760px\] overflow-hidden/)
  assert.doesNotMatch(configuratorStyles, /animation|translateX|keyframes/)
  assert.doesNotMatch(configurator, /useLayerTransition|incoming|outgoing|transitionDirection/)
})
