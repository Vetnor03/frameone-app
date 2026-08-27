#pragma once

// Small, allocation-free measurements shared by frame modules. This deliberately
// describes available space only; each module remains responsible for deciding
// which content deserves that space.
namespace FrameLayout {

struct Rect {
  int x;
  int y;
  int width;
  int height;

  Rect(int xValue = 0, int yValue = 0, int widthValue = 0, int heightValue = 0)
      : x(xValue), y(yValue), width(widthValue), height(heightValue) {}

  int right() const { return x + width; }
  int bottom() const { return y + height; }
  bool isWide() const { return width > height; }
  bool isTall() const { return height > width; }
};

inline int clampMeasurement(int value, int low, int high) {
  return value < low ? low : value > high ? high : value;
}

inline Rect inset(const Rect& bounds, int horizontal, int vertical) {
  const int dx = clampMeasurement(horizontal, 0, bounds.width / 2);
  const int dy = clampMeasurement(vertical, 0, bounds.height / 2);
  return {bounds.x + dx, bounds.y + dy, bounds.width - dx * 2, bounds.height - dy * 2};
}

inline int remainingVertical(const Rect& bounds, int cursorY) {
  const int remaining = bounds.bottom() - cursorY;
  return remaining > 0 ? remaining : 0;
}

inline int remainingHorizontal(const Rect& bounds, int cursorX) {
  const int remaining = bounds.right() - cursorX;
  return remaining > 0 ? remaining : 0;
}

inline bool fitsRows(int available, int rowCount, int minimumRow, int minimumGap = 0) {
  if (rowCount <= 0) return true;
  return available >= rowCount * minimumRow + (rowCount - 1) * minimumGap;
}

inline int rowCapacity(int available, int minimumRow, int minimumGap = 0) {
  if (available < minimumRow || minimumRow <= 0 || minimumGap < 0) return 0;
  return 1 + (available - minimumRow) / (minimumRow + minimumGap);
}

}  // namespace FrameLayout
