#include "FirmwareUpdater.h"

#include <WiFi.h>
#include <HTTPClient.h>
#include <Update.h>
#include <ArduinoJson.h>
#include <WiFiClientSecure.h>

#include "DeviceIdentity.h"

// =========================
// Tunables
// =========================
const unsigned long FirmwareUpdater::CHECK_INTERVAL_MS   = 6UL * 60UL * 60UL * 1000UL; // 6h
const unsigned long FirmwareUpdater::RETRY_AFTER_FAIL_MS = 30UL * 60UL * 1000UL;       // 30m
const unsigned long FirmwareUpdater::BOOT_DELAY_MS       = 45UL * 1000UL;               // wait a bit after boot

// =========================
// Static state
// =========================
String FirmwareUpdater::_baseUrl = "";
String FirmwareUpdater::_fwVersion = "";

bool FirmwareUpdater::_started = false;
bool FirmwareUpdater::_busy = false;
bool FirmwareUpdater::_forceCheck = false;
bool FirmwareUpdater::_bootCheckDone = false;

unsigned long FirmwareUpdater::_nextCheckMs = 0;
unsigned long FirmwareUpdater::_lastAttemptMs = 0;

// =========================
// Public API
// =========================
void FirmwareUpdater::begin(const char* baseUrl, const char* fwVersion) {
  _baseUrl = baseUrl ? String(baseUrl) : String("");
  _fwVersion = fwVersion ? String(fwVersion) : String("");
  _started = true;
  _busy = false;
  _forceCheck = false;
  _bootCheckDone = false;
  _lastAttemptMs = 0;

  // First boot check happens after a short delay so WiFi/time/first render can settle.
  _nextCheckMs = millis() + BOOT_DELAY_MS;

  log("begin() current FW = " + _fwVersion);
}

void FirmwareUpdater::loop() {
  if (!_started) return;
  if (_busy) return;
  if (!shouldCheckNow()) return;

  performCheck();
}

void FirmwareUpdater::requestCheckNow() {
  _forceCheck = true;
}

bool FirmwareUpdater::isBusy() {
  return _busy;
}

unsigned long FirmwareUpdater::nextCheckAtMs() {
  return _nextCheckMs;
}

// =========================
// Core
// =========================
bool FirmwareUpdater::shouldCheckNow() {
  if (!WiFi.isConnected()) return false;

  const unsigned long now = millis();

  if (_forceCheck) return true;

  // millis-safe
  if ((long)(now - _nextCheckMs) >= 0) return true;

  return false;
}

void FirmwareUpdater::performCheck() {
  _busy = true;
  _forceCheck = false;
  _lastAttemptMs = millis();

  log("checking backend for firmware...");

  String latestVersion;
  bool updateAvailable = false;
  String binUrl;

  const bool ok = fetchManifest(latestVersion, updateAvailable, binUrl);
  if (!ok) {
    log("manifest check failed");
    scheduleNext(RETRY_AFTER_FAIL_MS);
    _busy = false;
    return;
  }

  log("manifest latest_version=" + latestVersion + " update_available=" + String(updateAvailable ? "true" : "false"));

  const bool newer = isNewerVersion(_fwVersion, latestVersion);

  if (!updateAvailable || !newer || binUrl.length() == 0) {
    log("no OTA needed");
    _bootCheckDone = true;
    scheduleNext(CHECK_INTERVAL_MS);
    _busy = false;
    return;
  }

  log("OTA available -> " + binUrl);

  const bool installOk = installFromUrl(binUrl);
  if (!installOk) {
    log("OTA failed");
    scheduleNext(RETRY_AFTER_FAIL_MS);
    _busy = false;
    return;
  }

  // installFromUrl() should reboot on success.
  log("OTA finished but reboot did not happen");
  scheduleNext(RETRY_AFTER_FAIL_MS);
  _busy = false;
}

bool FirmwareUpdater::fetchManifest(String& latestVersion, bool& updateAvailable, String& binUrl) {
  latestVersion = "";
  updateAvailable = false;
  binUrl = "";

  if (_baseUrl.length() == 0) {
    log("baseUrl empty");
    return false;
  }

  if (_fwVersion.length() == 0) {
    log("fwVersion empty");
    return false;
  }

  HTTPClient http;
  WiFiClient plainClient;
  WiFiClientSecure secureClient;
  WiFiClient* rawClient = nullptr;

  String url = _baseUrl;
  if (url.endsWith("/")) url.remove(url.length() - 1);

  url += "/api/device/firmware";
  url += "?device_id=" + DeviceIdentity::getDeviceId();
  url += "&current_version=" + _fwVersion;

  log("GET " + url);

  if (isHttpsUrl(url)) {
    secureClient.setInsecure();
    rawClient = &secureClient;
  } else {
    rawClient = &plainClient;
  }

  http.setConnectTimeout(12000);
  http.setTimeout(15000);
  http.setReuse(false);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);

  if (!http.begin(*rawClient, url)) {
    log("http.begin() failed for manifest");
    return false;
  }

  http.addHeader("Accept", "application/json");
  http.addHeader("Cache-Control", "no-cache");

  const int code = http.GET();
  log("manifest HTTP code=" + String(code));

  if (code != HTTP_CODE_OK) {
    String body = http.getString();
    if (body.length() > 0) {
      log("manifest body=" + body);
    }
    http.end();
    return false;
  }

  String body = http.getString();
  http.end();

  log("manifest raw body=" + body);

  if (body.length() == 0) {
    log("manifest body empty");
    return false;
  }

  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, body);

  if (err) {
    log(String("manifest JSON parse failed: ") + err.c_str());
    return false;
  }

  latestVersion   = doc["latest_version"] | "";
  updateAvailable = doc["update_available"] | false;
  binUrl          = doc["url"] | "";

  log("manifest latest_version=" + latestVersion);
  log(String("manifest update_available=") + (updateAvailable ? "true" : "false"));
  log("manifest url=" + binUrl);

  if (latestVersion.length() == 0) {
    log("manifest missing latest_version");
    return false;
  }

  return true;
}

