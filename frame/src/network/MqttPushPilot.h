#pragma once

#include <Arduino.h>

// EXPERIMENT ONLY: production firmware keeps this disabled. Enabling requires
// broker TLS, a distinct per-device MQTT password and device-scoped ACLs.
#ifndef FRAME_MQTT_PILOT_ENABLED
#define FRAME_MQTT_PILOT_ENABLED 0
#endif

namespace MqttPushPilot {
  // Nonblocking in steady state; reconnect attempts may take a few seconds.
  // Returns true only while the encrypted MQTT subscription is connected.
  bool poll(const String& deviceToken, bool usbPresent); // Token is only used for RE:MIND HTTPS.
  // Whether the current broker subscription is live; used to select a
  // faster, local-only MQTT service cadence without changing HTTPS cadence.
  bool connected();
  // Locally cached 120-second presence TTL, only true with a live subscription.
  bool appActivityIsActive();
  // Restore MAX_MODEM after 120s without app activity, or switch to MIN_MODEM
  // while authenticated foreground hints are arriving. USB remains realtime.
  void maintainActivityPowerPolicy(bool usbPresent);
  // Notifications only prompt an authenticated HTTPS revision verification.
  // They do not contain arbitrary display content or bypass revision ACKs.
  bool takeNotification();
  // Retry the same hint on the next cadence if HTTPS revision verification fails.
  void restoreNotification();
}
