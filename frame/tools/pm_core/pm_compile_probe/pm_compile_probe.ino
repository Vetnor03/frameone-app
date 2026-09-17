#include <Arduino.h>
#include <esp_pm.h>
#include <sdkconfig.h>

#if !defined(CONFIG_PM_ENABLE) || !CONFIG_PM_ENABLE
#error "CONFIG_PM_ENABLE is not enabled in the Arduino ESP32-S3 SDK"
#endif

#if !defined(CONFIG_FREERTOS_USE_TICKLESS_IDLE) || !CONFIG_FREERTOS_USE_TICKLESS_IDLE
#error "CONFIG_FREERTOS_USE_TICKLESS_IDLE is not enabled in the Arduino ESP32-S3 SDK"
#endif

#if !defined(CONFIG_IDF_TARGET_ESP32S3)
#error "This test must compile for ESP32-S3"
#endif

void setup() {
  esp_pm_config_esp32s3_t config{};
  config.max_freq_mhz = 240;
  config.min_freq_mhz = 40;
  config.light_sleep_enable = true;

  // Compile/link validation for the exact API used by RE:MIND WiFiManager.
  (void)esp_pm_configure(&config);
}

void loop() {
  delay(1000);
}
