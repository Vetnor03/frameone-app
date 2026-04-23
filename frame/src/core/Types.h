#pragma once
#include <Arduino.h>

struct PairStartResponse {
  String pair_code;
  int expires_in_sec = 0;
};

struct PairStatusResponse {
  bool paired = false;
  String device_token;
};

enum CellSize {
  CELL_SMALL,
  CELL_MEDIUM,
  CELL_LARGE,
  CELL_XL   
};

struct Cell {
  int x, y, w, h;
  uint8_t slot;
  CellSize size;
};
