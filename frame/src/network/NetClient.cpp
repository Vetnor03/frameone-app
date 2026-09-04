#include "NetClient.h"
#include "WiFiManager.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <esp_wifi.h>

namespace {
  static const uint32_t HTTP_TIMEOUT_MS = 15000;
  static const int MAX_RETRIES = 3;
  static const int TRANSPORT_FAILURES_BEFORE_WIFI_RESET = 2;
  static int g_lastContentLength = -1;
  static int g_consecutiveTransportFailures = 0;

  String sanitizedPath(const String& url) {
    int pathStart = url.indexOf("://");
    pathStart = pathStart >= 0 ? url.indexOf('/', pathStart + 3) : 0;
    if (pathStart < 0) return String("/");
    int pathEnd = url.indexOf('?', pathStart);
    if (pathEnd < 0) pathEnd = url.indexOf('#', pathStart);
    return pathEnd < 0 ? url.substring(pathStart) : url.substring(pathStart, pathEnd);
  }

  bool recoverWifiTransport(const char* reason) {
    wifi_ps_type_t previousPowerSave = WIFI_PS_MIN_MODEM;
    const bool havePreviousPowerSave = esp_wifi_get_ps(&previousPowerSave) == ESP_OK;

    Serial.print("NetClient transport recovery reason=");
    Serial.print(reason);
    Serial.print(" wifi_status=");
    Serial.print((int)WiFi.status());
    Serial.print(" failures=");
    Serial.println(g_consecutiveTransportFailures);

    // A station can remain WL_CONNECTED while lwIP/TLS is no longer able to
    // open sockets. Turning Wi-Fi fully off tears down the stale TCP state;
    // our own saved credentials are kept separately by WiFiManagerV2.
    WiFi.disconnect(true, false);
    delay(250);

    const bool connected = WiFiManagerV2::connectSaved(12000);
    if (connected && havePreviousPowerSave) {
      esp_wifi_set_ps(previousPowerSave);
    }

    // Start a fresh failure window after an explicit transport reset so one
    // outage cannot trigger a reconnect loop on every following attempt.
    g_consecutiveTransportFailures = 0;

    Serial.print("NetClient transport recovery result=");
    Serial.print(connected ? "connected" : "failed");
    Serial.print(" wifi_status=");
    Serial.println((int)WiFi.status());
    return connected;
  }

  void noteTransportFailure(const char* stage, const String& path, int code) {
    g_consecutiveTransportFailures++;
    String errorText = code < 0 ? HTTPClient::errorToString(code) : String("n/a");
    Serial.print("NetClient transport failure stage=");
    Serial.print(stage);
    Serial.print(" path=");
    Serial.print(path);
    Serial.print(" code=");
    Serial.print(code);
    Serial.print(" error=");
    Serial.print(errorText);
    Serial.print(" count=");
    Serial.print(g_consecutiveTransportFailures);
    Serial.print(" wifi_status=");
    Serial.println((int)WiFi.status());

    if (g_consecutiveTransportFailures >= TRANSPORT_FAILURES_BEFORE_WIFI_RESET) {
      recoverWifiTransport("consecutive-http-transport-failures");
    }
  }

  bool doRequestWithRetry(
    const String& url,
    const String* bearerToken,
    const char* method,
    const String* jsonBody,
    int& httpCodeOut,
    String& bodyOut
  ) {
    httpCodeOut = 0;
    bodyOut = "";
    g_lastContentLength = -1;
    const String path = sanitizedPath(url);

    for (int attempt = 1; attempt <= MAX_RETRIES; ++attempt) {
      const uint32_t requestStartedAtMs = millis();
      if (WiFi.status() != WL_CONNECTED) {
        if (!recoverWifiTransport("wifi-not-connected")) {
          delay(300 * attempt);
          continue;
        }
      }

      WiFiClientSecure client;
      client.setInsecure();

      HTTPClient http;
      http.setTimeout(HTTP_TIMEOUT_MS);
      http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);

      if (!http.begin(client, url)) {
        noteTransportFailure("begin", path, 0);
        delay(300 * attempt);
        continue;
      }

      // This HTTPClient is intentionally short-lived. Its default keep-alive
      // header is harmful here because the local client is destroyed after the
      // request, making the ESP32 actively close every supposedly reusable TCP
      // connection and accumulate TIME_WAIT sockets. Ask the server to close
      // instead of advertising a connection we cannot actually reuse.
      http.setReuse(false);

      // Vercel may otherwise Brotli-compress and chunk JSON responses. Identity
      // plus the API's Content-Length lets HTTPClient reserve the String once.
      http.addHeader("Accept-Encoding", "identity");

      if (bearerToken && bearerToken->length() > 0) {
        http.addHeader("Authorization", "Bearer " + *bearerToken);
      }

      if (strcmp(method, "POST") == 0) {
        http.addHeader("Content-Type", "application/json");
        httpCodeOut = http.POST(jsonBody ? *jsonBody : String("{}"));
      } else {
        httpCodeOut = http.GET();
      }

      if (httpCodeOut > 0) {
        // Any real HTTP response proves the transport recovered, regardless of
        // whether the application-level status itself is successful.
        g_consecutiveTransportFailures = 0;
        g_lastContentLength = http.getSize();
        bodyOut = http.getString();
        http.end();

        // Do not retry auth failures
        if (httpCodeOut == 401 || httpCodeOut == 403) {
          return false;
        }

        // Accept all 2xx, even if body is empty
        if (httpCodeOut >= 200 && httpCodeOut < 300) {
          Serial.printf(
            "NetClient timing method=%s path=%s status=%d elapsed_ms=%lu body_bytes=%u content_length=%d\n",
            method,
            path.c_str(),
            httpCodeOut,
            (unsigned long)(millis() - requestStartedAtMs),
            (unsigned int)bodyOut.length(),
            g_lastContentLength
          );
          if (bodyOut.length() == 0) {
            Serial.printf(
              "NetClient empty body path=%s free_heap=%u max_alloc=%u\n",
              path.c_str(),
              (unsigned int)ESP.getFreeHeap(),
              (unsigned int)ESP.getMaxAllocHeap()
            );
          }
          return true;
        }
      } else {
        bodyOut = "";
        http.end();
        noteTransportFailure("request", path, httpCodeOut);
      }

      delay(300 * attempt);
    }

    return false;
  }
}

bool NetClient::httpGet(const String& url, int& httpCodeOut, String& bodyOut) {
  return doRequestWithRetry(url, nullptr, "GET", nullptr, httpCodeOut, bodyOut);
}

bool NetClient::httpGetAuth(const String& url, const String& bearerToken, int& httpCodeOut, String& bodyOut) {
  return doRequestWithRetry(url, &bearerToken, "GET", nullptr, httpCodeOut, bodyOut);
}

bool NetClient::httpPostAuth(const String& url, const String& bearerToken, int& httpCodeOut, String& bodyOut) {
  return doRequestWithRetry(url, &bearerToken, "POST", nullptr, httpCodeOut, bodyOut);
}

bool NetClient::httpPostAuthJson(const String& url, const String& bearerToken, const String& jsonBody, int& httpCodeOut, String& bodyOut) {
  return doRequestWithRetry(url, &bearerToken, "POST", &jsonBody, httpCodeOut, bodyOut);
}

int NetClient::lastContentLength() {
  return g_lastContentLength;
}
