#include <cassert>
#include "../src/display/FrameLayout.h"

int main() {
  const FrameLayout::Rect bounds{10, 20, 200, 120};
  const FrameLayout::Rect usable = FrameLayout::inset(bounds, 12, 10);
  assert(usable.x == 22 && usable.y == 30);
  assert(usable.width == 176 && usable.height == 100);
  assert(usable.isWide() && !usable.isTall());
  assert(FrameLayout::remainingVertical(usable, 90) == 40);
  assert(FrameLayout::remainingHorizontal(usable, 100) == 98);
  assert(FrameLayout::rowCapacity(100, 38, 4) == 2);
  assert(FrameLayout::fitsRows(80, 2, 38, 4));
  assert(!FrameLayout::fitsRows(79, 2, 38, 4));
}
