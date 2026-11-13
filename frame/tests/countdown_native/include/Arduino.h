#pragma once
#include <cstdint>
#include <cstring>
#define PROGMEM
#define pgm_read_byte(p) (*reinterpret_cast<const uint8_t*>(p))
#define pgm_read_word(p) (*reinterpret_cast<const uint16_t*>(p))
