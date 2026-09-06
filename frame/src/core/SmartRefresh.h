#pragma once
#include <Arduino.h>
#include <time.h>
#include "Types.h"

// Smart refresh state is created from setup()/loopTask in several paths. Keep the
// container objects themselves tiny: the ESP32 Arduino loop task has limited
// stack, while each module carries up to 12 deadlines. Fixed inline arrays here
// can consume several kilobytes before pairing/network code even starts.
template <typename T, size_t N>
class HeapBackedArray {
public:
  HeapBackedArray() : data_(new T[N]()) {}
  ~HeapBackedArray() { delete[] data_; }

  HeapBackedArray(const HeapBackedArray& other) : data_(new T[N]()) {
    for (size_t i = 0; i < N; ++i) data_[i] = other.data_[i];
  }

  HeapBackedArray& operator=(const HeapBackedArray& other) {
    if (this == &other) return *this;
    ensureAllocated();
    for (size_t i = 0; i < N; ++i) data_[i] = other.data_[i];
    return *this;
  }

  HeapBackedArray(HeapBackedArray&& other) noexcept : data_(other.data_) {
    other.data_ = nullptr;
  }

  HeapBackedArray& operator=(HeapBackedArray&& other) noexcept {
    if (this == &other) return *this;
    delete[] data_;
    data_ = other.data_;
    other.data_ = nullptr;
    return *this;
  }

  T& operator[](size_t index) { return data_[index]; }
  const T& operator[](size_t index) const { return data_[index]; }

private:
  void ensureAllocated() {
    if (!data_) data_ = new T[N]();
  }

  T* data_;
};

enum SmartDeadlineType : uint8_t { SMART_HARD, SMART_SOFT };
struct SmartDeadline { time_t at = 0; SmartDeadlineType type = SMART_SOFT; };
struct SmartModuleState {
  String key;
  String hash;
  Cell bounds{};
  bool partialSafe = false;
  SmartDeadline deadlines[12];
  uint8_t deadlineCount = 0;
};
struct SmartRenderState {
  String layoutHash;
  HeapBackedArray<SmartModuleState, MAX_GRID_CELLS> modules;
  uint8_t moduleCount = 0;
};
struct SmartDisplayPlan {
  enum Type : uint8_t { NONE, PARTIAL, FULL } type = NONE;
  HeapBackedArray<Cell, MAX_GRID_CELLS> regions;
  uint8_t regionCount = 0;
  HeapBackedArray<bool, MAX_GRID_CELLS> dirty;
};
struct ContentRevisionState {
  uint64_t revision = 0;
  bool changed = false;
  String affectedModules;
};

// These types are intentionally instantiated as locals in firmware refresh paths.
// Guard the root cause of the pairing reboot loop: never let their inline size
// grow back into kilobytes of loopTask stack.
static_assert(sizeof(SmartRenderState) <= 64, "SmartRenderState must remain stack-light");
static_assert(sizeof(SmartDisplayPlan) <= 64, "SmartDisplayPlan must remain stack-light");

namespace SmartRefresh {
  static const uint32_t REVISION_SAFETY_SECONDS = 10 * 60;
  static const uint32_t MANUAL_PROBE_SECONDS = 10;
  static const uint32_t COALESCE_SECONDS = 15 * 60;
  bool probeRevision(const String& token, uint64_t since, ContentRevisionState& out);
  bool fetchRenderState(const String& token, const String& modules, SmartRenderState& out);
  SmartDisplayPlan plan(const SmartRenderState& desired, bool grayscaleMode = false);
  void commitSuccessfulDisplay(const SmartRenderState& desired, const SmartDisplayPlan& plan);
  uint64_t displayedRevision();
  void saveDisplayedRevision(uint64_t revision);
  uint32_t secondsUntilNextWake(const SmartRenderState& state, time_t now,
                                time_t revisionCheckedAt);
  String dueModuleCsv(const SmartRenderState& state, time_t now);
  bool loadScheduler(SmartRenderState& out, time_t& revisionCheckedAt);
  bool saveScheduler(const SmartRenderState& state, time_t revisionCheckedAt);
  void mergeScheduler(SmartRenderState& complete, const SmartRenderState& update,
                      bool screenWide);
  String unionModuleCsv(const String& first, const String& second);
}
