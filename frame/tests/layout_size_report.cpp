#include <cstdio>

#include "Types.h"

struct CustomRenderPlanSizeProbe {
  Cell cells[MAX_GRID_CELLS];
  int cellCount = 0;
  PixelDivider dividers[MAX_GRID_DIVIDERS];
  int dividerCount = 0;
};

static_assert(sizeof(Cell) == 24);
static_assert(sizeof(PixelDivider) == 16);
static_assert(sizeof(CustomRenderPlanSizeProbe) == 776);
static_assert(sizeof(GridDividerLayout) == 196);
static_assert(sizeof(GridLayout) == 196);

int main() {
  std::printf("sizeof(Cell)=%zu\n", sizeof(Cell));
  std::printf("sizeof(PixelDivider)=%zu\n", sizeof(PixelDivider));
  std::printf("sizeof(CustomRenderPlan)=%zu\n", sizeof(CustomRenderPlanSizeProbe));
  std::printf("sizeof(GridDividerLayout)=%zu\n", sizeof(GridDividerLayout));
  std::printf("sizeof(GridLayout)=%zu\n", sizeof(GridLayout));
  return 0;
}
