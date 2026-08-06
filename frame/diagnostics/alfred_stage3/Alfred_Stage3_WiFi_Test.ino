#include <Arduino.h>
#include <WiFi.h>
#include <esp_err.h>
#include <esp_mac.h>
#include <time.h>

#include "AlfredStage3Secrets.h"

namespace {
constexpr uint8_t kEpdPowerPin = 12;
constexpr unsigned long kConnectionTimeoutMs = 30000;
constexpr unsigned long kReportIntervalMs = 5000;

constexpr uint8_t kDisconnectQueueSize = 8;

portMUX_TYPE eventMux = portMUX_INITIALIZER_UNLOCKED;
struct WiFiEventData {
  uint8_t disconnectReasons[kDisconnectQueueSize] = {};
  uint8_t disconnectHead = 0;
  uint8_t disconnectSize = 0;
  uint32_t droppedDisconnectEvents = 0;
  bool stationConnected = false;
  bool gotIp = false;
} eventData;

uint32_t disconnectCount = 0;
uint32_t reconnectCount = 0;
unsigned long lastReportMs = 0;
unsigned long lastReconnectMs = 0;
bool reconnectRequired = false;

// Exact algorithm used by frame/src/device/DeviceIdentity.cpp. ESP.getEfuseMac()
// exposes the six MAC bytes in the uint64_t order expected by production.
String makeDeviceId() {
  uint64_t mac = ESP.getEfuseMac();

  uint32_t hi = (uint32_t)(mac >> 24);
  uint32_t lo = (uint32_t)(mac & 0xFFFFFF);

  char buf[32];
  snprintf(buf, sizeof(buf), "frm_%06lX%06lX", (unsigned long)(hi & 0xFFFFFF), (unsigned long)lo);
  return String(buf);
}

void printNetworkDetails() {
  Serial.printf("SSID: %s\n", WiFi.SSID().c_str());
  Serial.printf("Local IP: %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("Gateway: %s\n", WiFi.gatewayIP().toString().c_str());
  Serial.printf("Subnet: %s\n", WiFi.subnetMask().toString().c_str());
  Serial.printf("DNS: %s\n", WiFi.dnsIP().toString().c_str());
  Serial.printf("RSSI: %d dBm\n", WiFi.RSSI());
  Serial.printf("Channel: %d\n", WiFi.channel());
  Serial.printf("BSSID: %s\n", WiFi.BSSIDstr().c_str());
}

void testDnsAndTime() {
  IPAddress resolved;
  if (WiFi.hostByName("re-mind.no", resolved) == 1) {
    Serial.printf("DNS re-mind.no: %s\n", resolved.toString().c_str());
  } else {
    Serial.println("DNS re-mind.no: FAILED");
  }

  configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
  struct tm timeInfo;
  if (getLocalTime(&timeInfo, 15000)) {
    char timestamp[32];
    strftime(timestamp, sizeof(timestamp), "%Y-%m-%d %H:%M:%S UTC", &timeInfo);
    Serial.printf("NTP synchronization: succeeded (%s)\n", timestamp);
  } else {
    Serial.println("NTP synchronization: FAILED");
  }
}

void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  portENTER_CRITICAL(&eventMux);
  if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    if (eventData.disconnectSize < kDisconnectQueueSize) {
      const uint8_t tail =
          (eventData.disconnectHead + eventData.disconnectSize) % kDisconnectQueueSize;
      eventData.disconnectReasons[tail] = info.wifi_sta_disconnected.reason;
      ++eventData.disconnectSize;
    } else {
      ++eventData.droppedDisconnectEvents;
    }
  } else if (event == ARDUINO_EVENT_WIFI_STA_CONNECTED) {
    eventData.stationConnected = true;
  } else if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
    eventData.gotIp = true;
  }
  portEXIT_CRITICAL(&eventMux);
}

void processWiFiEvents() {
  uint8_t reasons[kDisconnectQueueSize];
  uint8_t reasonCount = 0;
  uint32_t droppedEvents = 0;
  bool stationConnected = false;
  bool gotIp = false;

  portENTER_CRITICAL(&eventMux);
  reasonCount = eventData.disconnectSize;
  for (uint8_t i = 0; i < reasonCount; ++i) {
    reasons[i] = eventData.disconnectReasons[
        (eventData.disconnectHead + i) % kDisconnectQueueSize];
  }
  eventData.disconnectHead = 0;
  eventData.disconnectSize = 0;
  droppedEvents = eventData.droppedDisconnectEvents;
  eventData.droppedDisconnectEvents = 0;
  stationConnected = eventData.stationConnected;
  eventData.stationConnected = false;
  gotIp = eventData.gotIp;
  eventData.gotIp = false;
  portEXIT_CRITICAL(&eventMux);

  for (uint8_t i = 0; i < reasonCount; ++i) {
    ++disconnectCount;
    reconnectRequired = true;
    Serial.printf("Wi-Fi disconnected; reason: %u\n", reasons[i]);
  }
  if (droppedEvents > 0) {
    disconnectCount += droppedEvents;
    reconnectRequired = true;
    Serial.printf("Wi-Fi disconnect event queue overflow: %u event(s) not retained\n",
                  droppedEvents);
  }
  if (stationConnected) {
    Serial.println("Wi-Fi station associated");
  }
  if (gotIp) {
    Serial.printf("Wi-Fi obtained IP: %s\n", WiFi.localIP().toString().c_str());
  }
}

