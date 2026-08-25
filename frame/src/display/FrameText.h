#pragma once

#include <stddef.h>

namespace FrameText {
// Decodes UTF-8 into the frame font's single-byte glyph encoding. The caller
// owns the fixed output buffer; unsupported and malformed input is skipped.
size_t normalizeUtf8ForDisplay(char* output, size_t outputSize, const char* input);

// Compares stored display bytes with incoming UTF-8 using the same canonical
// representation. Scratch is caller-owned so config checks remain allocation-free.
bool displayEqualsUtf8(const char* display, const char* utf8,
                       char* scratch, size_t scratchSize);
}
