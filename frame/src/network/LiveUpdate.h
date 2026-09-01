#pragma once

#include <Arduino.h>

struct LiveUpdateState {
  uint64_t requestedRevision;
  uint64_t displayedRevision;
};

namespace LiveUpdate {
  bool probe(const String& deviceToken, LiveUpdateState& out);
  bool acknowledge(const String& deviceToken, uint64_t revision);

  uint64_t getRenderedAwaitingAck();
  void saveRenderedAwaitingAck(uint64_t revision);
  void clearRenderedAwaitingAckThrough(uint64_t revision);
}
