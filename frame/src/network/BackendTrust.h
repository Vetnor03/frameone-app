#pragma once

#include <Arduino.h>
#include <WiFiClientSecure.h>

namespace BackendTrust {

// Embedded *root* CAs, not a short-lived leaf/intermediate or fingerprint.
// Vercel currently uses Let's Encrypt for automatic certificates. Review the
// chain and rotate this trust set BEFORE changing the backend CA/provider.
extern const char kRootCaPem[];

// A plausible UTC clock is required before certificate date validation.
bool ensureClock(uint32_t timeoutMs = 8000);

// Only the configured HTTPS origin is trusted for API requests AND OTA images.
// Do not send credentials to, or install firmware from, arbitrary URLs.
bool isTrustedBackendUrl(const String& url);

void configure(WiFiClientSecure& client);

}  // namespace BackendTrust
