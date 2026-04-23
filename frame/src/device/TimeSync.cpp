#include "TimeSync.h"
#include <time.h>
#include <sys/time.h>

namespace TimeSync {

static bool timeValid() {
  time_t now = time(nullptr);
  // valid if after 2024-01-01
  return now > 1704067200;
}

bool ensure(uint32_t timeoutMs) {
  // Oslo timezone with DST
  setenv("TZ", "CET-1CEST,M3.5.0/02,M10.5.0/03", 1);
  tzset();

  // Start NTP (safe to call multiple times)
  configTime(0, 0, "pool.ntp.org", "time.google.com", "time.nist.gov");

  uint32_t t0 = millis();
  while (millis() - t0 < timeoutMs) {
    if (timeValid()) return true;
    delay(150);
  }
  return timeValid();
}

} // namespace TimeSync
