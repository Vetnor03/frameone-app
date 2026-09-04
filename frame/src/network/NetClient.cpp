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

  // Keep one TLS/HTTP session alive while the frame is awake. All firmware API
  // calls are synchronous and target the same backend, so this avoids creating
  // a fresh TCP PCB for every probe/config/module/status request. HTTPClient's
  // normal HTTP/1.1 keep-alive path can therefore actually reuse the socket.
  static WiFiClientSecure g_tlsClient;
  static HTTPClient g_http;
  static bool g_httpConfigured = false;

  String sanitizedPath(const String& url) {
    int pathStart = url.indexOf("://");
    pathStart = pathStart >= 0 ? url.indexOf('/', pathStart + 3) : 0;
    if (pathStart < 0) return String("/");
    int pathEnd = url.indexOf('?', pathStart);
    if (pathEnd < 0) pathEnd = url.indexOf('#', pathStart);
    return pathEnd < 0 ? url.substring(pathStart) : url.substring(pathStart, pathEnd);
  }

  void configureHttpSession() {
    if (g_httpConfigured) return;
    g_tlsClient.setInsecure();
    g_http.setTimeout(HTTP_TIMEOUT_MS);
    g_http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    g_http.setReuse(true);
    g_httpConfigured = true;
  }

  void closeHttpSession() {
    // end() clears request/header state. Because reuse is enabled it can leave
    // a healthy connection open, so explicitly stop the transport when we are
    // recovering from a broken or truncated exchange.
    g_http.end();
    g_tlsClient.stop();
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

    closeHttpSession();

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
    configureHttpSession();

    for (int attempt = 1; attempt <= MAX_RETRIES; ++attempt) {
      const uint32_t requestStartedAtMs = millis();
      if (WiFi.status() != WL_CONNECTED) {
        if (!recoverWifiTransport("wifi-not-connected")) {
          delay(300 * attempt);
          continue;
        }
      }

      // Re-begin on every request to update the URI while retaining the same
      // underlying keep-alive TLS connection when the host stays unchanged.
      if (!g_http.begin(g_tlsClient, url)) {
        closeHttpSession();
        noteTransportFailure("begin", path, 0);
        delay(300 * attempt);
        continue;
      }

      // Vercel may otherwise Brotli-compress and chunk JSON responses. Identity
      // plus the API's Content-Length lets HTTPClient reserve the String once.
      g_http.addHeader("Accept-Encoding", "identity");

      if (bearerToken && bearerToken->length() > 0) {
        g_http.addHeader("Authorization", "Bearer " + *bearerToken);
      }

      if (strcmp(method, "POST") == 0) {
        g_http.addHeader("Content-Type", "application/json");
        httpCodeOut = g_http.POST(jsonBody ? *jsonBody : String("{}"));
      } else {
        httpCodeOut = g_http.GET();
      }

      if (httpCodeOut > 0) {
        g_lastContentLength = g_http.getSize();
        bodyOut = g_http.getString();
        g_http.end();

        // A positive Content-Length is an explicit promise from the server. A
        // shorter String means TLS closed or reading failed before the payload
        // was drained. Never report that as a successful 2xx response: reset
        // this session and retry on a fresh connection instead.
        if (g_lastContentLength > 0 &&
            bodyOut.length() != (size_t)g_lastContentLength) {
          Serial.print("NetClient incomplete body path=");
          Serial.print(path);
          Serial.print(" expected=");
          Serial.print(g_lastContentLength);
          Serial.print(" actual=");
          Serial.print(bodyOut.length());
          Serial.print(" free_heap=");
          Serial.print((unsigned int)ESP.getFreeHeap());
          Serial.print(" max_alloc=");
          Serial.println((unsigned int)ESP.getMaxAllocHeap());

          closeHttpSession();
          bodyOut = "";
          httpCodeOut = HTTPC_ERROR_CONNECTION_LOST;
          noteTransportFailure("body", path, httpCodeOut);
          delay(300 * attempt);
          continue;
        }

        // Any complete HTTP response proves the transport recovered, regardless
        // of whether the application-level status itself is successful.
        g_consecutiveTransportFailures = 0;

        // Do not retry auth failures.
        if (httpCodeOut == 401 || httpCodeOut == 403) {
          return false;
        }

        // Accept all complete 2xx responses, including legitimate empty bodies.
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
        g_http.end();
        closeHttpSession();
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
