#include <Arduino.h>
#include <driver/gpio.h>
#include <esp_err.h>
#include <esp_sleep.h>
#include <esp_system.h>

#define ALFRED_STAGE4_SLEEP_TEST_ARMED 0

namespace {
constexpr gpio_num_t kEpdPowerPin = GPIO_NUM_12;
constexpr uint64_t kTimerWakeUs = 15ULL * 1000ULL * 1000ULL;
constexpr unsigned long kSafeIdleIntervalMs = 5000;
constexpr uint32_t kRequiredTimerWakes = 3;

RTC_DATA_ATTR uint32_t rtcTimerWakeCounter = 0;

unsigned long lastSafeIdleReportMs = 0;
bool safeIdle = false;
esp_err_t holdReleaseResult = ESP_OK;

const char *wakeCauseName(esp_sleep_wakeup_cause_t cause) {
  switch (cause) {
    case ESP_SLEEP_WAKEUP_TIMER: return "timer";
    case ESP_SLEEP_WAKEUP_UNDEFINED: return "not deep sleep";
    case ESP_SLEEP_WAKEUP_EXT0: return "external RTC_IO";
    case ESP_SLEEP_WAKEUP_EXT1: return "external RTC controller";
    case ESP_SLEEP_WAKEUP_TOUCHPAD: return "touchpad";
    case ESP_SLEEP_WAKEUP_ULP: return "ULP";
    case ESP_SLEEP_WAKEUP_GPIO: return "GPIO";
    case ESP_SLEEP_WAKEUP_UART: return "UART";
    default: return "other";
  }
}

void forceEpdPowerLow() {
  digitalWrite(12, LOW);
  pinMode(12, OUTPUT);
  digitalWrite(12, LOW);
}

bool releaseEpdPowerHoldSafely() {
  // Program the output latch and direction while the retained LOW is still held.
  forceEpdPowerLow();
  gpio_deep_sleep_hold_dis();
  holdReleaseResult = gpio_hold_dis(kEpdPowerPin);
  forceEpdPowerLow();
  if (holdReleaseResult != ESP_OK) {
    return false;
  }
  return digitalRead(12) == LOW;
}

bool epdPowerIsLow() {
  forceEpdPowerLow();
  return digitalRead(12) == LOW;
}

void waitWithEpdPowerLow(unsigned long durationMs) {
  const unsigned long waitStart = millis();
  while (millis() - waitStart < durationMs) {
    forceEpdPowerLow();
    delay(10);
  }
  forceEpdPowerLow();
}

void enterTimerDeepSleep() {
  forceEpdPowerLow();
  if (!epdPowerIsLow()) {
    Serial.println("FAIL: EPD_PWR is not LOW; deep sleep cancelled");
    safeIdle = true;
    return;
  }

  Serial.println("EPD_PWR confirmed LOW before deep sleep");
  const esp_err_t timerWakeResult = esp_sleep_enable_timer_wakeup(kTimerWakeUs);
  if (timerWakeResult != ESP_OK) {
    forceEpdPowerLow();
    Serial.printf("FAIL: timer wake configuration failed: %d (%s); deep sleep cancelled\n",
                  static_cast<int>(timerWakeResult), esp_err_to_name(timerWakeResult));
    safeIdle = true;
    return;
  }

  const esp_err_t holdEnableResult = gpio_hold_en(kEpdPowerPin);
  if (holdEnableResult != ESP_OK) {
    esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_TIMER);
    forceEpdPowerLow();
    Serial.printf("FAIL: GPIO12 hold enable failed: %d (%s); deep sleep cancelled\n",
                  static_cast<int>(holdEnableResult), esp_err_to_name(holdEnableResult));
    safeIdle = true;
    return;
  }

  gpio_deep_sleep_hold_en();
  Serial.flush();
  esp_deep_sleep_start();

  // Deep sleep does not return. This is a fail-safe if the platform rejects it.
  forceEpdPowerLow();
  Serial.println("FAIL: deep sleep returned unexpectedly");
  safeIdle = true;
}

