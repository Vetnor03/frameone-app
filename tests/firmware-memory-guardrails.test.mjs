import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (p) => readFileSync(p, 'utf8');
const update = read('frame/src/network/UpdateChecker.cpp');
const reminders = read('frame/src/modules/ModuleReminders.cpp');
const surf = read('frame/src/modules/ModuleSurf.cpp');
const countdown = read('frame/src/modules/ModuleCountdown.cpp');

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
