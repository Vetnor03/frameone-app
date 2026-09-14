from pathlib import Path

path = Path('frame/src/frame_v2.5.1.ino')
data = path.read_bytes()

old = b'''  FrameConfigApi::FetchResult postPairConfig =\n    FrameConfigApi::fetchWithStatus(g_cfg, DeviceIdentity::getToken());\n  if (postPairConfig == FrameConfigApi::FETCH_SETUP_PENDING) {\n'''
new = b'''  FrameConfigApi::FetchResult postPairConfig =\n    FrameConfigApi::fetchWithStatus(g_cfg, DeviceIdentity::getToken());\n\n  // A wake-time backend/network hiccup must never replace a valid e-paper\n  // dashboard with a fatal setup screen. Retry briefly in-place first; if the\n  // service is still unavailable, leave the physical pixels untouched and\n  // retry from a clean wake.\n  if (postPairConfig == FrameConfigApi::FETCH_ERROR) {\n    const uint32_t retryDelaysMs[] = {2000UL, 5000UL};\n    for (uint8_t attempt = 0; attempt < 2 && postPairConfig == FrameConfigApi::FETCH_ERROR; ++attempt) {\n      Serial.printf(\n        "frame-config transient failure; retry %u/2 in %lu ms\\n",\n        (unsigned int)(attempt + 1),\n        (unsigned long)retryDelaysMs[attempt]\n      );\n      delay(retryDelaysMs[attempt]);\n      postPairConfig = FrameConfigApi::fetchWithStatus(g_cfg, DeviceIdentity::getToken());\n    }\n  }\n\n  if (postPairConfig == FrameConfigApi::FETCH_SETUP_PENDING) {\n'''

old_error = b'''  } else if (postPairConfig == FrameConfigApi::FETCH_ERROR) {\n    ensureDisplay();\n    ScreenPairing::showError("Could not load frame");\n    shutdownDisplay();\n  } else if (postPairConfig == FrameConfigApi::FETCH_OK) {\n'''
new_error = b'''  } else if (postPairConfig == FrameConfigApi::FETCH_ERROR) {\n    Serial.println("frame-config still unavailable; preserving existing e-paper content");\n    Serial.println("Retrying frame-config on a clean wake in 10 seconds");\n    plannedDeepSleepSeconds = 10;\n    goToSleepForUs(10ULL * 1000000ULL, pwrEarly.usbPresent);\n  } else if (postPairConfig == FrameConfigApi::FETCH_OK) {\n'''

# Preserve whatever line endings the sketch currently uses.
if old not in data:
    old = old.replace(b'\n', b'\r\n')
    new = new.replace(b'\n', b'\r\n')
if old_error not in data:
    old_error = old_error.replace(b'\n', b'\r\n')
    new_error = new_error.replace(b'\n', b'\r\n')

if data.count(old) != 1:
    raise SystemExit(f'expected one initial frame-config fetch block, found {data.count(old)}')
if data.count(old_error) != 1:
    raise SystemExit(f'expected one transient error screen block, found {data.count(old_error)}')

data = data.replace(old, new, 1).replace(old_error, new_error, 1)
path.write_bytes(data)

text = data.decode('utf-8')
assert 'ScreenPairing::showError("Could not load frame")' not in text
assert 'frame-config still unavailable; preserving existing e-paper content' in text
assert 'const uint32_t retryDelaysMs[] = {2000UL, 5000UL};' in text
print('patched frame-config transient resilience')
