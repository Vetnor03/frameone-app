#pragma once

#include <Arduino.h>

class FirmwareUpdater {
public:
  static void begin(const char* baseUrl, const char* fwVersion);
  static void loop();

  // Optional manual trigger
  static void requestCheckNow();

  // Optional state निरीpection
  static bool isBusy();
  static unsigned long nextCheckAtMs();

private:
  static bool shouldCheckNow();
  static void performCheck();
  static bool fetchManifest(String& latestVersion, bool& updateAvailable, String& binUrl);
  static bool installFromUrl(const String& url);
  static bool isHttpsUrl(const String& url);
  static bool isNewerVersion(const String& currentVersion, const String& latestVersion);
  static bool parseVersionTriplet(const String& s, int& major, int& minor, int& patch);
  static void scheduleNext(unsigned long msFromNow);
  static void log(const String& msg);

private:
  static String _baseUrl;
  static String _fwVersion;

  static bool _started;
  static bool _busy;
  static bool _forceCheck;
  static bool _bootCheckDone;

  static unsigned long _nextCheckMs;
  static unsigned long _lastAttemptMs;

  static const unsigned long CHECK_INTERVAL_MS;
  static const unsigned long RETRY_AFTER_FAIL_MS;
  static const unsigned long BOOT_DELAY_MS;
};