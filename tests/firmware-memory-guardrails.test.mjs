import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (p) => readFileSync(p, 'utf8');
const update = read('frame/src/network/UpdateChecker.cpp');
const reminders = read('frame/src/modules/ModuleReminders.cpp');
const surf = read('frame/src/modules/ModuleSurf.cpp');
const countdown = read('frame/src/modules/ModuleCountdown.cpp');
const soccer = read('frame/src/modules/ModuleSoccer.cpp');
const stocks = read('frame/src/modules/ModuleStocks.cpp');
const groceries = read('frame/src/modules/ModuleGroceries.cpp');
const assistant = read('frame/src/modules/ModuleAssistant.cpp');
const firmware = read('frame/src/frame_v2.5.1.ino');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('scheduled change check fetches only the compact SHA-256 signature', () => {
  const fn = update.match(/bool UpdateChecker::fetchContentSignature[\s\S]*?\n}/)?.[0] ?? '';
  assert.match(fn, /content-signature/);
  assert.match(fn, /StaticJsonDocument<192>/);
  assert.match(fn, /strlen\(signature\) != 64/);
});

test('physical reminder URL and six-field DTO stay compact', () => {
  for (const source of [reminders]) {
    assert.match(source, /limit=10&tz=Europe\/Oslo&skip_sync=1/);
    assert.doesNotMatch(source, /limit=20&tz=Europe\/Oslo/);
  }
  for (const field of ['title', 'occurrence_date', 'display_date', 'days_until', 'is_overdue', 'display_time']) {
    assert.match(reminders, new RegExp(`itemFilter\\["${field}"\\]`));
  }
  for (const removed of ['reminder_id', 'repeat', 'due_time']) assert.doesNotMatch(reminders, new RegExp(`itemFilter\\["${removed}"\\]`));
  assert.match(reminders, /MAX_REMINDERS = 10/);
});

test('firmware has no StaticJsonDocument above 2048 bytes', () => {
  for (const file of walk('frame/src').filter((p) => /\.(?:cpp|h|ino)$/.test(p))) {
    for (const match of read(file).matchAll(/StaticJsonDocument\s*<\s*(\d+)\s*>/g)) {
      assert.ok(Number(match[1]) <= 2048, `${file} reserves ${match[1]} bytes`);
    }
  }
});

test("Today's Best releases selection JSON before winner JSON", () => {
  assert.match(surf, /\{[\s\S]*DynamicJsonDocument selectionDoc[\s\S]*\n  \}[\s\S]*DynamicJsonDocument docWinner/);
  assert.doesNotMatch(surf, /StaticJsonDocument<24576>/);
});

test('Countdown is bounded, filtered, fail-soft, and never logs the body', () => {
  assert.match(countdown, /COUNTDOWN_MAX_BODY_BYTES/);
  assert.match(countdown, /DeserializationOption::Filter/);
  assert.doesNotMatch(countdown, /CD_LOGLN\(body\)/);
  assert.match(countdown, /g_cache\.ok = false/);
});

test('modified network modules declare response caps and fail softly', () => {
  const modules = ['ModuleReminders.cpp', 'ModuleSurf.cpp', 'ModuleCountdown.cpp', 'ModuleWeather.cpp', 'ModuleSoccer.cpp', 'ModuleStocks.cpp'];
  for (const name of modules) {
    const source = read(`frame/src/modules/${name}`);
    assert.match(source, /MAX_BODY_BYTES/);
    assert.match(source, /body\.length\(\)\s*>\s*\w+_MAX_BODY_BYTES/);
    assert.match(source, /return false/);
  }
  const config = read('frame/src/core/FrameConfig.cpp');
  assert.match(config, /FRAME_CONFIG_MAX_BODY_BYTES/);
  assert.match(config, /return FETCH_ERROR/);
});

