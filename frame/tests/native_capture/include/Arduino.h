#pragma once
// Test-only host ABI, never compiled by the target ESP32.
#include <stdint.h>
#include <stddef.h>
#include <time.h>
#define PROGMEM
#define pgm_read_byte(addr) (*reinterpret_cast<const uint8_t*>(addr))
#define pgm_read_word(addr) (*reinterpret_cast<const uint16_t*>(addr))
#define pgm_read_ptr(addr) (*(addr))
template<class T> inline T min(T a,T b){return a<b?a:b;}
template<class T> inline T max(T a,T b){return a>b?a:b;}
bool getLocalTime(struct tm* target, unsigned long timeout);
static const uint16_t GxEPD_BLACK=0x0000;
static const uint16_t GxEPD_WHITE=0xffff;
