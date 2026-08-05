#include <Arduino.h>
#include <Wire.h>
#include <esp_system.h>
#include <esp_chip_info.h>
#include <esp_arduino_version.h>

#include "AlfredPins.h"

struct Max17048Reading {
  bool ok = false;
  uint16_t rawVCell = 0;
  uint16_t rawSoc = 0;
  float volts = 0.0f;
  float percent = 0.0f;
};

static Max17048Reading lastBattery;
static bool max17048Present = false;
static uint32_t lastStatusMs = 0;

static const char* highLow(int state) {
  return state == HIGH ? "HIGH" : "LOW";
}

static void enforceEpdPowerOff() {
  if (digitalRead(PIN_EPD_PWR) == HIGH) {
    digitalWrite(PIN_EPD_PWR, LOW);
    Serial.println("*** WARNING: GPIO12 / EPD_PWR read HIGH; forced LOW immediately. ***");
  }
}

static bool readRegister16(uint8_t address, uint8_t reg, uint16_t& value) {
  Wire.beginTransmission(address);
  Wire.write(reg);
  uint8_t tx = Wire.endTransmission(false);
  if (tx != 0) {
    return false;
  }

  uint8_t received = Wire.requestFrom(static_cast<int>(address), 2);
  if (received != 2) {
    while (Wire.available() > 0) {
      Wire.read();
    }
    return false;
  }

  uint8_t msb = Wire.read();
  uint8_t lsb = Wire.read();
  value = (static_cast<uint16_t>(msb) << 8) | lsb;
  return true;
}

static bool probeI2cAddress(uint8_t address) {
  Wire.beginTransmission(address);
  return Wire.endTransmission() == 0;
}

static uint8_t scanI2cBus() {
  uint8_t found = 0;
  Serial.println("I2C scan: valid non-reserved 7-bit addresses 0x08 through 0x77");
  for (uint8_t address = 0x08; address <= 0x77; ++address) {
    enforceEpdPowerOff();
    Wire.beginTransmission(address);
    uint8_t error = Wire.endTransmission();
    if (error == 0) {
      Serial.print("  Detected I2C device at 0x");
      if (address < 0x10) Serial.print('0');
      Serial.println(address, HEX);
      ++found;
    }
  }
  Serial.print("I2C devices detected: ");
  Serial.println(found);
  return found;
}

static Max17048Reading readMax17048() {
  Max17048Reading reading;
  if (!probeI2cAddress(MAX17048_ADDR)) {
    return reading;
  }

  uint16_t rawVCell = 0;
  uint16_t rawSoc = 0;
  if (!readRegister16(MAX17048_ADDR, MAX17048_REG_VCELL, rawVCell)) {
    return reading;
  }
  if (!readRegister16(MAX17048_ADDR, MAX17048_REG_SOC, rawSoc)) {
    return reading;
  }

  reading.ok = true;
  reading.rawVCell = rawVCell;
  reading.rawSoc = rawSoc;
  // MAX17048 datasheet: VCELL is a 12-bit value left-justified in the
  // 16-bit register. Convert either as raw * 78.125 uV or (raw >> 4) * 1.25 mV.
  // SOC is an 8.8 fixed-point percentage value, but Alfred V1.0 hardware wires
  // MAX17048 VDD to +3V3 instead of BAT, so voltage and SOC are diagnostic-only.
  reading.volts = static_cast<float>(rawVCell) * 0.000078125f;
  reading.percent = static_cast<float>(rawSoc) / 256.0f;
  return reading;
}

static void printResetReason() {
  Serial.print("Reset reason: ");
  Serial.println(static_cast<int>(esp_reset_reason()));
}

static void printStartupDiagnostics() {
  esp_chip_info_t chipInfo;
  esp_chip_info(&chipInfo);

  Serial.println("================================");
  Serial.println("RE:MIND Alfred Stage 1");
  Serial.println("Safe hardware diagnostics");
  Serial.println("E-paper power: DISABLED");
  Serial.println("WARNING: Alfred V1.0 MAX17048 VDD is connected to +3V3.");
  Serial.println("Fuel-gauge voltage and SOC do not represent the battery.");
  Serial.println("================================");
  Serial.printf("Chip model: %s\n", ESP.getChipModel());
  Serial.printf("Chip revision: %u\n", ESP.getChipRevision());
  Serial.printf("Number of cores: %u\n", chipInfo.cores);
  Serial.printf("CPU frequency: %u MHz\n", ESP.getCpuFreqMHz());
  Serial.printf("Flash size: %u bytes\n", ESP.getFlashChipSize());
  Serial.printf("Flash speed: %u Hz\n", ESP.getFlashChipSpeed());
  Serial.printf("PSRAM detected: %s\n", psramFound() ? "yes" : "no");
  Serial.printf("PSRAM size: %u bytes\n", ESP.getPsramSize());
  Serial.printf("Free heap: %u bytes\n", ESP.getFreeHeap());
  Serial.printf("Free PSRAM: %u bytes\n", ESP.getFreePsram());
  printResetReason();
  Serial.printf("SDK version: %s\n", ESP.getSdkVersion());
  Serial.printf("Arduino ESP32 version: %s\n", ESP_ARDUINO_VERSION_STR);
  Serial.printf("Device MAC address: %012llX\n", ESP.getEfuseMac());
  Serial.printf("GPIO12 / EPD_PWR state: %s\n", highLow(digitalRead(PIN_EPD_PWR)));
}

