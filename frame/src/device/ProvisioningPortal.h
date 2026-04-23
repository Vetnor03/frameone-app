#pragma once
#include <Arduino.h>

namespace ProvisioningPortal {
  // Start AP + captive portal, blocking loop until creds saved (then reboots)
  void runBlocking();
}