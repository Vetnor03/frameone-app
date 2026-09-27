import { X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const trust = source('frame/src/network/BackendTrust.cpp')
const network = source('frame/src/network/NetClient.cpp')
const firmware = source('frame/src/network/FirmwareUpdater.cpp')
const firmwareHeader = source('frame/src/network/FirmwareUpdater.h')
const clock = source('frame/src/device/TimeSync.cpp')
const prepare = source('frame/tools/prepare_arduino_sketch.py')

test('backend TLS trust anchors are two authentic, still-valid ISRG ROOT certificates', () => {
  const certs = trust.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)
  assert.equal(certs?.length, 2)
  const parsed = certs.map((pem) => new X509Certificate(pem))
  assert.deepEqual(parsed.map((cert) => cert.fingerprint256), [
    '96:BC:EC:06:26:49:76:F3:74:60:77:9A:CF:28:C5:A7:CF:E8:A3:C0:AA:E1:1A:8F:FC:EE:05:C0:BD:DF:08:C6',
    '69:72:9B:8E:15:A8:6E:FC:17:7A:57:AF:B7:17:1D:FC:64:AD:D2:8C:2F:CA:8C:F1:50:7E:34:45:3C:CB:14:70',
  ])
  assert.ok(parsed.every((cert) => cert.ca))
  assert.match(trust, /client\.setCACert\(kRootCaPem\)/)
})

test('production HTTPS is fail-closed for untrusted origins, missing time, and redirects', () => {
  for (const sourceText of [trust, network, firmware]) {
    assert.doesNotMatch(sourceText, /\.setInsecure\s*\(/)
  }
  assert.match(trust, /url\.startsWith\(prefix\)/)
  assert.match(trust, /base\.startsWith\("https:\/\/"\)/)
  assert.match(trust, /TimeSync::ensure\(timeoutMs\)/)
  assert.match(clock, /now >= 1767225600/)
  assert.match(network, /BackendTrust::configure\(g_tlsClient\)/)
  assert.match(network, /BackendTrust::isTrustedBackendUrl\(url\)/)
  assert.match(network, /BackendTrust::ensureClock\(\)/)
  assert.match(network, /HTTPC_DISABLE_FOLLOW_REDIRECTS/)
  assert.doesNotMatch(network, /HTTPC_STRICT_FOLLOW_REDIRECTS/)
  assert.match(firmware, /BackendTrust::configure\(secureClient\)/)
  assert.equal((firmware.match(/BackendTrust::isTrustedBackendUrl\(url\)/g) || []).length, 2)
  assert.equal((firmware.match(/HTTPC_DISABLE_FOLLOW_REDIRECTS/g) || []).length, 2)
  assert.doesNotMatch(firmware, /WiFiClient plainClient/)
  assert.doesNotMatch(firmwareHeader, /isHttpsUrl/)
})

test('Arduino IDE packaging discovers the new backend trust implementation', () => {
  assert.match(prepare, /SOURCE_ROOT\.rglob\("\*"\)/)
  assert.match(prepare, /"\.cpp"/)
  assert.match(trust, /#include "BackendTrust.h"/)
  assert.match(network, /#include "BackendTrust.h"/)
  assert.match(firmware, /#include "BackendTrust.h"/)
})
