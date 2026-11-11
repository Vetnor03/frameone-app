#pragma once
#include <cstdint>
#include <cstddef>
#define PROGMEM
#define pgm_read_byte(addr) (*reinterpret_cast<const uint8_t*>(addr))