void printSafeIdleStatus() {
  forceEpdPowerLow();
  Serial.printf("Safe idle | uptime: %lu ms | wake counter: %lu | EPD_PWR: %s | "
                "free heap: %u bytes | minimum free heap: %u bytes\n",
                millis(), static_cast<unsigned long>(rtcTimerWakeCounter),
                digitalRead(12) == LOW ? "LOW" : "ERROR: HIGH",
                ESP.getFreeHeap(), ESP.getMinFreeHeap());
}
}  // namespace

void setup() {
  pinMode(12, OUTPUT);
  digitalWrite(12, LOW);

  const esp_sleep_wakeup_cause_t wakeCause = esp_sleep_get_wakeup_cause();
  const bool holdReleasedSafely = releaseEpdPowerHoldSafely();

  Serial.begin(115200);
  const unsigned long serialStart = millis();
  while (!Serial && millis() - serialStart < 3000) {
    forceEpdPowerLow();
    delay(10);
  }

  Serial.println();
  Serial.println("RE:MIND Alfred Stage 4");
  Serial.println("Deep-sleep and timer-wake test");
#if ALFRED_STAGE4_SLEEP_TEST_ARMED
  Serial.println("Armed: YES");
#else
  Serial.println("Armed: NO");
#endif
  Serial.printf("Chip model: %s\n", ESP.getChipModel());
  Serial.printf("Flash size: %u bytes\n", ESP.getFlashChipSize());
  Serial.printf("PSRAM size: %u bytes\n", ESP.getPsramSize());
  Serial.printf("Reset reason: %d\n", static_cast<int>(esp_reset_reason()));
  Serial.printf("ESP sleep wake-up cause: %s (%d)\n", wakeCauseName(wakeCause),
                static_cast<int>(wakeCause));
  Serial.printf("RTC timer-wake counter: %lu\n",
                static_cast<unsigned long>(rtcTimerWakeCounter));
  Serial.printf("EPD_PWR state: %s\n", epdPowerIsLow() ? "LOW" : "ERROR: HIGH");

  if (!holdReleasedSafely) {
    forceEpdPowerLow();
    if (holdReleaseResult != ESP_OK) {
      Serial.printf("FAIL: GPIO12 hold release failed: %d (%s); no further deep sleep\n",
                    static_cast<int>(holdReleaseResult), esp_err_to_name(holdReleaseResult));
    } else {
      Serial.println("FAIL: GPIO12 was not LOW after hold release; no further deep sleep");
    }
    safeIdle = true;
  }

#if !ALFRED_STAGE4_SLEEP_TEST_ARMED
  Serial.println("SAFE IDLE: sleep test is unarmed; deep sleep is disabled");
  safeIdle = true;
#else
  if (!holdReleasedSafely) {
    // The failure above is terminal so a retained LOW hold is never disturbed.
  } else if (wakeCause == ESP_SLEEP_WAKEUP_TIMER) {
    ++rtcTimerWakeCounter;
    Serial.printf("Timer wake confirmed; RTC timer-wake counter: %lu\n",
                  static_cast<unsigned long>(rtcTimerWakeCounter));
    if (rtcTimerWakeCounter == kRequiredTimerWakes) {
      Serial.println("FINAL PASS: three timer deep-sleep wake cycles completed");
      safeIdle = true;
    } else if (rtcTimerWakeCounter < kRequiredTimerWakes) {
      Serial.println("Waiting five seconds before the next timer sleep");
      waitWithEpdPowerLow(5000);
      enterTimerDeepSleep();
    } else {
      Serial.println("FAIL: RTC timer-wake counter exceeded three; no further sleep");
      safeIdle = true;
    }
  } else if (wakeCause == ESP_SLEEP_WAKEUP_UNDEFINED && rtcTimerWakeCounter == 0) {
    Serial.println("Initial normal boot: EPD_PWR confirmed LOW");
    Serial.println("Timer wake test is starting; waiting ten seconds");
    waitWithEpdPowerLow(10000);
    enterTimerDeepSleep();
  } else {
    Serial.printf("FAIL: expected a timer wake but received %s (%d); no retry\n",
                  wakeCauseName(wakeCause), static_cast<int>(wakeCause));
    safeIdle = true;
  }
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
