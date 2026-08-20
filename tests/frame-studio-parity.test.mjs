import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const modules=['date','reminders','weather','countdown','surf','soccer','stocks','groceries']
const sizes=['small','medium','large','xl']
const read=(path)=>readFile(new URL(path,root),'utf8')

test('every current module has a complete structural contract consumed by Studio',async()=>{
  const [profiles,ui,lib]=await Promise.all([read('shared/module-layout-profiles.json').then(JSON.parse),read('app/frame-simulator/FrameSimulator.tsx'),read('app/lib/frameSimulator.ts')])
  for(const module of modules){for(const size of sizes)assert.ok(profiles[module][size],`${module}.${size}`);assert.match(ui,new RegExp(`moduleProfiles\\.${module}\\.`))}
  assert.match(lib,/function visualContractFor/)
})

test('geometry mapping and unsupported behavior remain closed',async()=>{
  const [lib,ui]=await Promise.all([read('app/lib/frameSimulator.ts'),read('app/frame-simulator/FrameSimulator.tsx')])
  assert.match(ui,/colSpan===4&&cell\.rowSpan===1\?'SMALL'/);assert.match(ui,/colSpan===2&&cell\.rowSpan===2\?'MEDIUM'/)
  assert.match(ui,/colSpan===4&&cell\.rowSpan===2\?'LARGE'/);assert.match(ui,/colSpan===4&&cell\.rowSpan===4\?'XL'/)
  assert.match(lib,/\.includes\(`\$\{colSpan\}x\$\{rowSpan\}`\)/);assert.match(ui,/UNSUPPORTED — NEEDS NEW VARIANT/)
})

test('reminder contract matches adaptive firmware composition',async()=>{
  const [p,ui]=await Promise.all([read('shared/module-layout-profiles.json').then(JSON.parse),read('app/frame-simulator/FrameSimulator.tsx')])
  assert.equal(p.reminders.medium.layout,'adaptive-centered-list');assert.equal(p.reminders.medium.maxTodayItems,4);assert.equal(p.reminders.medium.maxFutureItems,3)
  assert.deepEqual(p.reminders.medium.regions,['overflow','tomorrowNote','futureDateBadge']);assert.equal(p.reminders.medium.badgeMode,'fixed-white-black')
  assert.equal(p.reminders.large.leftPanel,'medium');assert.equal(p.reminders.xl.topLeftPanel,'medium');assert.equal(p.reminders.xl.bottomLeftPanel,'datedReminderRows');assert.equal(p.reminders.xl.dateColumn,true)
  const reminderSource=ui.slice(ui.indexOf('function drawReminderMedium'),ui.indexOf('function drawReminders'))
  assert.doesNotMatch(reminderSource,/cols=|cellW=c\.w\/cols/);assert.match(reminderSource,/Tomorrow: 2/);assert.match(reminderSource,/\+\$\{d\.length-1-visible\} more/)
})

test('fixed badges and calendar marker primitives match firmware colors and states',async()=>{
  const [p,ui,mirror]=await Promise.all([read('shared/module-layout-profiles.json').then(JSON.parse),read('app/frame-simulator/FrameSimulator.tsx'),read('app/HomePageClient.tsx')])
  assert.equal(p.date.medium.badgeMode,'fixed-white-black');assert.equal(p.countdown.medium.badgeMode,'fixed-white-black');assert.deepEqual(p.date.calendar.markers,['todayCircle','holidayDot'])
  assert.deepEqual(p.countdown.xl.calendarMarkers,['crossedDay','targetCircle']);assert.deepEqual(p.reminders.large.calendarMarkers,['todayCircle','reminderDots'])
  assert.match(ui,/ctx\.fillStyle='#fff';ctx\.fillRect\(bx,y,badgeW,badgeH\);ctx\.fillStyle='#000'/);assert.match(ui,/isDate&&\[24,31\]\.includes\(day\)/);assert.match(ui,/isReminder&&!isToday&&\[7,12,24\]\.includes\(day\)/)
  assert.match(mirror,/backgroundColor: '#ffffff', color: '#000000'/);assert.match(mirror,/className="[^\"]*bg-white[^\"]*text-black"/)
})

test('groceries, surf, soccer, stocks and weather expose physical hierarchy',async()=>{
  const p=JSON.parse(await read('shared/module-layout-profiles.json'))
  assert.deepEqual(p.groceries.small.headerModes,['list','todayDinner']);assert.equal(p.groceries.medium.todayDinnerLabel,true);assert.deepEqual(p.groceries.xl.topPanels,['Grocery List','Weekly Menu'])
  for(const size of sizes)assert.ok(p.surf[size].ratingVisual||p.surf[size].forecastColumns,`surf ${size} rating/forecast footprint`)
  assert.equal(p.surf.medium.directionIcons,2);assert.equal(p.surf.medium.metricIcons,2);assert.deepEqual(p.surf.large.labels,['Morning','Noon','Afternoon','Evening']);assert.equal(p.surf.xl.topRegions,3);assert.equal(p.surf.xl.forecastColumns,4)
  assert.equal(p.soccer.small.bottomStatRegions,3);assert.deepEqual(p.soccer.large.standingsColumns,['P','Team','Pts','Gap','GD']);assert.equal(p.soccer.xl.leftPanel,'teamSummary');assert.equal(p.soccer.xl.rightPanel,'standings')
  assert.equal(p.stocks.xl.headlineValues,3);assert.equal(p.stocks.xl.detailGroups,3);assert.equal(p.stocks.xl.detailRows,2);assert.ok(p.stocks.xl.chartRegion)
  assert.equal(p.weather.xl.topColumns,3);assert.equal(p.weather.large.columns,4)
})

test('audit matrix has exactly one truthful row for every module and size',async()=>{
  const audit=await read('docs/frame-studio-module-parity.md'),rows=audit.split('\n').filter(line=>/^\| (Date|Reminders|Weather|Countdown|Surf|Soccer|Stocks|Groceries) \|/.test(line))
  assert.equal(rows.length,32);const keys=new Set(rows.map(row=>{const cells=row.split('|').map(x=>x.trim());return `${cells[1].toLowerCase()}:${cells[2].toLowerCase()}`}));assert.equal(keys.size,32)
  for(const module of modules)for(const size of sizes)assert.ok(keys.has(`${module}:${size}`),`${module} ${size}`)
  for(const row of rows)assert.match(row,/\| PARITY(?: — (?:browser font rasterization differs|deterministic icon placeholder approximates firmware artwork))? \|$/)
})
