#pragma once

#include <Arduino.h>

// The standard Alfred ESP32-S3 build includes MQTT automatically. Broker
// provisioning is controlled by authenticated backend rollout switches; a
// disconnected/unconfigured broker leaves the existing HTTPS fallback intact.
// Keep the legacy original-ESP32 build source-compatible without forcing MQTT.
#include "HardwareProfile.h"
#ifndef FRAME_MQTT_PILOT_ENABLED
#if defined(FRAME_IS_ALFRED_V1_2)
#define FRAME_MQTT_PILOT_ENABLED 1
#else
#define FRAME_MQTT_PILOT_ENABLED 0
#endif
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
  // True once after each successful (re)subscription. Always verify
  // the durable revision after reconnection: Ably MQTT QoS0 has no replay.
  bool takeSubscriptionResync();
  void restoreSubscriptionResync();
}
