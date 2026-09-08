#pragma once
#include <Arduino.h>
#include "SmartRefresh.h"
#include "BatteryManager.h"

// TEMP_REFRESH_AUDIT
// Temporary diagnostic instrumentation for tuning RE:MIND refresh/wake behaviour.
// Removal procedure:
// 1. Search repository for TEMP_REFRESH_AUDIT.
// 2. Remove firmware/backend audit helper and feature flag.
// 3. Remove audit upload path.
// 4. Remove diagnostic tests.
// 5. Drop the temporary Supabase audit table/migration cleanup.
namespace TempRefreshAudit {
  // TEMP_REFRESH_AUDIT: records one completed evaluation in a bounded NVS queue.
  void TEMP_REFRESH_AUDIT_record(const char* trigger, const String& sourceModules,
    const SmartRenderState& desired, const String& previousPhysicalHash,
    const SmartDisplayPlan& plan, bool displaySucceeded,
    uint64_t backendBefore, uint64_t backendAfter, const BatteryState& battery,
    bool chargerConnected, const char* wakeReason);
  // TEMP_REFRESH_AUDIT: call only while an existing application network session
  // is active; this function never connects Wi-Fi and is always best effort.
  void TEMP_REFRESH_AUDIT_flushPiggyback(const String& token);
}
