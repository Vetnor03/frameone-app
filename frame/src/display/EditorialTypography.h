#pragma once
#include "EditorialDesign.h"

// A common font role can select fonts already owned by each module.
// No global font allocations or duplicate GFX font header definitions.
namespace EditorialTypography {
template <class Font>
inline const Font* choose(const EditorialDesign::Plan& plan,
                          EditorialDesign::Role role,
                          const Font* regular9, const Font* regular12,
                          const Font* bold12, const Font* bold18) {
  switch (EditorialDesign::specFor(plan, role).font) {
    case EditorialDesign::REGULAR_9: return regular9;
    case EditorialDesign::REGULAR_12: return regular12 ? regular12 : regular9;
    case EditorialDesign::BOLD_12: return bold12 ? bold12 : regular9;
    case EditorialDesign::BOLD_18: return bold18 ? bold18 : bold12;
  }
  return regular9;
}
inline int lineStep(EditorialDesign::FontToken font) {
  switch (font) {
    case EditorialDesign::REGULAR_9: return 21;
    case EditorialDesign::REGULAR_12: return 28;
    case EditorialDesign::BOLD_12: return 29;
    case EditorialDesign::BOLD_18: return 41;
  }
  return 21;
}
} // namespace EditorialTypography
