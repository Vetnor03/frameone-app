#pragma once

#include <Arduino.h>

// Confirmed Alfred Stage 1 GPIO map from docs/ALFRED_HARDWARE_MAP.md.
static constexpr uint8_t PIN_BOOT = 0;
static constexpr uint8_t PIN_EPD_BUSY = 4;
static constexpr uint8_t PIN_EPD_RST = 5;
static constexpr uint8_t PIN_EPD_DC = 6;
static constexpr uint8_t PIN_EPD_CS = 7;
static constexpr uint8_t PIN_I2C_SCL = 8;
static constexpr uint8_t PIN_I2C_SDA = 9;
static constexpr uint8_t PIN_EPD_SCK = 10;
static constexpr uint8_t PIN_EPD_MOSI = 11;
static constexpr uint8_t PIN_EPD_PWR = 12;
static constexpr uint8_t PIN_BQ_PGOOD_N = 17;
static constexpr uint8_t PIN_BQ_CHG_N = 18;
static constexpr uint8_t PIN_USB_D_MINUS = 19;
static constexpr uint8_t PIN_USB_D_PLUS = 20;

static constexpr uint32_t I2C_BUS_HZ = 100000;
static constexpr uint8_t MAX17048_ADDR = 0x36;
static constexpr uint8_t MAX17048_REG_VCELL = 0x02;
static constexpr uint8_t MAX17048_REG_SOC = 0x04;
