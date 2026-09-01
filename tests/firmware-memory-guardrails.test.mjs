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

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('reminder change check hashes the bounded compact response directly', () => {
  const fn = update.match(/bool UpdateChecker::hasRemindersChanged[\s\S]*?\n}/)?.[0] ?? '';
  assert.doesNotMatch(fn, /StaticJsonDocument|deserializeJson|serializeJson/);
  assert.match(fn, /REMINDERS_MAX_BODY_BYTES/);
  assert.match(fn, /reminderHashSig\(body\)/);
});

test('physical reminder URL and six-field DTO stay compact', () => {
  for (const source of [update, reminders]) {
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
  assert.equal((assistant.match(/static AssistantCache g_cache/g) || []).length, 1);
  assert.match(assistant, /MAX_RESPONSE_BYTES = 6144/);
  assert.match(assistant, /body\.length\(\)>MAX_RESPONSE_BYTES/);
  assert.match(assistant, /DeserializationOption::Filter/);
  assert.match(assistant, /MAX_UPDATES = 8/);
  const renderer = assistant.slice(assistant.indexOf('void render('));
  assert.doesNotMatch(renderer, /\bString\b|\bnew\s+[A-Za-z_:][A-Za-z0-9_:]*\s*[\[(]|malloc|calloc|std::vector/);
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
