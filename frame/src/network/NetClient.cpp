#include "NetClient.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

namespace {
  static const uint32_t HTTP_TIMEOUT_MS = 15000;
  static const int MAX_RETRIES = 3;
  static int g_lastContentLength = -1;

  String sanitizedPath(const String& url) {
    int pathStart = url.indexOf("://");
    pathStart = pathStart >= 0 ? url.indexOf('/', pathStart + 3) : 0;
    if (pathStart < 0) return String("/");
    int pathEnd = url.indexOf('?', pathStart);
    if (pathEnd < 0) pathEnd = url.indexOf('#', pathStart);
    return pathEnd < 0 ? url.substring(pathStart) : url.substring(pathStart, pathEnd);
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

    for (int attempt = 1; attempt <= MAX_RETRIES; ++attempt) {
      const uint32_t requestStartedAtMs = millis();
      if (WiFi.status() != WL_CONNECTED) {
        WiFi.reconnect();
        delay(700);
      }

      WiFiClientSecure client;
      client.setInsecure();

      HTTPClient http;
      http.setTimeout(HTTP_TIMEOUT_MS);
      http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);

      if (!http.begin(client, url)) {
        delay(300 * attempt);
        continue;
      }

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
        g_lastContentLength = http.getSize();
        bodyOut = http.getString();
        http.end();

        // Do not retry auth failures
        if (httpCodeOut == 401 || httpCodeOut == 403) {
          return false;
        }

        // Accept all 2xx, even if body is empty
        if (httpCodeOut >= 200 && httpCodeOut < 300) {
          const String path = sanitizedPath(url);
          Serial.printf(
            "NetClient timing method=%s path=%s status=%d elapsed_ms=%lu\n",
            method,
            path.c_str(),
            httpCodeOut,
            (unsigned long)(millis() - requestStartedAtMs)
          );
          return true;
        }
      } else {
        bodyOut = "";
        http.end();
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