const char *statusName(wl_status_t status) {
  switch (status) {
    case WL_CONNECTED: return "connected";
    case WL_NO_SSID_AVAIL: return "SSID unavailable";
    case WL_CONNECT_FAILED: return "connection failed";
    case WL_CONNECTION_LOST: return "connection lost";
    case WL_DISCONNECTED: return "disconnected";
    case WL_IDLE_STATUS: return "idle";
    default: return "unknown";
  }
}
}  // namespace

void setup() {
  pinMode(12, OUTPUT);
  digitalWrite(12, LOW);

  Serial.begin(115200);
  const unsigned long serialStart = millis();
  while (!Serial && millis() - serialStart < 3000) {
    delay(10);
  }

  Serial.println();
  Serial.println("RE:MIND Alfred Stage 3");
  Serial.println("Wi-Fi stability test");
  Serial.printf("ESP32 chip model: %s\n", ESP.getChipModel());
  Serial.printf("Flash size: %u bytes\n", ESP.getFlashChipSize());
  Serial.printf("PSRAM size: %u bytes\n", ESP.getPsramSize());

  uint8_t staMac[6] = {};
  const esp_err_t macResult = esp_read_mac(staMac, ESP_MAC_WIFI_STA);
  if (macResult == ESP_OK) {
    Serial.printf("Wi-Fi STA MAC address: %02X:%02X:%02X:%02X:%02X:%02X\n",
                  staMac[0], staMac[1], staMac[2], staMac[3], staMac[4], staMac[5]);
  } else {
    Serial.printf("Wi-Fi STA MAC address: FAILED (%s)\n", esp_err_to_name(macResult));
  }
  const String deviceId = makeDeviceId();
  Serial.printf("RE:MIND device ID: %s\n", deviceId.c_str());
  Serial.printf("Device-ID check: %s\n",
                macResult == ESP_OK && deviceId == "frm_88AC499FC114" ? "PASS" : "FAIL");
  Serial.printf("EPD_PWR state: %s\n", digitalRead(kEpdPowerPin) == LOW ? "LOW" : "ERROR: HIGH");

  WiFi.onEvent(onWiFiEvent);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  Serial.printf("Connecting to SSID: %s", ALFRED_WIFI_SSID);
  WiFi.begin(ALFRED_WIFI_SSID, ALFRED_WIFI_PASSWORD);

  const unsigned long connectionStart = millis();
  while (WiFi.status() != WL_CONNECTED &&
         millis() - connectionStart < kConnectionTimeoutMs) {
    Serial.print('.');
    digitalWrite(kEpdPowerPin, LOW);
    delay(500);
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Wi-Fi connection: succeeded");
    printNetworkDetails();
    testDnsAndTime();
  } else {
    Serial.printf("Wi-Fi connection: FAILED after 30 seconds (status: %s)\n",
                  statusName(WiFi.status()));
    reconnectRequired = true;
  }
}

void loop() {
  digitalWrite(12, LOW);

  const unsigned long now = millis();
  processWiFiEvents();

  if (WiFi.status() == WL_CONNECTED) {
    reconnectRequired = false;
  }

  if (reconnectRequired && WiFi.status() != WL_CONNECTED &&
      (lastReconnectMs == 0 || now - lastReconnectMs >= kReportIntervalMs)) {
    lastReconnectMs = now;
    ++reconnectCount;
    Serial.printf("Reconnect attempt %u\n", reconnectCount);
    if (!WiFi.reconnect()) {
      Serial.println("Reconnect request: FAILED");
    } else {
      Serial.println("Reconnect request: accepted");
    }
  }

  if (now - lastReportMs >= kReportIntervalMs) {
    lastReportMs = now;
    const wl_status_t status = WiFi.status();
    Serial.printf(
        "STABILITY uptime=%lu s wifi=%s RSSI=%d dBm free_heap=%u "
        "min_free_heap=%u EPD_PWR=%s disconnects=%u reconnects=%u\n",
        now / 1000, statusName(status), status == WL_CONNECTED ? WiFi.RSSI() : 0,
        ESP.getFreeHeap(), ESP.getMinFreeHeap(),
        digitalRead(kEpdPowerPin) == LOW ? "LOW" : "ERROR: HIGH",
        disconnectCount, reconnectCount);
  }

  delay(10);
}
