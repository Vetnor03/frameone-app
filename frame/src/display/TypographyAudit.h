#pragma once

// Explicit Alfred USB-only diagnostic. No network, pairing, NVS or OTA.
// The normal release target compiles this feature out completely.
namespace TypographyAudit {
void begin();
void poll();
}
