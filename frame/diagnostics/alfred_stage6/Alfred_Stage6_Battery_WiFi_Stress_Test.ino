#include <Arduino.h>
#include <WiFi.h>
#include <esp_err.h>
#include <esp_mac.h>
#include <esp_system.h>

#include "AlfredStage6Secrets.h"

#define ALFRED_STAGE6_STRESS_TEST_ARMED 0

namespace {
constexpr uint8_t kEpdPowerPin = 12;
constexpr uint8_t kBqPgoodPin = 17;
constexpr uint32_t kConnectTimeoutMs = 30000;
constexpr uint32_t kStressDurationMs = 60000;
constexpr uint32_t kDnsIntervalMs = 2000;
constexpr uint32_t kScanIntervalMs = 10000;
constexpr uint32_t kReconnectIntervalMs = 5000;
constexpr uint32_t kReconnectAttemptTimeoutMs = 15000;
constexpr uint32_t kReportIntervalMs = 5000;
constexpr uint32_t kRtcMagic = 0xA1F6A1F6;
constexpr uint8_t kReasonCapacity = 16;

enum class Phase : uint8_t { CONNECT = 0, STRESS = 1, FREEZE = 2, REPORT = 3 };
enum class RtcState : uint8_t { IDLE = 0, ACTIVE = 1, FROZEN = 2 };

struct TestResult {
  uint32_t startMs = 0, endMs = 0, durationMs = 0;
  uint32_t disconnects = 0, reconnectRequests = 0;
  uint32_t dnsSuccesses = 0, dnsFailures = 0;
  uint32_t scansCompleted = 0, scansFailed = 0;
  uint32_t minimumFreeHeap = UINT32_MAX, finalFreeHeap = 0;
  int32_t worstRssi = 0, bestRssi = -127;
  uint8_t reasons[kReasonCapacity] = {};
  uint8_t reasonCount = 0;
  esp_reset_reason_t batteryResetReason = ESP_RST_UNKNOWN;
  bool initialConnected = false, connectedAtEnd = false;
  bool gpio12Fault = false, deviceIdPass = false;
  bool unexpectedReset = false, durationComplete = false;
  bool epdPowerInitialHigh = false, epdPowerFinalHigh = false, pass = false;
  bool pgoodInitialHigh = false, pgoodFinalHigh = false;
  bool usbPowerSeenDuringStress = false, batteryOnlyVerified = false;
};

struct RtcRecord {
  uint32_t magic;
  RtcState state;
  TestResult frozen;
};
RTC_DATA_ATTR RtcRecord rtcRecord = {};

portMUX_TYPE eventMux = portMUX_INITIALIZER_UNLOCKED;
struct EventState {
  uint8_t reasons[kReasonCapacity] = {};
  uint8_t count = 0;
  uint32_t overflow = 0;
  bool associating = false;
  bool gotIp = false;
} eventState;

TestResult liveResult;
TestResult frozenResult;
Phase phase = Phase::CONNECT;
String deviceId;
String chipModel;
String stationMac = "UNAVAILABLE";
uint32_t flashSize = 0, psramSize = 0;
uint32_t connectStartedMs = 0, nextDnsMs = 0, nextScanMs = 0;
uint32_t lastReconnectMs = 0, lastReportMs = 0, lastSafeIdleMs = 0;
uint32_t associationStartedMs = 0;
bool reconnectNeeded = false, scanRunning = false, frozen = false;

// Exact algorithm used by frame/src/device/DeviceIdentity.cpp and Stage 3.
String makeDeviceId() {
  uint64_t mac = ESP.getEfuseMac();
  uint32_t hi = (uint32_t)(mac >> 24);
  uint32_t lo = (uint32_t)(mac & 0xFFFFFF);
  char buf[32];
  snprintf(buf, sizeof(buf), "frm_%06lX%06lX", (unsigned long)(hi & 0xFFFFFF),
           (unsigned long)lo);
  return String(buf);
}

const char *resetReasonName(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON: return "POWERON";
    case ESP_RST_EXT: return "EXTERNAL";
    case ESP_RST_SW: return "SOFTWARE";
    case ESP_RST_PANIC: return "PANIC";
    case ESP_RST_INT_WDT: return "INTERRUPT_WATCHDOG";
    case ESP_RST_TASK_WDT: return "TASK_WATCHDOG";
    case ESP_RST_WDT: return "OTHER_WATCHDOG";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    case ESP_RST_DEEPSLEEP: return "DEEP_SLEEP";
    default: return "UNKNOWN";
  }
}

