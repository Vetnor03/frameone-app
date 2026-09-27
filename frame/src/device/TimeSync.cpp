#include "TimeSync.h"
#include <time.h>
#include <sys/time.h>

namespace TimeSync {

static bool timeValid() {
  time_t now = time(nullptr);
  // Only accept clocks at or after the 2026 release year for TLS validity.
  // An unset clock must never trigger an insecure certificate fallback.
  return now >= 1767225600;
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
