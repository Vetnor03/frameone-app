#include <Arduino.h>
#include <WiFi.h>
#include <esp_system.h>

#define ALFRED_STAGE7_POWER_PATH_TEST_ARMED 0

#if ALFRED_STAGE7_POWER_PATH_TEST_ARMED
#include "AlfredStage7Secrets.h"
#endif

namespace {
constexpr uint8_t kEpdPowerPin = 12;
constexpr uint8_t kPgoodPin = 17;
constexpr uint8_t kChargePin = 18;
constexpr uint32_t kSampleMs = 1000;
constexpr uint32_t kReportMs = 5000;
constexpr uint32_t kReconnectMs = 5000;
constexpr uint32_t kReconnectAttemptTimeoutMs = 15000;
constexpr uint32_t kRtcMagic = 0xA1F7B074;
constexpr size_t kHistorySize = 48;

enum class Signal : uint8_t { PGOOD_N, CHG_N };
struct Transition {
  uint32_t boot;
  uint32_t uptimeMs;
  Signal signal;
  bool previousHigh;
  bool newHigh;
};
struct RtcRecord {
  uint32_t magic;
  uint32_t bootCount;
  uint32_t count;
  uint32_t next;
  uint32_t pgoodTransitions;
  uint32_t chargeTransitions;
  bool running;
  bool unexpectedReset;
  bool sawBattery;
  bool sawUsbAfterBattery;
  bool sawReturnToBattery;
  bool gpio12Fault;
  uint32_t sourceGeneration;
  uint32_t wifiRecoveredGeneration;
  Transition history[kHistorySize];
};
RTC_NOINIT_ATTR RtcRecord rtc;

portMUX_TYPE wifiMux = portMUX_INITIALIZER_UNLOCKED;
struct WifiEvents {
  uint32_t disconnects;
  uint32_t eventSequence;
  uint32_t disconnectedSequence;
  uint32_t gotIpSequence;
  uint32_t stateVersion;
  uint32_t reconnectAttemptToken;
  bool reconnectNeeded;
  bool associationInProgress;
  bool disconnected;
  bool gotIp;
} wifiEvents = {};

uint32_t lastSample;
uint32_t lastReport;
uint32_t lastReconnect;
uint32_t reconnectAttemptStartedMs;
uint32_t reconnectRequests;
uint32_t minimumFreeHeap = UINT32_MAX;
bool pgoodHigh;
bool chargeHigh;
bool serialWasAvailable;
bool currentConnectionHasValidIp;
bool retainedRecordFoundAtBoot;
uint32_t retainedHistoryEntriesAtBoot;
esp_reset_reason_t bootReason;

const char *level(bool high) { return high ? "HIGH" : "LOW"; }
const char *resetName(esp_reset_reason_t reason) {
  switch (reason) {
    case ESP_RST_POWERON: return "POWERON";
    case ESP_RST_EXT: return "EXTERNAL";
    case ESP_RST_SW: return "SOFTWARE";
    case ESP_RST_PANIC: return "PANIC";
    case ESP_RST_INT_WDT: return "INTERRUPT_WATCHDOG";
    case ESP_RST_TASK_WDT: return "TASK_WATCHDOG";
    case ESP_RST_WDT: return "WATCHDOG";
    case ESP_RST_BROWNOUT: return "BROWNOUT";
    case ESP_RST_DEEPSLEEP: return "DEEP_SLEEP";
    default: return "UNKNOWN";
  }
}

void enforceEpdLow() {
  if (digitalRead(kEpdPowerPin) != LOW) {
    rtc.gpio12Fault = true;
    digitalWrite(kEpdPowerPin, LOW);
  }
  digitalWrite(kEpdPowerPin, LOW);
}

void recordTransition(Signal signal, bool oldHigh, bool newHigh) {
  Transition &event = rtc.history[rtc.next];
  event = {rtc.bootCount, millis(), signal, oldHigh, newHigh};
  rtc.next = (rtc.next + 1) % kHistorySize;
  if (rtc.count < kHistorySize) ++rtc.count;
  if (signal == Signal::PGOOD_N) ++rtc.pgoodTransitions;
  else ++rtc.chargeTransitions;
}

void sampleInputs() {
  bool nextPgood = digitalRead(kPgoodPin) == HIGH;
  bool nextCharge = digitalRead(kChargePin) == HIGH;
  if (nextPgood != pgoodHigh) {
    recordTransition(Signal::PGOOD_N, pgoodHigh, nextPgood);
    pgoodHigh = nextPgood;
    ++rtc.sourceGeneration;
    if (!nextPgood && rtc.sawBattery) rtc.sawUsbAfterBattery = true;
    if (nextPgood && rtc.sawUsbAfterBattery) rtc.sawReturnToBattery = true;
  }
  if (nextCharge != chargeHigh) {
    recordTransition(Signal::CHG_N, chargeHigh, nextCharge);
    chargeHigh = nextCharge;
  }
  if (pgoodHigh) rtc.sawBattery = true;
}

void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t) {
  portENTER_CRITICAL(&wifiMux);
  ++wifiEvents.stateVersion;
  if (event == ARDUINO_EVENT_WIFI_STA_START || event == ARDUINO_EVENT_WIFI_STA_CONNECTED) {
    wifiEvents.associationInProgress = true;
  } else if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    ++wifiEvents.disconnects;
    wifiEvents.disconnected = true;
    wifiEvents.disconnectedSequence = ++wifiEvents.eventSequence;
    wifiEvents.associationInProgress = false;
    wifiEvents.reconnectNeeded = true;
  } else if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
    wifiEvents.gotIp = true;
    wifiEvents.gotIpSequence = ++wifiEvents.eventSequence;
    wifiEvents.associationInProgress = false;
    wifiEvents.reconnectNeeded = false;
  }
  portEXIT_CRITICAL(&wifiMux);
}

