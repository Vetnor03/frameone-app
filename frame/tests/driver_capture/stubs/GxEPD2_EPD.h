#pragma once
// Test-only replacement for the panel transport. Not the actual T7 class,
// SPI, panel RAM, update waveform or panel-specific refresh code.
#include <stdint.h>
#define GxEPD_BLACK 0x0000
#define GxEPD_WHITE 0xFFFF
#ifndef pgm_read_byte
#define pgm_read_byte(addr) (*(const uint8_t*)(addr))
#endif
namespace GxEPD2 {
  enum Panel { GDE0213B1, GDEW075T7 };
}
