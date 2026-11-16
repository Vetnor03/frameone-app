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
  assert.match(home,/if \(cached && cached\.deviceId === selected\) \{[\s\S]*setShowSplash\(false\)/)
  assert.match(home,/inert=\{appControlsLocked\}/)
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