static void printChargerRawStates() {
  Serial.printf("BQ_PGOOD_N raw state: %s\n", highLow(digitalRead(PIN_BQ_PGOOD_N)));
  Serial.printf("BQ_CHG_N raw state: %s\n", highLow(digitalRead(PIN_BQ_CHG_N)));
  Serial.println("Interpretation intentionally deferred until BQ24074 truth table is verified.");
}

void setup() {
  pinMode(PIN_EPD_PWR, OUTPUT);
  digitalWrite(PIN_EPD_PWR, LOW);

  Serial.begin(115200);
  delay(1200);
  enforceEpdPowerOff();

  printStartupDiagnostics();

  pinMode(PIN_BQ_PGOOD_N, INPUT);
  pinMode(PIN_BQ_CHG_N, INPUT);
  printChargerRawStates();

  Wire.setTimeOut(50);
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(I2C_BUS_HZ);
  Serial.printf("I2C initialized: SDA GPIO%u, SCL GPIO%u, speed %u Hz\n", PIN_I2C_SDA, PIN_I2C_SCL, I2C_BUS_HZ);

  scanI2cBus();
  max17048Present = probeI2cAddress(MAX17048_ADDR);
  Serial.printf("MAX17048 expected address 0x%02X: %s\n", MAX17048_ADDR, max17048Present ? "responding" : "not detected");
  if (max17048Present) {
    Serial.printf("MAX17048 detected address: 0x%02X\n", MAX17048_ADDR);
    lastBattery = readMax17048();
    if (lastBattery.ok) {
      Serial.printf("MAX17048 raw VCELL: 0x%04X, corrected converted voltage: %.3f V (+3V3 rail, not battery)\n", lastBattery.rawVCell, lastBattery.volts);
      Serial.printf("MAX17048 raw SOC: 0x%04X, state of charge: %.2f %% (invalid on Alfred V1.0)\n", lastBattery.rawSoc, lastBattery.percent);
    } else {
      Serial.println("MAX17048 read failed safely; no configuration writes were attempted.");
    }
  }
}

void loop() {
  enforceEpdPowerOff();

  uint32_t now = millis();
  if (now - lastStatusMs >= 2000) {
    lastStatusMs = now;
    if (max17048Present) {
      lastBattery = readMax17048();
    }

    Serial.print("STATUS uptime_s=");
    Serial.print(now / 1000);
    Serial.print(" EPD_PWR=");
    Serial.print(highLow(digitalRead(PIN_EPD_PWR)));
    Serial.print(" MAX17048=");
    Serial.print(lastBattery.ok ? "ok" : (max17048Present ? "read_fail" : "not_detected"));
    if (lastBattery.ok) {
      Serial.print(" raw_vcell=0x");
      if (lastBattery.rawVCell < 0x1000) Serial.print('0');
      if (lastBattery.rawVCell < 0x0100) Serial.print('0');
      if (lastBattery.rawVCell < 0x0010) Serial.print('0');
      Serial.print(lastBattery.rawVCell, HEX);
      Serial.print(" corrected_voltage_V=");
      Serial.print(lastBattery.volts, 3);
      Serial.print(" soc_pct_invalid=");
      Serial.print(lastBattery.percent, 2);
    }
    Serial.print(" BQ_PGOOD_N=");
    Serial.print(highLow(digitalRead(PIN_BQ_PGOOD_N)));
    Serial.print(" BQ_CHG_N=");
    Serial.print(highLow(digitalRead(PIN_BQ_CHG_N)));
    Serial.print(" free_heap=");
    Serial.print(ESP.getFreeHeap());
    Serial.print(" free_psram=");
    Serial.println(ESP.getFreePsram());
  }

  delay(25);
}
