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

test('engraving calibration exists only behind explicit opt-in artwork gate',async()=>{
  const [config,platform,main,art]=await Promise.all([
    read('frame/src/core/Config.h'),
    read('frame/platformio.ini'),
    read('frame/src/display/TypographyAudit.cpp'),
    read('frame/src/display/TypographyArt.cpp'),
  ])
  assert.match(config,/#ifndef TYPOGRAPHY_ART_AUDIT_ENABLED\s+#define TYPOGRAPHY_ART_AUDIT_ENABLED 0/)
  assert.match(platform,/-DTYPOGRAPHY_ART_AUDIT_ENABLED=1/)
  assert.match(art,/#if TYPOGRAPHY_AUDIT_ENABLED && TYPOGRAPHY_CANDIDATE_FONTS_ENABLED/)
  assert.match(main,/#if TYPOGRAPHY_ART_AUDIT_ENABLED/)
  assert.match(main,/TypographyArt::drawAtlas\(\)/)
  assert.match(main,/TypographyArt::drawComparison\(\)/)
  assert.match(main,/TypographyArt::drawLarge\(\)/)
  assert.match(main,/TypographyArt::drawLayout\(\)/)
  assert.match(main,/command == '0'\) nextPage = 9/)
  assert.match(main,/constexpr uint8_t kPageCount = 10/)
})

test('illustration test compares same 1-bit art at real module size across stroke, hatch and stipple densities',async()=>{
  const s=await read('frame/src/display/TypographyArt.cpp')
  for(const token of ['kFine={1,3,30,6}','kBalanced={2,6,17,4}',
    'kBold={3,10,8,2}','drawLine','drawPixel','drawRect',
    'engraving(art,styles[i])','engraving({23,81,754,354},kFine)',
    'engraving({539,293,237,164},kBalanced)',
    'botanic({690,10,95,133},kBalanced)']){
    assert.ok(s.includes(token),'Missing engraving QA parameter: '+token)
  }
  for(const risk of ['WiFi.begin(', 'Preferences ', 'OTA.begin(', 'esp_deep_sleep_start(', 'ESP.restart(']){
    assert.ok(!s.includes(risk),'The artwork-only renderer must not alter device state: '+risk)
  }
  const w=await read('.github/workflows/frame-typography-calibration.yml')
  assert.match(w,/Compile fancy-font Arduino IDE sketch/)
  assert.match(w,/RE-MIND-Art-And-Fonts-Arduino-IDE.zip/)
  assert.match(w,/TYPOGRAPHY_ART_AUDIT_ENABLED 1/)
})
