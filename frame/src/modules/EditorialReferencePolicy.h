#pragma once
#include "EditorialDesign.h"

// A module may have a human-approved reference composition at one grid shape.
// Shared typography/geometry governs every other shape, but must not silently
// replace approved modules with a generic widget. Only Surf Medium is approved.
namespace EditorialReferences {
enum Presentation { ADAPTIVE, SURF_MEDIUM_REFERENCE };

inline Presentation select(EditorialDesign::ContentKind kind,
                           int colSpan, int rowSpan) {
  if (kind == EditorialDesign::SURF_FACTS && colSpan == 2 && rowSpan == 2)
    return SURF_MEDIUM_REFERENCE;
  return ADAPTIVE;
}
} // namespace EditorialReferences