bool FirmwareUpdater::installFromUrl(const String& url) {
  if (url.length() == 0) return false;
  if (!WiFi.isConnected()) return false;

  HTTPClient http;
  WiFiClient* rawClient = nullptr;
  WiFiClient plainClient;
  WiFiClientSecure secureClient;

  if (isHttpsUrl(url)) {
    // Production:
    // replace setInsecure() with secureClient.setCACert(root_ca_pem)
    // once you have your CA bundle or server cert strategy in place.
    secureClient.setInsecure();
    rawClient = &secureClient;
  } else {
    rawClient = &plainClient;
  }

  http.setConnectTimeout(15000);
  http.setTimeout(30000);
  http.setReuse(false);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);

  if (!http.begin(*rawClient, url)) {
    log("http.begin() failed for bin");
    return false;
  }

  http.addHeader("Accept", "application/octet-stream");
  http.addHeader("Cache-Control", "no-cache");

  const int code = http.GET();
  if (code != HTTP_CODE_OK) {
    log("bin HTTP code=" + String(code));
    http.end();
    return false;
  }

  const int contentLength = http.getSize();
  if (contentLength <= 0) {
    log("server did not provide valid Content-Length");
    http.end();
    return false;
  }

  log("bin size=" + String(contentLength));

  // Optional safety: only update if free sketch space looks enough.
  const size_t freeSketchSpace = (ESP.getFreeSketchSpace() - 0x1000) & 0xFFFFF000;
  log("freeSketchSpace=" + String((unsigned long)freeSketchSpace));

  if ((size_t)contentLength > freeSketchSpace) {
    log("not enough OTA space");
    http.end();
    return false;
  }

  if (!Update.begin((size_t)contentLength, U_FLASH)) {
    log(String("Update.begin failed: ") + Update.errorString());
    http.end();
    return false;
  }

  Update.onProgress([](size_t done, size_t total) {
    static unsigned long lastLog = 0;
    const unsigned long now = millis();
    if (now - lastLog > 1000 || done == total) {
      lastLog = now;
      Serial.printf("[FW] OTA %u / %u (%u%%)\n",
                    (unsigned)done,
                    (unsigned)total,
                    total ? (unsigned)((done * 100U) / total) : 0U);
    }
    delay(1); // yield a bit during long flash
  });

  WiFiClient& stream = http.getStream();

  const size_t written = Update.writeStream(stream);
  if (written != (size_t)contentLength) {
    log("written != contentLength");
    log("written=" + String((unsigned long)written));
    log("expected=" + String(contentLength));
    Update.abort();
    http.end();
    return false;
  }

  if (!Update.end()) {
    log(String("Update.end failed: ") + Update.errorString());
    http.end();
    return false;
  }

  if (!Update.isFinished()) {
    log("Update not finished");
    http.end();
    return false;
  }

  http.end();

  log("OTA success, rebooting...");
  delay(500);
  ESP.restart();
  return true;
}

// =========================
// Helpers
// =========================
bool FirmwareUpdater::isHttpsUrl(const String& url) {
  return url.startsWith("https://");
}

bool FirmwareUpdater::isNewerVersion(const String& currentVersion, const String& latestVersion) {
  int cMaj = 0, cMin = 0, cPat = 0;
  int lMaj = 0, lMin = 0, lPat = 0;

  const bool cOk = parseVersionTriplet(currentVersion, cMaj, cMin, cPat);
  const bool lOk = parseVersionTriplet(latestVersion, lMaj, lMin, lPat);

  // Fallback: simple string compare if parsing fails.
  if (!cOk || !lOk) {
    return latestVersion != currentVersion;
  }

  if (lMaj != cMaj) return lMaj > cMaj;
  if (lMin != cMin) return lMin > cMin;
  return lPat > cPat;
}

bool FirmwareUpdater::parseVersionTriplet(const String& s, int& major, int& minor, int& patch) {
  major = minor = patch = 0;

  String t = s;
  t.trim();
  if (t.startsWith("v") || t.startsWith("V")) {
    t.remove(0, 1);
  }

  int firstDot = t.indexOf('.');
  if (firstDot < 0) return false;

  int secondDot = t.indexOf('.', firstDot + 1);
  if (secondDot < 0) return false;

  const String a = t.substring(0, firstDot);
  const String b = t.substring(firstDot + 1, secondDot);
  const String c = t.substring(secondDot + 1);

  if (a.length() == 0 || b.length() == 0 || c.length() == 0) return false;

  major = a.toInt();
  minor = b.toInt();
  patch = c.toInt();
  return true;
}

void FirmwareUpdater::scheduleNext(unsigned long msFromNow) {
  _nextCheckMs = millis() + msFromNow;
}

void FirmwareUpdater::log(const String& msg) {
  Serial.println("[FW] " + msg);
}