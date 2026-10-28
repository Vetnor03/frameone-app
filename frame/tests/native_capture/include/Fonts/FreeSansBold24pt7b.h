#pragma once
// Legacy-only fallback font in host capture. The 24pt stock header isn't
// shipped in this repository. Native Date editorial never uses this alias.
// A legacy-fallback image is NOT accepted/represented as a real capture.
#include "RemindEditorialFonts.h"
#define FreeSansBold24pt7b (*RemindEditorialFonts::fraunces48())
