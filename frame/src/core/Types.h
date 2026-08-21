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
  CELL_XL,
  CELL_ADAPTIVE
};

struct Cell {
  int x, y, w, h;
  uint8_t slot;
  CellSize size;
};

struct GridCell {
  uint8_t col, row, colSpan, rowSpan, slot;
  CellSize size;
};

static const uint8_t MAX_GRID_CELLS = 16;

struct GridLayout {
  GridCell cells[MAX_GRID_CELLS];
  uint8_t count = 0;
};