void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  portENTER_CRITICAL(&eventMux);
  if (event == ARDUINO_EVENT_WIFI_STA_START || event == ARDUINO_EVENT_WIFI_STA_CONNECTED) {
    eventState.associating = true;
  } else if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
    eventState.associating = false;
    eventState.gotIp = true;
  } else if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    eventState.associating = false;
    if (eventState.count < kReasonCapacity) {
      eventState.reasons[eventState.count++] = info.wifi_sta_disconnected.reason;
    } else {
      ++eventState.overflow;
    }
  }
  portEXIT_CRITICAL(&eventMux);
}

void enforceEpdPowerSafety() {
  if (digitalRead(kEpdPowerPin) == HIGH) {
    digitalWrite(kEpdPowerPin, LOW);
    if (!frozen) liveResult.gpio12Fault = true;
    if (Serial) Serial.println("*** FAILURE: GPIO12 EPD_PWR WAS HIGH; FORCED LOW ***");
  }
  digitalWrite(kEpdPowerPin, LOW);
}

void consumeEvents() {
  uint8_t reasons[kReasonCapacity], count;
  uint32_t overflow;
  portENTER_CRITICAL(&eventMux);
  count = eventState.count;
  memcpy(reasons, eventState.reasons, count);
  eventState.count = 0;
  overflow = eventState.overflow;
  eventState.overflow = 0;
  portEXIT_CRITICAL(&eventMux);
  if (frozen) return;
  for (uint8_t i = 0; i < count; ++i) {
    ++liveResult.disconnects;
    reconnectNeeded = true;
    bool seen = false;
    for (uint8_t j = 0; j < liveResult.reasonCount; ++j) seen |= liveResult.reasons[j] == reasons[i];
    if (!seen && liveResult.reasonCount < kReasonCapacity) liveResult.reasons[liveResult.reasonCount++] = reasons[i];
  }
  liveResult.disconnects += overflow;
  reconnectNeeded |= overflow != 0;
}

bool isAssociating() {
  bool value;
  portENTER_CRITICAL(&eventMux);
  value = eventState.associating;
  portEXIT_CRITICAL(&eventMux);
  return value;
}

void setAssociating(bool value) {
  portENTER_CRITICAL(&eventMux);
  eventState.associating = value;
  portEXIT_CRITICAL(&eventMux);
}

bool takeGotIp() {
  bool value;
  portENTER_CRITICAL(&eventMux);
  value = eventState.gotIp;
  eventState.gotIp = false;
  portEXIT_CRITICAL(&eventMux);
  return value;
}

void printReport() {
  if (!Serial) return;
  const TestResult &r = frozenResult;
  Serial.println("================================");
  Serial.println("RE:MIND Alfred Stage 6\nBATTERY-ONLY WI-FI STRESS RESULT\n================================");
  Serial.printf("Result: %s\n\nDevice ID: %s\nDevice-ID check: %s\n\n", r.pass ? "PASS" : "FAIL",
                deviceId.c_str(), r.deviceIdPass ? "PASS" : "FAIL");
  Serial.println("Target stress duration: 60.000 s");
  Serial.printf("Actual stress duration: %lu.%03lu s (%lu ms)\n",
                (unsigned long)(r.durationMs / 1000), (unsigned long)(r.durationMs % 1000),
                (unsigned long)r.durationMs);
  Serial.printf("Wi-Fi initially connected: %s\nWi-Fi connected at completion: %s\n\n",
                r.initialConnected ? "YES" : "NO", r.connectedAtEnd ? "YES" : "NO");
  Serial.printf("Disconnects: %lu\nReconnect requests: %lu\n\nDNS successes: %lu\nDNS failures: %lu\n\n",
                (unsigned long)r.disconnects, (unsigned long)r.reconnectRequests,
                (unsigned long)r.dnsSuccesses, (unsigned long)r.dnsFailures);
  Serial.printf("Wi-Fi scans completed: %lu\nWi-Fi scans failed: %lu\n\nWorst RSSI: %ld dBm\nBest RSSI: %ld dBm\n\n",
                (unsigned long)r.scansCompleted, (unsigned long)r.scansFailed,
                (long)r.worstRssi, (long)r.bestRssi);
  Serial.printf("Minimum free heap: %lu\nFinal free heap: %lu\n\n", (unsigned long)r.minimumFreeHeap,
                (unsigned long)r.finalFreeHeap);
  Serial.printf("GPIO12 fault detected: %s\nEPD_PWR final state: %s\n\nBattery boot reset reason: %s\n\n",
                r.gpio12Fault ? "YES" : "NO", r.epdPowerFinalHigh ? "HIGH" : "LOW",
                resetReasonName(r.batteryResetReason));
  Serial.printf("BQ_PGOOD_N at stress start: %s\nBQ_PGOOD_N at stress completion: %s\n",
                r.pgoodInitialHigh ? "HIGH" : "LOW", r.pgoodFinalHigh ? "HIGH" : "LOW");
  Serial.printf("USB power seen during stress: %s\nBATTERY-ONLY VERIFIED: %s\n\n",
                r.usbPowerSeenDuringStress ? "YES" : "NO", r.batteryOnlyVerified ? "YES" : "NO");
  Serial.print("Recorded disconnect reasons:\n");
  if (!r.reasonCount) Serial.println("NONE");
  for (uint8_t i = 0; i < r.reasonCount; ++i) Serial.printf("%u%s", r.reasons[i], i + 1 == r.reasonCount ? "\n" : ", ");
  Serial.println("\nDetected failures:");
  if (r.pass) Serial.println("NONE");
  else {
    if (!r.deviceIdPass) Serial.println("- Device ID mismatch");
    if (!r.initialConnected) Serial.println("- Initial Wi-Fi connection failed");
    if (r.unexpectedReset) Serial.println("- Unexpected reset during active stress test");
    if (r.gpio12Fault) Serial.println("- GPIO12 safety fault");
    if (!r.connectedAtEnd) Serial.println("- Wi-Fi disconnected at completion");
    if (!r.dnsSuccesses) Serial.println("- No successful DNS resolution");
    if (!r.scansCompleted) Serial.println("- No completed Wi-Fi scan");
    if (!r.durationComplete) Serial.println("- 60-second duration did not complete normally");
    if (!r.batteryOnlyVerified) Serial.println("- Battery-only power was not verified for the complete stress phase");
  }
  if (r.batteryOnlyVerified) {
    Serial.println("\nBQ_PGOOD_N remained HIGH for the complete stress phase.\nNo valid USB input was detected while battery-only results were collected.");
  }
  Serial.println("\nResults were frozen before report mode.\nChanges in USB/PGOOD state after freeze do not modify the frozen result.\n\n================================");
}

