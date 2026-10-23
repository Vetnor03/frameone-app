import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'

const root=new URL('../',import.meta.url)
const read=path=>readFile(new URL(path,root),'utf8')

test('normal RE:MIND firmware has typography audit disabled by default',async()=>{
  const [config,platform,sketch]=await Promise.all([
    read('frame/src/core/Config.h'),
    read('frame/platformio.ini'),
    read('frame/src/frame_v2.5.1.ino'),
  ])
  assert.match(config,/#ifndef TYPOGRAPHY_AUDIT_ENABLED\s+#define TYPOGRAPHY_AUDIT_ENABLED 0/)
  assert.match(platform,/default_envs = alfred_v1_2/)
  assert.match(platform,/\[env:alfred_v1_2_typography_audit\]/)
  assert.match(platform,/-DTYPOGRAPHY_AUDIT_ENABLED=1/)
  assert.match(sketch,/TypographyAudit::begin\(\);\s+return;\s+#endif\s+Serial.begin/)
  assert.match(sketch,/void loop\(\)\s*\{\s*#if TYPOGRAPHY_AUDIT_ENABLED\s+TypographyAudit::poll/)
})

test('diagnostic is opt-in, USB-gated and does not write NVS or contact the network',async()=>{
  const source=await read('frame/src/display/TypographyAudit.cpp')
  assert.match(source,/#if TYPOGRAPHY_AUDIT_ENABLED/)
  assert.match(source,/#if !defined\(FRAME_IS_ALFRED_V1_2\)/)
  assert.match(source,/HardwareProfile::kPgoodN/)
  assert.match(source,/digitalRead\(HardwareProfile::kPgoodN\) == LOW/)
  assert.match(source,/DisplayCore::end\(\)/)
  assert.match(source,/setFullWindow\(\)/)
  assert.match(source,/firstPage\(\)/)
  assert.match(source,/nextPage\(\)/)
  for(const unsafe of ['WiFi.begin(', 'Preferences ', 'FirmwareUpdater',
    'NetClient::', 'DeviceIdentity::','OTA', 'putString(', 'putBool(']){
    // OTA is mentioned in a human-readable "NO OTA" safety label.
    if(unsafe==='OTA')continue
    assert.ok(!source.includes(unsafe),'unexpected diagnostic side effect: '+unsafe)
  }
})

test('calibration contains multi-family candidates and real 1x1 frame samples',async()=>{
  const source=await read('frame/src/display/TypographyAudit.cpp')
  for(const name of ['FreeSans9pt8b','FreeSans12ptNO8b',
    'FreeSansBold12pt8b','FreeSansBold18pt8b','FreeSansBold24pt7b',
    'FreeSerif9pt7b','FreeSerif12pt7b','FreeSerif18pt7b',
    'FreeSerifBold18pt7b','FreeSerifBold24pt7b']){
    assert.ok(source.includes(name),'Missing comparison font '+name)
  }
  assert.match(source,/constexpr int kWidth = 800/)
  assert.match(source,/constexpr int kHeight = 480/)
  assert.match(source,/200;\s+const int y = \(i \/ 4\) \* 120;/)
  assert.match(source,/pageFamilies\(\)/)
  assert.match(source,/pageDistance\(\)/)
  assert.match(source,/pageGrid\(false\)/)
  assert.match(source,/pageGrid\(true\)/)
  assert.match(source,/FrameText::normalizeUtf8ForDisplay/)
  assert.match(source,/Serial.printf\("Type QA: %s ink bounding box/)
  assert.match(source,/Serif characters Æ\/Ø\/Å are NOT supported/)
})