void consumeWifiEvents() {
  bool disconnected, gotIp;
  uint32_t disconnectedSequence, gotIpSequence;
  portENTER_CRITICAL(&wifiMux);
  disconnected = wifiEvents.disconnected;
  gotIp = wifiEvents.gotIp;
  disconnectedSequence = wifiEvents.disconnectedSequence;
  gotIpSequence = wifiEvents.gotIpSequence;
  wifiEvents.disconnected = false;
  wifiEvents.gotIp = false;
  portEXIT_CRITICAL(&wifiMux);

  // If both accumulated, the later event determines current connection validity.
  if (disconnected && (!gotIp || disconnectedSequence > gotIpSequence)) {
    currentConnectionHasValidIp = false;
  } else if (gotIp) {
    currentConnectionHasValidIp = true;
    rtc.wifiRecoveredGeneration = rtc.sourceGeneration;
  }
}

uint32_t disconnectCount() {
  uint32_t result;
  portENTER_CRITICAL(&wifiMux);
  result = wifiEvents.disconnects;
  portEXIT_CRITICAL(&wifiMux);
  return result;
}

void printHistory() {
  Serial.printf("STAGE7 TRANSITION HISTORY (%lu retained)\n", (unsigned long)rtc.count);
  size_t oldest = (rtc.next + kHistorySize - rtc.count) % kHistorySize;
  for (size_t i = 0; i < rtc.count; ++i) {
    const Transition &event = rtc.history[(oldest + i) % kHistorySize];
    Serial.printf("boot=%lu uptime=%lu ms %s %s -> %s\n", (unsigned long)event.boot,
                  (unsigned long)event.uptimeMs,
                  event.signal == Signal::PGOOD_N ? "PGOOD_N" : "CHG_N",
                  level(event.previousHigh), level(event.newHigh));
  }
}

void printReport() {
  if (!Serial) return;
  Serial.println("STAGE7");
  Serial.printf("boot/reset reason = %s; boot count = %lu\n", resetName(bootReason), (unsigned long)rtc.bootCount);
  Serial.printf("uptime = %lu ms\nPGOOD_N %s\npower_source = %s\n", (unsigned long)millis(),
                level(pgoodHigh), pgoodHigh ? "BATTERY_ONLY" : "USB_PRESENT");
  Serial.printf("CHG_N %s\ncharger_state = %s\n", level(chargeHigh),
                chargeHigh ? "NOT_ACTIVE" : "CHARGING_SIGNAL_ACTIVE");
#if ALFRED_STAGE7_POWER_PATH_TEST_ARMED
  Serial.printf("Wi-Fi status = %s\nRSSI = %ld dBm\n", WiFi.status() == WL_CONNECTED ? "CONNECTED" : "DISCONNECTED",
                WiFi.status() == WL_CONNECTED ? (long)WiFi.RSSI() : 0L);
#else
  Serial.println("Wi-Fi status = OFF (UNARMED)\nRSSI = N/A");
#endif
  Serial.printf("disconnect count = %lu\nreconnect requests = %lu\nminimum free heap = %lu\n",
                (unsigned long)disconnectCount(), (unsigned long)reconnectRequests, (unsigned long)minimumFreeHeap);
  Serial.printf("EPD_PWR %s\nPGOOD transition count = %lu\nCHG transition count = %lu\n",
                level(digitalRead(kEpdPowerPin) == HIGH), (unsigned long)rtc.pgoodTransitions,
                (unsigned long)rtc.chargeTransitions);
  Serial.printf("Battery-only PGOOD state correct: %s\n", rtc.sawBattery ? "PASS" : "FAIL");
  Serial.printf("USB-present PGOOD state correct: %s\n", rtc.sawUsbAfterBattery ? "PASS" : "FAIL");
  Serial.printf("Return-to-battery PGOOD state correct: %s\n", rtc.sawReturnToBattery ? "PASS" : "FAIL");
  Serial.printf("Unexpected reset detected: %s\nGPIO12 fault: %s\n", rtc.unexpectedReset ? "YES" : "NO",
                rtc.gpio12Fault ? "YES" : "NO");
  Serial.printf("Wi-Fi recovered after source transitions/reset: %s\n",
                currentConnectionHasValidIp && WiFi.status() == WL_CONNECTED &&
                        rtc.wifiRecoveredGeneration == rtc.sourceGeneration ? "YES" : "NO");
  Serial.printf("Retained RTC record found at this boot: %s\n", retainedRecordFoundAtBoot ? "YES" : "NO");
  Serial.printf("Transition history entries retained at boot: %lu\n",
                (unsigned long)retainedHistoryEntriesAtBoot);
  Serial.printf("Transition history entries currently available: %lu\n", (unsigned long)rtc.count);
  if (rtc.unexpectedReset) Serial.println("UNEXPECTED RESET DETECTED");
}
}  // namespace