void freezeResult(bool durationComplete) {
  if (frozen) return;
  phase = Phase::FREEZE;
  if (scanRunning) { WiFi.scanDelete(); scanRunning = false; }
  liveResult.endMs = millis();
  liveResult.durationMs = liveResult.endMs - liveResult.startMs;
  liveResult.durationComplete = durationComplete && liveResult.durationMs >= kStressDurationMs;
  liveResult.connectedAtEnd = WiFi.status() == WL_CONNECTED;
  liveResult.finalFreeHeap = ESP.getFreeHeap();
  liveResult.minimumFreeHeap = min(liveResult.minimumFreeHeap, liveResult.finalFreeHeap);
  liveResult.epdPowerFinalHigh = digitalRead(kEpdPowerPin) == HIGH;
  liveResult.pgoodFinalHigh = digitalRead(kBqPgoodPin) == HIGH;
  liveResult.batteryOnlyVerified = liveResult.pgoodInitialHigh &&
      !liveResult.usbPowerSeenDuringStress && liveResult.pgoodFinalHigh;
  liveResult.pass = liveResult.deviceIdPass && liveResult.initialConnected &&
      !liveResult.unexpectedReset && !liveResult.gpio12Fault && liveResult.connectedAtEnd &&
      liveResult.dnsSuccesses > 0 && liveResult.scansCompleted > 0 &&
      liveResult.durationComplete && liveResult.batteryOnlyVerified;
  frozenResult = liveResult;
  frozen = true;
  rtcRecord.magic = kRtcMagic;
  rtcRecord.frozen = frozenResult;
  rtcRecord.state = RtcState::FROZEN;
  phase = Phase::REPORT;
  if (Serial) Serial.println("BATTERY-ONLY STRESS COMPLETE\nRESULTS FROZEN - USB MAY NOW BE CONNECTED");
}

void startStress() {
  liveResult.initialConnected = true;
  liveResult.startMs = millis();
  liveResult.pgoodInitialHigh = digitalRead(kBqPgoodPin) == HIGH;
  liveResult.usbPowerSeenDuringStress = !liveResult.pgoodInitialHigh;
  liveResult.minimumFreeHeap = ESP.getFreeHeap();
  liveResult.worstRssi = WiFi.RSSI();
  liveResult.bestRssi = liveResult.worstRssi;
  nextDnsMs = liveResult.startMs + kDnsIntervalMs;
  nextScanMs = liveResult.startMs + kScanIntervalMs;
  rtcRecord.magic = kRtcMagic;
  rtcRecord.state = RtcState::ACTIVE;
  phase = Phase::STRESS;
}
}  // namespace

