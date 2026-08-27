#pragma once

namespace AdaptiveModuleCapability {

inline char asciiLower(char value) {
  return value >= 'A' && value <= 'Z' ? static_cast<char>(value + ('a' - 'A')) : value;
}

// Accept only the exact base name or its colon-delimited instance form.
inline bool exactBase(const char* module, const char* base) {
  if (!module || !base || !module[0] || !base[0]) return false;
  int index = 0;
  while (base[index]) {
    if (!module[index] || asciiLower(module[index]) != asciiLower(base[index])) return false;
    ++index;
  }
  return module[index] == '\0' || module[index] == ':';
}

inline bool exactOnly(const char* module, const char* expected) {
  if (!module || !expected) return false;
  int index = 0;
  while (module[index] && expected[index]) {
    if (asciiLower(module[index]) != asciiLower(expected[index])) return false;
    ++index;
  }
  return module[index] == '\0' && expected[index] == '\0';
}

inline bool supports(const char* module) {
  return exactOnly(module, "date") || exactBase(module, "weather") ||
         exactBase(module, "reminders") || exactBase(module, "countdown");
}

} // namespace AdaptiveModuleCapability