void setup() {
  pinMode(12, OUTPUT);
  digitalWrite(12, LOW);
  pinMode(17, INPUT);
  pinMode(18, INPUT);

  bootReason = esp_reset_reason();
  bool retainedMagicFound = rtc.magic == kRtcMagic;
  retainedRecordFoundAtBoot = retainedMagicFound && rtc.count <= kHistorySize && rtc.next < kHistorySize;
  if (!retainedRecordFoundAtBoot) {
    memset(&rtc, 0, sizeof(rtc));
    rtc.magic = kRtcMagic;
  } else {
    retainedHistoryEntriesAtBoot = min(rtc.count, (uint32_t)kHistorySize);
    if (rtc.running) {
      rtc.unexpectedReset = true;
      // Require a fresh, observed connection before claiming recovery after reset.
      ++rtc.sourceGeneration;
    }
  }
  ++rtc.bootCount;
  rtc.running = true;
  pgoodHigh = digitalRead(kPgoodPin) == HIGH;
  chargeHigh = digitalRead(kChargePin) == HIGH;
  if (pgoodHigh) rtc.sawBattery = true;
  minimumFreeHeap = ESP.getFreeHeap();
  Serial.begin(115200);

#if ALFRED_STAGE7_POWER_PATH_TEST_ARMED
  WiFi.persistent(false);
  WiFi.onEvent(onWiFiEvent);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  reconnectAttemptStartedMs = millis();
  WiFi.begin(ALFRED_WIFI_SSID, ALFRED_WIFI_PASSWORD);
#else
  WiFi.persistent(false);
  WiFi.mode(WIFI_OFF);
#endif
}

void loop() {
  enforceEpdLow();
  uint32_t now = millis();
  minimumFreeHeap = min(minimumFreeHeap, ESP.getFreeHeap());
  if (now - lastSample >= kSampleMs) {
    lastSample = now;
    sampleInputs();
  }
#if ALFRED_STAGE7_POWER_PATH_TEST_ARMED
  consumeWifiEvents();
  if (currentConnectionHasValidIp && WiFi.status() == WL_CONNECTED) {
    rtc.wifiRecoveredGeneration = rtc.sourceGeneration;
  }
  bool issueReconnect = false;
  uint32_t claimedAttemptToken = 0;
  uint32_t claimedStateVersion = 0;
  portENTER_CRITICAL(&wifiMux);
  // Re-check live state while protected; a newer GOT_IP can never be timed out.
  if (wifiEvents.associationInProgress &&
      now - reconnectAttemptStartedMs >= kReconnectAttemptTimeoutMs) {
    wifiEvents.associationInProgress = false;
    wifiEvents.reconnectNeeded = true;
  }
  // Atomically claim eligibility before making the driver call outside the lock.
  if (wifiEvents.reconnectNeeded && !wifiEvents.associationInProgress &&
      now - lastReconnect >= kReconnectMs) {
    wifiEvents.associationInProgress = true;
    wifiEvents.reconnectNeeded = false;
    claimedAttemptToken = ++wifiEvents.reconnectAttemptToken;
    claimedStateVersion = wifiEvents.stateVersion;
    lastReconnect = now;
    reconnectAttemptStartedMs = now;
    ++reconnectRequests;
    issueReconnect = true;
  }
  portEXIT_CRITICAL(&wifiMux);

  if (issueReconnect) {
    bool accepted = WiFi.reconnect();  // Never call driver APIs while holding wifiMux.
    if (!accepted) {
      portENTER_CRITICAL(&wifiMux);
      // Restore only our unchanged claim; any newer callback state wins.
      if (wifiEvents.reconnectAttemptToken == claimedAttemptToken &&
          wifiEvents.stateVersion == claimedStateVersion && wifiEvents.associationInProgress) {
        wifiEvents.associationInProgress = false;
        wifiEvents.reconnectNeeded = true;
      }
      portEXIT_CRITICAL(&wifiMux);
    }
  }
#endif
  bool serialAvailable = (bool)Serial;
  if (serialAvailable && !serialWasAvailable) printHistory();
  serialWasAvailable = serialAvailable;
  if (now - lastReport >= kReportMs) {
    lastReport = now;
    printReport();
  }
  delay(10);
}
