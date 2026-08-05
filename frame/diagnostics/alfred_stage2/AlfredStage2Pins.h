#pragma once

#include <Arduino.h>

static const int PIN_EPD_BUSY = 4;
static const int PIN_EPD_RST  = 5;
static const int PIN_EPD_DC   = 6;
static const int PIN_EPD_CS   = 7;
static const int PIN_EPD_SCK  = 10;
static const int PIN_EPD_MOSI = 11;
static const int PIN_EPD_PWR  = 12;

static const int PIN_EPD_MISO_UNUSED = -1;

static const uint32_t ALFRED_STAGE2_SERIAL_BAUD = 115200;
static const uint32_t ALFRED_STAGE2_SPI_HZ = 4000000UL;
static const uint32_t ALFRED_STAGE2_POWER_SETTLE_MS = 10UL;
static const uint32_t ALFRED_STAGE2_PANEL_SHUTDOWN_MS = 42UL;
static const uint32_t ALFRED_STAGE2_BUSY_TIMEOUT_MS = 10000UL;
