#pragma once

#include <stddef.h>

namespace FrameText {
// Decodes UTF-8 into the frame font's single-byte glyph encoding. The caller
// owns the fixed output buffer; unsupported and malformed input is skipped.
size_t normalizeUtf8ForDisplay(char* output, size_t outputSize, const char* input);
}
