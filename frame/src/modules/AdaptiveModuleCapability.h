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

inline bool hasPrefix(const char* module, const char* prefix) {
  if (!module || !prefix) return false;
  for (int index = 0; prefix[index]; ++index)
    if (!module[index] || asciiLower(module[index]) != asciiLower(prefix[index])) return false;
  return true;
}

inline bool numericInstance(const char* module, const char* base, int maxInstance = 255) {
  if (!module || !base) return false;
  int index = 0;
  while (base[index]) {
    if (!module[index] || asciiLower(module[index]) != asciiLower(base[index])) return false;
    ++index;
  }
  if (module[index] == '\0') return true;
  if (module[index++] != ':' || module[index] == '\0') return false;
  int value = 0;
  for (; module[index]; ++index) {
    if (module[index] < '0' || module[index] > '9') return false;
    value = value * 10 + module[index] - '0';
    if (value > maxInstance) return false;
  }
  return value >= 1;
}

inline bool supports(const char* module) {
  return exactOnly(module, "date") || exactOnly(module, "groceries") || exactOnly(module, "assistant") || exactBase(module, "weather") ||
         exactBase(module, "reminders") || exactBase(module, "countdown") ||
         numericInstance(module, "surf") || numericInstance(module, "soccer", 4) ||
         numericInstance(module, "stocks");
}

} // namespace AdaptiveModuleCapability
