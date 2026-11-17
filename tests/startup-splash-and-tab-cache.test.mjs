import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home=readFileSync(new URL('../app/HomePageClient.tsx',import.meta.url),'utf8')
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8')
const loading=readFileSync(new URL('../app/loading.tsx',import.meta.url),'utf8')
const splash=readFileSync(new URL('../app/components/StartupSplash.tsx',import.meta.url),'utf8')
const styles=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8')

test('first server response and first client render use branded RE:MIND splash, never a null fallback',()=>{
  assert.match(page,/Suspense fallback=\{<StartupSplashScreen \/>\}/)
  assert.match(loading,/return <StartupSplashScreen \/>/)
  assert.match(splash,/remind-splash-logo/)
  assert.match(home,/\[booting, setBooting\] = useState\(true\)/)
  assert.match(home,/\[showSplash, setShowSplash\] = useState\(true\)/)
  assert.match(home,/\{showSplash && \(/)
  assert.doesNotMatch(styles,/opacity 720ms/)
  assert.doesNotMatch(styles,/filter: blur\(10px\)/)
})

test('cached frame remains hidden behind splash until membership verification',()=>{
  const start=home.indexOf('function applyCachedLaunchPreview')
  const end=home.indexOf('useEffect(() => {',start)
  assert.ok(start>=0 && end>start)
  const hydrate=home.slice(start,end)
  assert.doesNotMatch(hydrate,/setShowSplash\(false\)/)
  assert.match(home,/if \(cached && cached\.deviceId === selected\) \{[\s\S]*setBooting\(false\)/)
  assert.match(home,/inert=\{appControlsLocked \|\| booting \|\| showSplash\}/)
})

test('tab snapshot renders while refreshing but is inert until fresh data is verified',()=>{
  for(const prop of ['showingSavedGroceries','showingSavedReminders']){
    assert.match(home,new RegExp('inert=\\{'+prop+'\\}'))
  }
  assert.match(home,/writeTabSnapshot\(window\.localStorage, userId, activeDeviceId, 'countdown'/)
  assert.match(home,/writeTabSnapshot\(window\.localStorage, userId, activeDeviceId, 'reminders'/)
  assert.match(home,/writeTabSnapshot\(window\.localStorage, userId, activeDeviceId, 'groceries'/)
  assert.match(home,/clearTabSnapshotsForUser\(window\.localStorage, session\.user\.id\)/)
})

test('ready app appears via a real opacity crossfade without stale overlays',()=>{
  assert.match(styles,/transition: opacity 220ms/)
  assert.match(styles,/\.remind-splash-overlay-hiding\s*\{\s*opacity: 0/)
  assert.match(home,/window\.setTimeout\(\(\) => setShowSplash\(false\), reducedMotion \? 0 : 240\)/)
  assert.match(home,/\[booting, showSplash\]/)
  assert.match(home,/aria-hidden=\{!shouldRenderApp \|\| booting \|\| showSplash/)
  assert.match(styles,/@media \(prefers-reduced-motion: reduce\)/)
  assert.equal((home.match(/setShowSplash\(false\)/g)||[]).length, 1)
})

test('native launch and web splash use the same static monoline wordmark',()=>{
  assert.match(splash,/viewBox="0 0 300 60"/)
  assert.match(splash,/strokeWidth="2\.4"/)
  assert.match(splash,/M261 0V60H277/)
  assert.match(styles,/width: min\(52vw, 220px\)/)
  assert.match(home,/return <StartupSplash language=\{language\} \/>/)
  assert.doesNotMatch(styles,/remind-wordmark-expand/)
})
