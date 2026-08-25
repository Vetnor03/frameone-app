#include "FrameText.h"

#include <stdint.h>

namespace {
bool safeAscii(uint32_t cp) {
  if ((cp >= 'A' && cp <= 'Z') || (cp >= 'a' && cp <= 'z') || (cp >= '0' && cp <= '9')) return true;
  switch (cp) {
    case ' ': case '.': case ',': case ':': case ';': case '!': case '?':
    case '\'': case '"': case '(': case ')': case '/': case '+': case '-':
    case '&': case '%': case '#': return true;
    default: return false;
  }
}

uint32_t decode(const unsigned char*& p) {
  const unsigned char first = *p++;
  if (first < 0x80) return first;
  unsigned needed = 0;
  uint32_t cp = 0;
  if (first >= 0xC2 && first <= 0xDF) { needed = 1; cp = first & 0x1F; }
  else if (first >= 0xE0 && first <= 0xEF) { needed = 2; cp = first & 0x0F; }
  else if (first >= 0xF0 && first <= 0xF4) { needed = 3; cp = first & 0x07; }
  else return UINT32_MAX;
  const unsigned char* q = p;
  for (unsigned i = 0; i < needed; ++i) {
    if (!q[i] || (q[i] & 0xC0) != 0x80) return UINT32_MAX;
    cp = (cp << 6) | (q[i] & 0x3F);
  }
  if ((needed == 1 && cp < 0x80) || (needed == 2 && cp < 0x800) ||
      (needed == 3 && cp < 0x10000) || (cp >= 0xD800 && cp <= 0xDFFF) || cp > 0x10FFFF) return UINT32_MAX;
  p += needed;
  return cp;
}
}

namespace FrameText {
size_t normalizeUtf8ForDisplay(char* out, size_t size, const char* input) {
  if (!out || size == 0) return 0;
  size_t used = 0;
  bool previousSpace = true;
  const unsigned char* p = reinterpret_cast<const unsigned char*>(input ? input : "");
  auto emit = [&](char value) {
    if (value == ' ') {
      if (previousSpace) return;
      previousSpace = true;
    } else previousSpace = false;
    if (used + 1 < size) out[used++] = value;
  };
  while (*p && used + 1 < size) {
    const uint32_t cp = decode(p);

    // Preserve canonically decomposed Å/å (A/a + U+030A) just like precomposed UTF-8.
    if (cp == 'A' || cp == 'a') {
      const unsigned char* next = p;
      if (*next && decode(next) == 0x030A) {
        p = next;
        emit(static_cast<char>(cp == 'A' ? 0xC5 : 0xE5));
        continue;
      }
    }

    if (safeAscii(cp)) { emit(static_cast<char>(cp)); continue; }
    switch (cp) {
      case 0x00E6: emit(static_cast<char>(0xE6)); break; case 0x00C6: emit(static_cast<char>(0xC6)); break;
      case 0x00F8: emit(static_cast<char>(0xF8)); break; case 0x00D8: emit(static_cast<char>(0xD8)); break;
      case 0x00E5: emit(static_cast<char>(0xE5)); break; case 0x00C5: emit(static_cast<char>(0xC5)); break;
      case 0x00B0: emit(static_cast<char>(0xB0)); break;
      case 0x2018: case 0x2019: emit('\''); break;
      case 0x201C: case 0x201D: case 0x201E: case 0x00AB: case 0x00BB: emit('"'); break;
      case 0x2013: case 0x2014: case 0x2212: case 0x2022: emit('-'); break;
      case 0x2026: emit('.'); emit('.'); emit('.'); break;
      case 0x00A0: case '\t': case '\r': case '\n': emit(' '); break;
      // Common accented Latin letters deterministically lose their accent.
      case 0x00C0: case 0x00C1: case 0x00C2: case 0x00C3: case 0x00C4: emit('A'); break;
      case 0x00E0: case 0x00E1: case 0x00E2: case 0x00E3: case 0x00E4: emit('a'); break;
      case 0x00C7: emit('C'); break; case 0x00E7: emit('c'); break;
      case 0x00C8: case 0x00C9: case 0x00CA: case 0x00CB: emit('E'); break;
      case 0x00E8: case 0x00E9: case 0x00EA: case 0x00EB: emit('e'); break;
      case 0x00CC: case 0x00CD: case 0x00CE: case 0x00CF: emit('I'); break;
      case 0x00EC: case 0x00ED: case 0x00EE: case 0x00EF: emit('i'); break;
      case 0x00D1: emit('N'); break; case 0x00F1: emit('n'); break;
      case 0x00D2: case 0x00D3: case 0x00D4: case 0x00D5: case 0x00D6: emit('O'); break;
      case 0x00F2: case 0x00F3: case 0x00F4: case 0x00F5: case 0x00F6: emit('o'); break;
      case 0x00D9: case 0x00DA: case 0x00DB: case 0x00DC: emit('U'); break;
      case 0x00F9: case 0x00FA: case 0x00FB: case 0x00FC: emit('u'); break;
      case 0x00DD: case 0x0178: emit('Y'); break; case 0x00FD: case 0x00FF: emit('y'); break;
      default: break; // Never synthesize '?' for bad or unsupported input.
    }
  }
  while (used && out[used - 1] == ' ') --used;
  out[used] = 0;
  return used;
}

bool displayEqualsUtf8(const char* display, const char* utf8,
                       char* scratch, size_t scratchSize) {
  if (!scratch || scratchSize == 0) return false;
  normalizeUtf8ForDisplay(scratch, scratchSize, utf8);
  const char* stored = display ? display : "";
  for (size_t i = 0;; ++i) {
    if (stored[i] != scratch[i]) return false;
    if (stored[i] == 0) return true;
  }
}
}
