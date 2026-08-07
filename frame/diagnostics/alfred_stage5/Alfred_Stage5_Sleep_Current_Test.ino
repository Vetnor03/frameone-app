#include <Arduino.h>
#include <driver/adc.h>
#include <driver/gpio.h>
#include <esp_bt.h>
#include <esp_err.h>
#include <esp_sleep.h>
#include <esp_system.h>
#include <esp_wifi.h>

#define ALFRED_STAGE5_CURRENT_TEST_ARMED 0

namespace {
constexpr gpio_num_t kEpdPowerPin = GPIO_NUM_12;
constexpr unsigned long kSafeIdleIntervalMs = 5000;
constexpr int kEpaperSignalPins[] = {4, 5, 6, 7, 10, 11};

unsigned long lastSafeIdleReportMs = 0;
bool safeIdle = false;

void forceEpdPowerLow() {
  digitalWrite(12, LOW);
  pinMode(12, OUTPUT);
  digitalWrite(12, LOW);
}

const char *wakeCauseName(esp_sleep_wakeup_cause_t cause) {
  switch (cause) {
    case ESP_SLEEP_WAKEUP_UNDEFINED: return "not deep sleep";
    case ESP_SLEEP_WAKEUP_EXT0: return "external RTC_IO";
    case ESP_SLEEP_WAKEUP_EXT1: return "external RTC controller";
    case ESP_SLEEP_WAKEUP_TIMER: return "timer";
    case ESP_SLEEP_WAKEUP_TOUCHPAD: return "touchpad";
    case ESP_SLEEP_WAKEUP_ULP: return "ULP";
    case ESP_SLEEP_WAKEUP_GPIO: return "GPIO";
    case ESP_SLEEP_WAKEUP_UART: return "UART";
    default: return "other";
  }
}

void reportEspResult(const char *operation, esp_err_t result) {
  Serial.printf("%s: %s (%d)\n", operation, esp_err_to_name(result),
                static_cast<int>(result));
}

bool releaseRetainedHoldSafely() {
  // Establish the safe latch and direction before disturbing a retained hold.
  forceEpdPowerLow();
  gpio_deep_sleep_hold_dis();  // This API has no return value in ESP-IDF.
  const esp_err_t pinHoldResult = gpio_hold_dis(kEpdPowerPin);
  forceEpdPowerLow();
  reportEspResult("GPIO12 retained hold release", pinHoldResult);
  if (pinHoldResult != ESP_OK) {
    return false;
  }
  return gpio_get_level(kEpdPowerPin) == 0;
}

void waitWithEpdPowerLow(unsigned long durationMs) {
  const unsigned long startMs = millis();
  while (millis() - startMs < durationMs) {
    forceEpdPowerLow();
    delay(10);
  }
  forceEpdPowerLow();
}

bool disableRadiosAndSleepPeripherals() {
  bool ok = true;

  const esp_err_t wifiStopResult = esp_wifi_stop();
  reportEspResult("Wi-Fi stop", wifiStopResult);
  if (wifiStopResult != ESP_OK && wifiStopResult != ESP_ERR_WIFI_NOT_INIT) ok = false;

  const esp_err_t wifiDeinitResult = esp_wifi_deinit();
  reportEspResult("Wi-Fi deinit", wifiDeinitResult);
  if (wifiDeinitResult != ESP_OK && wifiDeinitResult != ESP_ERR_WIFI_NOT_INIT) ok = false;

  const esp_bt_controller_status_t btStatus = esp_bt_controller_get_status();
  Serial.printf("Bluetooth controller status before shutdown: %d\n",
                static_cast<int>(btStatus));
  if (btStatus == ESP_BT_CONTROLLER_STATUS_ENABLED) {
    const esp_err_t btDisableResult = esp_bt_controller_disable();
    reportEspResult("Bluetooth controller disable", btDisableResult);
    if (btDisableResult != ESP_OK) ok = false;
  }
  if (esp_bt_controller_get_status() == ESP_BT_CONTROLLER_STATUS_INITED) {
    const esp_err_t btDeinitResult = esp_bt_controller_deinit();
    reportEspResult("Bluetooth controller deinit", btDeinitResult);
    if (btDeinitResult != ESP_OK) ok = false;
  }

  adc_power_off();  // Arduino-ESP32/ESP-IDF exposes no result for this call.
  Serial.println("ADC power: OFF requested (API has no return value)");

  const esp_err_t rtcPeriphResult =
      esp_sleep_pd_config(ESP_PD_DOMAIN_RTC_PERIPH, ESP_PD_OPTION_OFF);
  reportEspResult("RTC peripheral power domain OFF", rtcPeriphResult);
  if (rtcPeriphResult != ESP_OK) ok = false;

  // ESP32-S3 deep sleep powers down the digital domain. There is no separate,
  // safe public Arduino-ESP32 API for a USB Serial/JTAG retention domain.
  Serial.println("USB Serial/JTAG: digital domain will power down in deep sleep");
  return ok;
}

void enterIndefiniteDeepSleep() {
  forceEpdPowerLow();
  for (int pin : kEpaperSignalPins) {
    pinMode(pin, INPUT);
  }
  Serial.println("Disconnected e-paper signal pins configured INPUT");

  if (gpio_get_level(kEpdPowerPin) != 0) {
    forceEpdPowerLow();
    Serial.println("FAIL: EPD_PWR is not LOW; deep sleep cancelled");
    safeIdle = true;
    return;
  }
  Serial.println("EPD_PWR confirmed LOW before deep sleep");

  const esp_err_t wakeDisableResult =
      esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_ALL);
  if (wakeDisableResult == ESP_OK) {
    Serial.println("Disable all wake sources: PASS, wake sources disabled");
  } else if (wakeDisableResult == ESP_ERR_INVALID_STATE) {
    Serial.println("Disable all wake sources: PASS, no wake sources were active");
  } else {
    reportEspResult("Disable all wake sources: FAIL", wakeDisableResult);
    Serial.println("FAIL: could not disable every wake source; deep sleep cancelled");
    safeIdle = true;
    return;
  }

