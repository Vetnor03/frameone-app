from pathlib import Path

path = Path(__file__).parents[1] / "src" / "frame_v2.5.1.ino"
text = path.read_text()


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected exactly one match, got {count}: {old[:80]!r}")
    text = text.replace(old, new, 1)


replace_once(
    """// Temporary hardware-development policy. Keep this decision here, at the\n// paired operational loop boundary, so production sleep policy can be restored\n// without changing the revision/render/ACK pipeline.\nstatic const bool REALTIME_TEST_MODE = true;\nstatic const uint32_t REALTIME_UPDATE_POLL_MS = 1000;\nstatic const uint32_t REALTIME_FAILURE_BACKOFF_MS = 5000;""",
    """// USB stays fully realtime. On battery, a PM-capable Alfred remains connected\n// with MAX_MODEM/automatic light sleep and uses a 10-second idle cadence. Builds\n// without automatic light sleep fall back to the existing 10-second deep sleep.\nstatic const uint32_t REALTIME_UPDATE_POLL_MS = 1000;\nstatic const uint32_t BATTERY_CONNECTED_IDLE_LOOP_MS = 10000;\nstatic const uint32_t REALTIME_FAILURE_BACKOFF_MS = 5000;""",
)

replace_once(
    """  Serial.println(\"LiveUpdate: entering interactive mode\");\n  WiFi.setSleep(false);\n  esp_wifi_set_ps(WIFI_PS_NONE);\n\n  uint64_t lastRequested""",
    """  Serial.println(\"LiveUpdate: entering interactive mode\");\n  if (!WiFiManagerV2::applyOperationalPowerPolicy(pwr.usbPresent, true) && !pwr.usbPresent) {\n    Serial.println(\"LiveUpdate: connected light sleep unavailable; use 10-second deep-sleep fallback\");\n    return INTERACTIVE_FINISHED;\n  }\n\n  uint64_t lastRequested""",
)

replace_once(
    """      batt = BatteryManager::readAndUpdate(pwr.usbPresent);\n      bool hadPrevious = false;""",
    """      batt = BatteryManager::readAndUpdate(pwr.usbPresent);\n      if (!WiFiManagerV2::applyOperationalPowerPolicy(pwr.usbPresent, true) && !pwr.usbPresent) {\n        Serial.println(\"LiveUpdate: unplugged -> 10-second deep-sleep fallback\");\n        return INTERACTIVE_FINISHED;\n      }\n      bool hadPrevious = false;""",
)

replace_once(
    """      // connectSaved() re-enters STA mode and begins a new connection, so\n      // restore the temporary real-time power policy after every reconnect.\n      WiFi.setSleep(false);\n      esp_wifi_set_ps(WIFI_PS_NONE);\n      Serial.println(\"LiveUpdate: Wi-Fi reconnected\");""",
    """      // connectSaved() re-enters STA mode and begins a new connection, so\n      // restore the source-aware operational power policy after every reconnect.\n      if (!WiFiManagerV2::applyOperationalPowerPolicy(pwr.usbPresent, true) && !pwr.usbPresent) {\n        Serial.println(\"LiveUpdate: reconnect succeeded but connected light sleep is unavailable\");\n        return INTERACTIVE_FINISHED;\n      }\n      Serial.println(\"LiveUpdate: Wi-Fi reconnected\");""",
)

replace_once(
    """    delay(REALTIME_UPDATE_POLL_MS);\n    LiveUpdateState next{};""",
    """    delay(pwr.usbPresent ? REALTIME_UPDATE_POLL_MS : BATTERY_CONNECTED_IDLE_LOOP_MS);\n    LiveUpdateState next{};""",
)

replace_once(
    """      delay(REALTIME_FAILURE_BACKOFF_MS - REALTIME_UPDATE_POLL_MS);\n      continue;""",
    """      delay(REALTIME_FAILURE_BACKOFF_MS);\n      continue;""",
)

replace_once(
    """    while (REALTIME_TEST_MODE && WiFiManagerV2::hasCreds() && DeviceIdentity::hasToken()) {""",
    """    while (pwrEarly.usbPresent && WiFiManagerV2::hasCreds() && DeviceIdentity::hasToken()) {""",
)

replace_once(
    """  if (!REALTIME_TEST_MODE && !normalSyncDue && !explicitRevisionPending) {\n    goToSleep(pwrEarly.usbPresent);\n    return;\n  }""",
    """  const bool connectedIdleReady =\n    WiFiManagerV2::applyOperationalPowerPolicy(pwrEarly.usbPresent, true);\n  if (!pwrEarly.usbPresent && !connectedIdleReady && !normalSyncDue && !explicitRevisionPending) {\n    goToSleep(pwrEarly.usbPresent);\n    return;\n  }""",
)

replace_once(
    """  if (!normalSyncDue) {\n    if (runInteractiveMode(batt, pwr, liveState) == INTERACTIVE_NORMAL_SYNC_DUE) {\n      consumeNormalSyncPeriod();\n      normalSyncDue = true;\n      goto run_normal_sync;\n    }\n    if (!REALTIME_TEST_MODE) goToSleep(pwr.usbPresent);\n    return;\n  }""",
    """  if (!normalSyncDue) {\n    if (runInteractiveMode(batt, pwr, liveState) == INTERACTIVE_NORMAL_SYNC_DUE) {\n      consumeNormalSyncPeriod();\n      normalSyncDue = true;\n      goto run_normal_sync;\n    }\n    goToSleep(pwr.usbPresent);\n    return;\n  }""",
)

replace_once(
    """  normalSyncDue = false;\n  if (REALTIME_TEST_MODE) {\n    if (runInteractiveMode(batt, pwr, liveState) == INTERACTIVE_NORMAL_SYNC_DUE) {\n      consumeNormalSyncPeriod();\n      normalSyncDue = true;\n      goto run_normal_sync;\n    }\n  }\n  if (!REALTIME_TEST_MODE) goToSleep(pwr.usbPresent);""",
    """  normalSyncDue = false;\n  if (runInteractiveMode(batt, pwr, liveState) == INTERACTIVE_NORMAL_SYNC_DUE) {\n    consumeNormalSyncPeriod();\n    normalSyncDue = true;\n    goto run_normal_sync;\n  }\n  goToSleep(pwr.usbPresent);""",
)

path.write_text(text)
print("patched", path)