void setup() {
  pinMode(12, OUTPUT);
  digitalWrite(12, LOW);
  pinMode(kBqPgoodPin, INPUT);

  Serial.begin(115200);
  chipModel = ESP.getChipModel();
  flashSize = ESP.getFlashChipSize();
  psramSize = ESP.getPsramSize();
  liveResult.batteryResetReason = esp_reset_reason();
  liveResult.epdPowerInitialHigh = digitalRead(kEpdPowerPin) == HIGH;
  deviceId = makeDeviceId();
  uint8_t mac[6] = {};
  const esp_err_t macResult = esp_read_mac(mac, ESP_MAC_WIFI_STA);
  if (macResult == ESP_OK) {
    char text[18];
    snprintf(text, sizeof(text), "%02X:%02X:%02X:%02X:%02X:%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    stationMac = text;
  }
  liveResult.deviceIdPass = macResult == ESP_OK && deviceId == "frm_88AC499FC114";

#if ALFRED_STAGE6_STRESS_TEST_ARMED == 0
  return;
#else
  if (rtcRecord.magic == kRtcMagic && rtcRecord.state == RtcState::ACTIVE) {
    liveResult.unexpectedReset = true;
    liveResult.initialConnected = true;
    freezeResult(false);
    return;
  }
  if (rtcRecord.magic == kRtcMagic && rtcRecord.state == RtcState::FROZEN) {
    frozenResult = rtcRecord.frozen;
    frozen = true;
    phase = Phase::REPORT;
    return;
  }
  rtcRecord.magic = kRtcMagic;
  rtcRecord.state = RtcState::IDLE;
  WiFi.onEvent(onWiFiEvent);
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(ALFRED_WIFI_SSID, ALFRED_WIFI_PASSWORD);
  connectStartedMs = millis();
#endif
}

void loop() {
  enforceEpdPowerSafety();
#if ALFRED_STAGE6_STRESS_TEST_ARMED == 0
  if (Serial && millis() - lastSafeIdleMs >= kReportIntervalMs) {
    lastSafeIdleMs = millis();
    Serial.println("Stage 6 SAFE IDLE: stress test is UNARMED; Wi-Fi is OFF; GPIO12 is LOW");
  }
  delay(10);
  return;
#else
  consumeEvents();
  const uint32_t now = millis();
  if (phase == Phase::CONNECT) {
    if (takeGotIp() && WiFi.status() == WL_CONNECTED) startStress();
    else if (now - connectStartedMs >= kConnectTimeoutMs) freezeResult(false);
  } else if (phase == Phase::STRESS) {
    if (digitalRead(kBqPgoodPin) == LOW) liveResult.usbPowerSeenDuringStress = true;
    if (now - liveResult.startMs >= kStressDurationMs) {
      freezeResult(true);
    } else {
      if (isAssociating() && associationStartedMs != 0 &&
          now - associationStartedMs >= kReconnectAttemptTimeoutMs) {
        setAssociating(false);
        associationStartedMs = 0;
      }
      const uint32_t heap = ESP.getFreeHeap();
      liveResult.minimumFreeHeap = min(liveResult.minimumFreeHeap, heap);
      if (WiFi.status() == WL_CONNECTED) {
        reconnectNeeded = false;
        const int32_t rssi = WiFi.RSSI();
        liveResult.worstRssi = min(liveResult.worstRssi, rssi);
        liveResult.bestRssi = max(liveResult.bestRssi, rssi);
      }
      if ((int32_t)(now - nextDnsMs) >= 0) {
        nextDnsMs += kDnsIntervalMs;
        IPAddress resolved;
        if (WiFi.hostByName("re-mind.no", resolved) == 1) ++liveResult.dnsSuccesses;
        else ++liveResult.dnsFailures;
      }
      if (scanRunning && WiFi.status() != WL_CONNECTED) {
        WiFi.scanDelete();
        scanRunning = false;
        ++liveResult.scansFailed;
      }
      if (!scanRunning && WiFi.status() == WL_CONNECTED && !isAssociating() &&
          (int32_t)(now - nextScanMs) >= 0) {
        nextScanMs += kScanIntervalMs;
        scanRunning = WiFi.scanNetworks(true, false) == WIFI_SCAN_RUNNING;
        if (!scanRunning) ++liveResult.scansFailed;
      }
      if (scanRunning) {
        const int16_t scanStatus = WiFi.scanComplete();
        if (scanStatus >= 0) { ++liveResult.scansCompleted; WiFi.scanDelete(); scanRunning = false; }
        else if (scanStatus == WIFI_SCAN_FAILED) { ++liveResult.scansFailed; WiFi.scanDelete(); scanRunning = false; }
      }
      if (reconnectNeeded && WiFi.status() != WL_CONNECTED && !isAssociating() &&
          (lastReconnectMs == 0 || now - lastReconnectMs >= kReconnectIntervalMs)) {
        lastReconnectMs = now;
        ++liveResult.reconnectRequests;
        if (WiFi.reconnect()) {
          setAssociating(true);
          associationStartedMs = now;
        }
      }
    }
  } else if (phase == Phase::REPORT && Serial && now - lastReportMs >= kReportIntervalMs) {
    lastReportMs = now;
    printReport();
  }
  delay(10);
#endif
}
