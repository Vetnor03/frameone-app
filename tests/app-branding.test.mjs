import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('web install metadata consistently uses the RE:MIND brand and canonical logo', async () => {
  const [layout, manifest, favicon, serviceWorker, splash] = await Promise.all([
    read('app/layout.tsx'),
    read('app/manifest.ts'),
    read('app/favicon.ico/route.ts'),
    read('public/sw.js'),
    read('app/HomePageClient.tsx'),
  ])

  assert.doesNotMatch(layout, /Re-mind/)
  assert.match(layout, /title: "RE:MIND"/)
  assert.match(layout, /versionedIconPath\("\/r_Logo\.png"\)/)
  assert.doesNotMatch(manifest, /Re-mind|android-chrome|icon-\d+x\d+/)
  assert.match(manifest, /name: 'RE:MIND'/)
  assert.match(manifest, /short_name: 'RE:MIND'/)
  assert.equal(manifest.match(/versionedIconPath\('\/r_Logo\.png'\)/g)?.length, 2)
  assert.match(favicon, /versionedIconPath\('\/r_Logo\.png'\)/)
  assert.match(serviceWorker, /icon: '\/r_Logo\.png'/)
  assert.match(serviceWorker, /badge: '\/r_Logo\.png'/)
  assert.match(splash, /src="\/r_Logo\.png"/)
})

test('iOS app icon catalog references the canonical logo without a generated asset', async () => {
  const catalog = JSON.parse(await read('ios/App/Assets.xcassets/AppIcon.appiconset/Contents.json'))

  assert.equal(catalog.images.length, 1)
  assert.equal(catalog.images[0].filename, '../../../../public/r_Logo.png')
})
