#pragma once

#include <Arduino.h>

struct LiveUpdateState {
  uint64_t requestedRevision;
  uint64_t displayedRevision;
};

// Optional one-shot diagnostics piggybacked on the already-required manual
// display ACK. No extra radio wake, server request, or database schema change.
struct ManualUpdateTimings {
  bool ready = false;
  uint32_t attempts = 0;
  uint32_t probeToPendingMs = 0;
  uint32_t updatingScreenMs = 0;
  uint32_t configFetchMs = 0;
  uint32_t renderStateFetchMs = 0;
  uint32_t remindersPreloadMs = 0;
  uint32_t newsPreloadMs = 0;
  uint32_t soccerPreloadMs = 0;
  uint32_t displayMs = 0;
  uint32_t renderTotalMs = 0;
  uint32_t postRenderMs = 0;
  uint32_t beforeAckMs = 0;
};

namespace LiveUpdate {
  bool probe(const String& deviceToken, LiveUpdateState& out);
  uint32_t lastNetworkProbeStartedAtMs();
  bool acknowledge(const String& deviceToken, uint64_t revision, const ManualUpdateTimings* timings = nullptr);

  uint64_t getRenderedAwaitingAck();
  void saveRenderedAwaitingAck(uint64_t revision);
  void clearRenderedAwaitingAckThrough(uint64_t revision);
}
