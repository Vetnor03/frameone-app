import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('web install metadata consistently uses the RE:MIND brand and canonical logo', async () => {
  const [layout, manifest, favicon, middleware, serviceWorker] = await Promise.all([
    read('app/layout.tsx'),
    read('app/manifest.ts'),
    read('app/favicon.ico/route.ts'),
    read('app/middleware.ts'),
    read('public/sw.js'),
  ])

  assert.doesNotMatch(layout, /Re-mind/)
  assert.match(layout, /title: "RE:MIND"/)
  assert.match(layout, /versionedIconPath\("\/AppLogo\.png"\)/)
  assert.doesNotMatch(manifest, /Re-mind|android-chrome|icon-\d+x\d+/)
  assert.match(manifest, /name: 'RE:MIND'/)
  assert.match(manifest, /short_name: 'RE:MIND'/)
  assert.equal(manifest.match(/versionedIconPath\('\/AppLogo\.png'\)/g)?.length, 2)
  assert.match(favicon, /versionedIconPath\('\/AppLogo\.png'\)/)
  assert.match(middleware, /LEGACY_BROWSER_ICON_PATH\.test\(pathname\)/)
  assert.match(middleware, /versionedIconPath\('\/AppLogo\.png'\)/)
  assert.match(middleware, /pathname === '\/AppLogo\.png'/)
  assert.match(serviceWorker, /icon: '\/AppLogo\.png'/)
  assert.match(serviceWorker, /badge: '\/AppLogo\.png'/)
})

test('custom splash retains the animated RE:MIND wordmark independently of the app icon', async () => {
  const [splash, styles] = await Promise.all([
    read('app/HomePageClient.tsx'),
    read('app/globals.css'),
  ])

  assert.doesNotMatch(splash, /src="\/r_Logo\.png"/)
  assert.match(splash, /remind-logo-wordmark/)
  assert.match(splash, />R<\/text>/)
  assert.match(splash, />E<\/text>/)
  assert.match(splash, />MIND<\/text>/)
  assert.match(styles, /@keyframes remind-wordmark-expand/)
  assert.match(styles, /@keyframes remind-colon-shift/)
  assert.match(styles, /@keyframes remind-letter-reveal/)
  assert.match(styles, /@keyframes remind-clip-open/)
})

test('iOS app icon catalog references the required 1024px derivative', async () => {
  const catalog = JSON.parse(await read('ios/App/Assets.xcassets/AppIcon.appiconset/Contents.json'))

  assert.equal(catalog.images.length, 1)
  assert.equal(catalog.images[0].filename, 'AppLogo-1024.png')
})