test('behavior-defining constants and rendering code remain present', () => {
  assert.match(reminders, /buildBuckets/);
  assert.match(reminders, /bucketComesBefore|compareReminder|daysUntil/);
  assert.match(surf, /appendFuelPenaltyParamsIfNeeded/);
  assert.match(surf, /wantDayparts/);
  assert.match(countdown, /getRotationStep4h/);
  for (const source of [reminders, surf, countdown]) assert.match(source, /render\(/);
});

test('adaptive Surf formatting scratch and daypart labels do not consume static DRAM', () => {
  const adaptive = surf.slice(surf.indexOf('static SurfAdaptivePolicy::Input adaptiveSurfInput'));
  assert.doesNotMatch(adaptive, /static char (?:spot|wave)\[/);
  assert.doesNotMatch(adaptive, /static const char\* labels\[/);
  assert.match(adaptive, /char spot\[64\] = \{0\};/);
  assert.match(adaptive, /char wave\[32\] = \{0\};/);
});

test('adaptive Soccer policy and formatting scratch do not consume static DRAM', () => {
  const adaptive = soccer.slice(soccer.indexOf('// BEGIN ADAPTIVE SOCCER RENDERER'), soccer.indexOf('// END ADAPTIVE SOCCER RENDERER'));
  assert.doesNotMatch(adaptive, /\bstatic\s+(?:char|SoccerRect)\s+\w+\s*\[/);
  assert.match(adaptive, /char home3\[8\]/);
  assert.match(adaptive, /char record\[40\]/);
});

test('adaptive Stocks reuses its cache and keeps policy/formatting scratch off static DRAM', () => {
  const adaptive = stocks.slice(stocks.indexOf('// BEGIN ADAPTIVE STOCKS RENDERER'), stocks.indexOf('// END ADAPTIVE STOCKS RENDERER'));
  assert.doesNotMatch(adaptive, /\bstatic\s+(?:char|float|StocksRect)\s+\w+\s*\[/);
  assert.doesNotMatch(adaptive, /float\s+(?:series|points)\s*\[/);
  assert.match(adaptive, /drawChartBox\(chart\.x, chart\.y, chart\.w, chart\.h, data\)/);
  assert.match(adaptive, /char priceTxt\[24\]/);
});

test('adaptive Groceries reuses its sole cache and has no static row scratch', () => {
  assert.equal((groceries.match(/static GroceryCache g_cache;/g) || []).length, 1);
  const adaptive = groceries.slice(groceries.indexOf('// BEGIN ADAPTIVE GROCERIES RENDERER'), groceries.indexOf('// END ADAPTIVE GROCERIES RENDERER'));
  assert.doesNotMatch(adaptive, /\bstatic\s+(?:char|int|GroceryItem|DinnerPlanItem)\s+\w+\s*\[/);
  assert.doesNotMatch(adaptive, /\b(?:GroceryItem|DinnerPlanItem|RunningLowInsight|RecipeInsight)\s+\w+\s*\[/);
  assert.doesNotMatch(adaptive, /\bString\b|\bnew\s+[A-Za-z_:][A-Za-z0-9_:]*\s*[\[(]|malloc|calloc/);
  assert.match(adaptive, /getRotationStep4h\(\)/);
});

test('AI Follow uses one bounded cache, filtered capped JSON, and allocation-free render scratch', () => {
  assert.doesNotMatch(assistant, /static AssistantCache g_cache\s*=/);
  assert.equal((assistant.match(/static AssistantCache\* g_cache/g) || []).length, 1);
  assert.equal((assistant.match(/new \(std::nothrow\) AssistantCache\{\}/g) || []).length, 1);
  assert.match(assistant, /if \(g_cacheAllocationAttempted\) return false/);
  assert.match(assistant, /if\(!cacheAvailable\|\|!g_cache->ok\)/);
  assert.match(assistant, /MAX_RESPONSE_BYTES = 6144/);
  assert.match(assistant, /body\.length\(\)>MAX_RESPONSE_BYTES/);
  assert.match(assistant, /DeserializationOption::Filter/);
  assert.match(assistant, /MAX_UPDATES = 4/);
  assert.match(assistant, /static_assert\(sizeof\(AssistantCache\) == 1030/);
  assert.match(assistant, /DynamicJsonDocument doc\(4096\)/);
  const renderer = assistant.slice(assistant.indexOf('void render('));
  assert.doesNotMatch(renderer, /\bString\b|malloc|calloc|std::vector/);
  assert.doesNotMatch(assistant.slice(assistant.indexOf('static void wrapSummary'), assistant.indexOf('void reset(')), /\bnew\b|malloc|calloc/);
  assert.doesNotMatch(assistant, /Serial\.(?:print|println)\(body/);
});

test('Reminders render paths keep SmartReminderLayout scratch storage off the task stack', () => {
  assert.match(reminders, /static SmartReminderLayout\* g_smartLayoutScratch = nullptr;/);
  assert.match(reminders, /sizeof\(SmartReminderLayout\) \* 2/);
  assert.match(reminders, /heap_caps_malloc\(scratchBytes, MALLOC_CAP_8BIT\)/);
  assert.doesNotMatch(reminders, /\bstatic\s+SmartReminderLayout\s+(?!\*)[A-Za-z_]\w*/);
  assert.doesNotMatch(reminders, /^\s+(?!static\b)SmartReminderLayout\s+(?![&*])[A-Za-z_]\w*\s*(?:[;={])/m);
  assert.doesNotMatch(reminders, /SmartReminderLayout\s*\{\s*\}/);
});

test('Reminders keeps its profile cache in one lifetime heap allocation', () => {
  assert.doesNotMatch(reminders, /static\s+ReminderCache\s+g_cache\s*;/);
  assert.equal((reminders.match(/static ReminderCache\* g_cache = nullptr;/g) || []).length, 1);
  assert.equal((reminders.match(/new \(std::nothrow\) ReminderCache\{\}/g) || []).length, 1);
  assert.match(reminders, /static bool g_cacheAllocationAttempted = false;/);
  assert.match(reminders, /if \(g_cacheAllocationAttempted\) return false;[\s\S]*g_cacheAllocationAttempted = true;[\s\S]*new \(std::nothrow\) ReminderCache\{\}/);
  assert.doesNotMatch(reminders, /delete\s+g_cache|free\s*\(\s*g_cache/);
  assert.match(reminders, /static_assert\(sizeof\(ReminderCache\) <= 4096/);
  assert.doesNotMatch(reminders, /static_assert\(sizeof\(ReminderCache\) ==/);
});

test('Reminders heap-cache failure is terminal and renders an unavailable state safely', () => {
  assert.match(reminders, /if \(!g_cache\) REM_LOGLN\("reminders cache allocation failed"\)/);
  assert.match(reminders, /static void clearCache\(\) \{\s*if \(g_cache\) memset\(g_cache, 0, sizeof\(\*g_cache\)\);\s*\}/);
  assert.doesNotMatch(reminders, /\*g_cache\s*=\s*ReminderCache\{\}/);
  assert.match(reminders, /if \(!ensureLoaded\(\)\) \{[\s\S]*drawEmptyState\(c, "No reminders", "Unavailable"\);[\s\S]*return;/);
  assert.doesNotMatch(reminders, /static\s+(?:ReminderItem|ReminderCache)\s+(?!\*)\w+/);
});

test('Reminders profiles remain shared by one cache and one request', () => {
  for (const field of ['compactTitle', 'standardTitle', 'spaciousTitle']) {
    assert.match(reminders, new RegExp(`char ${field}\\[74\\]`));
  }
  assert.match(reminders, /ReminderItem items\[MAX_REMINDERS\]/);
  assert.equal((reminders.match(/httpGetAuth\(/g) || []).length, 1);
  assert.match(reminders, /applyProfileTitles\(c\)/);
});

test('layouts without Reminders neither preload nor allocate its cache', () => {
  const dashboard = firmware.slice(firmware.indexOf('static bool renderLoadedDashboard'), firmware.indexOf('static uint64_t explicitTimingRevision'));
  assert.equal((dashboard.match(/ModuleReminders::preload\(\)/g) || []).length, 1);
  assert.match(dashboard, /if \(remindersActive\) ModuleReminders::preload\(\)/);
  const setConfig = reminders.slice(reminders.indexOf('void setConfig('), reminders.indexOf('uint8_t profileForCell'));
  assert.doesNotMatch(setConfig, /ensureCacheAllocated|ensureLoaded|new\s/);
});