  if (!disableRadiosAndSleepPeripherals()) {
    forceEpdPowerLow();
    Serial.println("FAIL: peripheral shutdown failed; deep sleep cancelled");
    safeIdle = true;
    return;
  }

  forceEpdPowerLow();
  if (gpio_get_level(kEpdPowerPin) != 0) {
    Serial.println("FAIL: EPD_PWR changed state; deep sleep cancelled");
    safeIdle = true;
    return;
  }

  const esp_err_t holdResult = gpio_hold_en(kEpdPowerPin);
  reportEspResult("GPIO12 LOW hold enable", holdResult);
  if (holdResult != ESP_OK) {
    forceEpdPowerLow();
    Serial.println("FAIL: GPIO12 hold could not be enabled; deep sleep cancelled");
    safeIdle = true;
    return;
  }
  gpio_deep_sleep_hold_en();  // This API has no return value in ESP-IDF.

  Serial.println("ENTERING INDEFINITE DEEP SLEEP FOR CURRENT MEASUREMENT");
  Serial.flush();
  esp_deep_sleep_start();

  // A successful deep-sleep start never returns.
  forceEpdPowerLow();
  Serial.println("FAIL: deep sleep returned unexpectedly; remaining in safe idle");
  safeIdle = true;
}

void printSafeIdleStatus() {
  forceEpdPowerLow();
  Serial.printf("SAFE IDLE: Stage 5 unarmed; deep sleep disabled | EPD_PWR: %s | uptime: %lu ms\n",
                gpio_get_level(kEpdPowerPin) == 0 ? "LOW" : "ERROR: HIGH", millis());
}
}  // namespace

void setup() {
  pinMode(12, OUTPUT);
  digitalWrite(12, LOW);

  const esp_sleep_wakeup_cause_t wakeCause = esp_sleep_get_wakeup_cause();
  const bool holdReleasedSafely = releaseRetainedHoldSafely();

  Serial.begin(115200);
  const unsigned long serialStartMs = millis();
  while (!Serial && millis() - serialStartMs < 3000) {
    forceEpdPowerLow();
    delay(10);
  }

  Serial.println();
  Serial.println("RE:MIND Alfred Stage 5");
  Serial.println("Deep-sleep current test");
#if ALFRED_STAGE5_CURRENT_TEST_ARMED
  Serial.println("Armed state: ARMED");
#else
  Serial.println("Armed state: UNARMED");
#endif
  Serial.printf("Chip model: %s\n", ESP.getChipModel());
  Serial.printf("Flash size: %u bytes\n", ESP.getFlashChipSize());
  Serial.printf("PSRAM size: %u bytes\n", ESP.getPsramSize());
  Serial.printf("Reset reason: %d\n", static_cast<int>(esp_reset_reason()));
  Serial.printf("Wake cause: %s (%d)\n", wakeCauseName(wakeCause),
                static_cast<int>(wakeCause));
  Serial.printf("EPD_PWR state: %s\n",
                gpio_get_level(kEpdPowerPin) == 0 ? "LOW" : "ERROR: HIGH");

  if (!holdReleasedSafely) {
    forceEpdPowerLow();
    Serial.println("FAIL: retained GPIO12 hold was not safely released; deep sleep disabled");
    safeIdle = true;
    return;
  }

#if !ALFRED_STAGE5_CURRENT_TEST_ARMED
  Serial.println("SAFE IDLE: current test is unarmed; GPIO12 stays LOW");
  safeIdle = true;
#else
  Serial.println("ARMED: forcing EPD_PWR LOW for ten seconds before shutdown");
  waitWithEpdPowerLow(10000);
  enterIndefiniteDeepSleep();
#endif
}

void loop() {
  forceEpdPowerLow();
  if (safeIdle && millis() - lastSafeIdleReportMs >= kSafeIdleIntervalMs) {
    lastSafeIdleReportMs = millis();
    printSafeIdleStatus();
  }
  delay(10);
}
