import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
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
  for (const legacyMatcher of [
    '/favicon.svg',
    '/favicon-:size.png',
    '/apple-touch-icon.png',
    '/apple-touch-icon-:size.png',
    '/android-chrome-:size.png',
    '/icon-:size.png',
  ]) {
    assert.ok(middleware.includes(`'${legacyMatcher}'`), `${legacyMatcher} must reach the redirect middleware`)
  }
  assert.match(serviceWorker, /icon: '\/AppLogo\.png'/)
  assert.match(serviceWorker, /badge: '\/AppLogo\.png'/)

  for (const obsoleteIcon of ['public/favicon.ico', 'public/favicon.svg', 'public/remind-icon.svg']) {
    await assert.rejects(access(new URL(`../${obsoleteIcon}`, import.meta.url)))
  }
})

test('custom launch splash is distinct from the app icon and matches native startup artwork', async () => {
  const [home, splash, styles] = await Promise.all([
    read('app/HomePageClient.tsx'),
    read('app/components/StartupSplash.tsx'),
    read('app/globals.css'),
  ])

  assert.doesNotMatch(home, /src="\/r_Logo\.png"/)
  assert.match(home, /<StartupSplash language=\{language\} \/>/)
  assert.match(splash, /remind-splash-logo/)
  assert.match(splash, /viewBox="0 0 300 60"/)
  assert.match(splash, /strokeWidth="2\.4"/)
  assert.match(splash, /M261 0V60H275/)
  assert.match(styles, /transition: opacity 190ms/)
  assert.doesNotMatch(styles, /@keyframes remind-wordmark-expand/)
})

test('iOS app icon catalog references the required 1024px derivative', async () => {
  const catalog = JSON.parse(await read('ios/App/Assets.xcassets/AppIcon.appiconset/Contents.json'))

  assert.equal(catalog.images.length, 1)
  assert.equal(catalog.images[0].filename, 'AppLogo-1024.png')
})
