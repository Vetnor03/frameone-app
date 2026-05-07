// ===============================
// FrameConfig.cpp (FULL FILE)
// ===============================
#include "FrameConfig.h"
#include "Config.h"
#include "NetClient.h"
#include "DeviceIdentity.h"

#include <ArduinoJson.h>
#include <string.h>

static LayoutKey parseLayout(const String& s) {
  if (s == "default") return LAYOUT_DEFAULT;
  if (s == "pyramid") return LAYOUT_PYRAMID;
  if (s == "square")  return LAYOUT_SQUARE;
  if (s == "full")    return LAYOUT_FULL;
  return LAYOUT_DEFAULT;
}

static ThemeKey parseTheme(const String& s) {
  if (s == "light") return THEME_LIGHT;
  return THEME_DARK;
}

static size_t frameConfigJsonCapacity(size_t bodyLen) {
  size_t cap = bodyLen + 2048;
  if (cap < 8192) cap = 8192;
  if (cap > 32768) cap = 32768;
  return cap;
}

// Parse "YYYY-MM-DD" into integers.
static bool parseIsoDate(const char* iso, uint16_t& y, uint8_t& m, uint8_t& d) {
  if (!iso) return false;
  if (strlen(iso) != 10) return false;
  if (iso[4] != '-' || iso[7] != '-') return false;

  for (int i = 0; i < 10; i++) {
    if (i == 4 || i == 7) continue;
    if (iso[i] < '0' || iso[i] > '9') return false;
  }

  y = (uint16_t)((iso[0]-'0')*1000 + (iso[1]-'0')*100 + (iso[2]-'0')*10 + (iso[3]-'0'));
  m = (uint8_t)((iso[5]-'0')*10 + (iso[6]-'0'));
  d = (uint8_t)((iso[8]-'0')*10 + (iso[9]-'0'));

  if (y < 1970 || y > 2100) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;

  return true;
}

static void resetWeather(FrameConfig& out) {
  out.weatherCount = 0;
  for (int i = 0; i < 4; i++) {
    out.weather[i].id = 0;
    out.weather[i].lat = 0;
    out.weather[i].lon = 0;
    out.weather[i].label[0] = '\0';
    strlcpy(out.weather[i].units, "metric", sizeof(out.weather[i].units));
    out.weather[i].refreshMs = 600000UL;
    out.weather[i].showHiLo = true;
    out.weather[i].showCondition = true;
  }
}

static void resetSurf(FrameConfig& out) {
  out.surfCount = 0;
  for (int i = 0; i < 4; i++) {
    out.surf[i].id = 0;
    out.surf[i].spotId[0] = '\0';
    out.surf[i].spot[0] = '\0';
    out.surf[i].refreshMs = 1800000UL;
  }

  out.surfSettings.fuelPenalty = false;
  out.surfSettings.homeLat = 0.0f;
  out.surfSettings.homeLon = 0.0f;
  out.surfSettings.homeLabel[0] = '\0';
}

static void resetSoccer(FrameConfig& out) {
  out.soccerCount = 0;
  for (int i = 0; i < 4; i++) {
    out.soccer[i].id = 0;
    out.soccer[i].teamId[0] = '\0';
    out.soccer[i].teamName[0] = '\0';
    out.soccer[i].competitionId[0] = '\0';
    out.soccer[i].competitionName[0] = '\0';
    out.soccer[i].refreshMs = 1800000UL;
  }
}


static void resetGroceries(FrameConfig& out) {
  out.groceries = GroceriesModuleConfig{};
}

static bool isNorwegianLanguage(const char* language) {
  return language && (strcmp(language, "no") == 0 || strcmp(language, "nb") == 0 || strcmp(language, "nb-NO") == 0);
}

static void resetStocks(FrameConfig& out) {
  out.stocksCount = 0;
  for (int i = 0; i < 4; i++) {
    out.stocks[i].id = 0;
    out.stocks[i].symbol[0] = '\0';
    out.stocks[i].name[0] = '\0';
    strlcpy(out.stocks[i].chartRange, "day", sizeof(out.stocks[i].chartRange));
    out.stocks[i].refreshMs = 900000UL;
  }
}

namespace FrameConfigApi {

bool fetch(FrameConfig& out, const String& deviceToken) {
  // reset core
  out.layout = LAYOUT_DEFAULT;
  out.theme = THEME_DARK;

  out.assignCount = 0;
  for (int i = 0; i < 8; i++) {
    out.assigns[i].slot = 0;
    out.assigns[i].module[0] = '\0';
  }

  // reset date module config
  out.date.country[0] = 'N';
  out.date.country[1] = 'O';
  out.date.country[2] = '\0';
  out.date.holidayCount = 0;
  for (int i = 0; i < 8; i++) {
    out.date.holidays[i].year = 0;
    out.date.holidays[i].month = 0;
    out.date.holidays[i].day = 0;
    out.date.holidays[i].name[0] = '\0';
  }

  // reset weather + surf + soccer + stocks
  resetWeather(out);
  resetSurf(out);
  resetSoccer(out);
  resetStocks(out);
  resetGroceries(out);

  String url = String(BASE_URL) + "/api/device/frame-config?device_id=" + DeviceIdentity::getDeviceId();

  int code = 0;
  String body;

  bool ok = NetClient::httpGetAuth(url, deviceToken, code, body);

  if (code == 401 || code == 403) {
    Serial.println("frame-config auth failed -> clearing token");
    DeviceIdentity::clearToken();
    return false;
  }

  if (!ok || code != 200) {
    Serial.print("frame-config HTTP: ");
    Serial.println(code);
    return false;
  }

  DynamicJsonDocument doc(frameConfigJsonCapacity(body.length()));

  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.println("frame-config JSON parse failed");
    return false;
  }

  JsonObject settings = doc["settings_json"];
  if (settings.isNull()) {
    Serial.println("frame-config missing settings_json");
    return false;
  }

  // theme
  const char* themeStr = settings["theme"] | "dark";
  out.theme = parseTheme(String(themeStr));

  // layout
  const char* layoutStr = settings["layout"] | "default";
  out.layout = parseLayout(String(layoutStr));

  const char* languageStr = settings["language"] | "en";
  out.groceries.languageNo = isNorwegianLanguage(languageStr);

  // cells
  JsonArray cells = settings["cells"].as<JsonArray>();
  if (!cells.isNull()) {
    for (JsonObject c : cells) {
      if (out.assignCount >= 8) break;

      int slot = c["slot"] | -1;
      const char* module = c["module"] | "";

      if (slot < 0 || slot > 7) continue;
      if (!module || module[0] == '\0') continue;

      out.assigns[out.assignCount].slot = (uint8_t)slot;
      strlcpy(out.assigns[out.assignCount].module, module, sizeof(out.assigns[out.assignCount].module));
      out.assignCount++;
    }
  }

  // ===== modules.* =====
  JsonObject modules = settings["modules"].as<JsonObject>();
  if (!modules.isNull()) {

    // ===== modules.date =====
    JsonObject date = modules["date"].as<JsonObject>();
    if (!date.isNull()) {
      const char* country = date["country"] | "NO";
      if (country && country[0]) {
        out.date.country[0] = country[0];
        out.date.country[1] = country[1] ? country[1] : '\0';
        out.date.country[2] = '\0';
      }

      JsonArray holidays = date["holidays"].as<JsonArray>();
      if (!holidays.isNull()) {
        for (JsonObject h : holidays) {
          if (out.date.holidayCount >= 8) break;

          const char* dateStr = h["date"] | "";
          const char* nameStr = h["name"] | "";

          uint16_t yy = 0; uint8_t mm = 0; uint8_t dd = 0;
          if (!parseIsoDate(dateStr, yy, mm, dd)) continue;
          if (!nameStr || nameStr[0] == '\0') continue;

          HolidayItem& dst = out.date.holidays[out.date.holidayCount];
          dst.year = yy;
          dst.month = mm;
          dst.day = dd;
          strlcpy(dst.name, nameStr, sizeof(dst.name));

          out.date.holidayCount++;
        }
      }
    }

    // ===== modules.weather =====
    JsonArray weatherArr = modules["weather"].as<JsonArray>();
    if (!weatherArr.isNull()) {
      for (JsonObject w : weatherArr) {
        if (out.weatherCount >= 4) break;

        int id = w["id"] | 0;
        float lat = w["lat"] | 0.0f;
        float lon = w["lon"] | 0.0f;

        if (id < 1 || id > 255) continue;
        if (lat == 0.0f || lon == 0.0f) continue;

        WeatherModuleConfig& dst = out.weather[out.weatherCount];
        dst.id = (uint8_t)id;
        dst.lat = lat;
        dst.lon = lon;

        const char* label = w["label"] | "";
        if (label && label[0]) strlcpy(dst.label, label, sizeof(dst.label));
        else dst.label[0] = '\0';

        const char* units = w["units"] | "metric";
        if (units && units[0]) strlcpy(dst.units, units, sizeof(dst.units));
        else strlcpy(dst.units, "metric", sizeof(dst.units));

        dst.refreshMs = (uint32_t)(w["refresh"] | 600000UL);
        dst.showHiLo = (bool)(w["hiLo"] | true);
        dst.showCondition = (bool)(w["cond"] | true);

        out.weatherCount++;
      }
    }

    // ===== modules.surf =====
    JsonArray surfArr = modules["surf"].as<JsonArray>();
    if (!surfArr.isNull()) {
      for (JsonObject s : surfArr) {
        if (out.surfCount >= 4) break;

        int id = s["id"] | 0;
        if (id < 1 || id > 255) continue;

        const char* spotId = s["spotId"] | "";
        const char* spot   = s["spot"]   | "";

        if ((!spotId || !spotId[0]) && (!spot || !spot[0])) continue;

        SurfModuleConfig& dst = out.surf[out.surfCount];
        dst.id = (uint8_t)id;

        if (spotId && spotId[0]) strlcpy(dst.spotId, spotId, sizeof(dst.spotId));
        else dst.spotId[0] = '\0';

        if (spot && spot[0]) strlcpy(dst.spot, spot, sizeof(dst.spot));
        else dst.spot[0] = '\0';

        dst.refreshMs = (uint32_t)(s["refresh"] | 1800000UL);

        out.surfCount++;
      }
    }

    // ===== modules.soccer =====
    JsonArray soccerArr = modules["soccer"].as<JsonArray>();
    if (!soccerArr.isNull()) {
      for (JsonObject s : soccerArr) {
        if (out.soccerCount >= 4) break;

        int id = s["id"] | 0;
        if (id < 1 || id > 255) continue;

        const char* teamId = s["teamId"] | "";
        const char* teamName = s["teamName"] | "";
        const char* competitionId = s["competitionId"] | "";
        const char* competitionName = s["competitionName"] | "";

        if ((!teamId || !teamName || !teamName[0]) && (!teamId || !teamId[0])) continue;

        SoccerModuleConfig& dst = out.soccer[out.soccerCount];
        dst.id = (uint8_t)id;

        if (teamId && teamId[0]) strlcpy(dst.teamId, teamId, sizeof(dst.teamId));
        else dst.teamId[0] = '\0';

        if (teamName && teamName[0]) strlcpy(dst.teamName, teamName, sizeof(dst.teamName));
        else dst.teamName[0] = '\0';

        if (competitionId && competitionId[0]) strlcpy(dst.competitionId, competitionId, sizeof(dst.competitionId));
        else dst.competitionId[0] = '\0';

        if (competitionName && competitionName[0]) strlcpy(dst.competitionName, competitionName, sizeof(dst.competitionName));
        else dst.competitionName[0] = '\0';

        dst.refreshMs = (uint32_t)(s["refresh"] | 1800000UL);

        out.soccerCount++;
      }
    }

    // ===== modules.stocks =====
    JsonArray stocksArr = modules["stocks"].as<JsonArray>();
    if (!stocksArr.isNull()) {
      for (JsonObject s : stocksArr) {
        if (out.stocksCount >= 4) break;

        int id = s["id"] | 0;
        if (id < 1 || id > 255) continue;

        const char* symbol = s["symbol"] | "";
        const char* name = s["name"] | "";
        const char* chartRange = s["chartRange"] | "day";

        if ((!symbol || !symbol[0]) && (!name || !name[0])) continue;

        StocksModuleConfig& dst = out.stocks[out.stocksCount];
        dst.id = (uint8_t)id;

        if (symbol && symbol[0]) strlcpy(dst.symbol, symbol, sizeof(dst.symbol));
        else dst.symbol[0] = '\0';

        if (name && name[0]) strlcpy(dst.name, name, sizeof(dst.name));
        else dst.name[0] = '\0';

        if (chartRange && chartRange[0]) strlcpy(dst.chartRange, chartRange, sizeof(dst.chartRange));
        else strlcpy(dst.chartRange, "day", sizeof(dst.chartRange));

        uint32_t refreshMs = (uint32_t)(s["refresh"] | 900000UL);
        if (refreshMs < 60000UL) refreshMs = 60000UL;
        if (refreshMs > 86400000UL) refreshMs = 86400000UL;
        dst.refreshMs = refreshMs;

        out.stocksCount++;
      }
    }


    // ===== modules.groceries + dinner planner =====
    JsonArray groceryArr = modules["groceries"].as<JsonArray>();
    if (!groceryArr.isNull()) {
      for (JsonObject item : groceryArr) {
        if (out.groceries.itemCount >= 40) break;

        const char* name = item["name"] | "";
        if (!name || !name[0]) continue;

        GroceryFrameItem& dst = out.groceries.items[out.groceries.itemCount];
        strlcpy(dst.name, name, sizeof(dst.name));
        dst.qty = max(1, (int)(item["quantity"] | 1));
        out.groceries.itemCount++;
      }
    }

    JsonVariant groceryInsights = modules["groceries_insights"]["insights"];
    if (groceryInsights.isNull()) groceryInsights = modules["groceries_insights"];
    if (groceryInsights.isNull()) groceryInsights = modules["groceries"]["insights"];

    JsonArray runningLowArr;
    if (!groceryInsights.isNull()) runningLowArr = groceryInsights["running_low"].as<JsonArray>();
    if (!runningLowArr.isNull()) {
      for (JsonObject item : runningLowArr) {
        if (out.groceries.runningLowCount >= 3) break;

        const char* name = item["name"] | "";
        if (!name || !name[0]) continue;

        const char* label = item["label"] | "";
        GroceryRunningLowFrameInsight& dst = out.groceries.runningLow[out.groceries.runningLowCount];
        strlcpy(dst.name, name, sizeof(dst.name));
        strlcpy(dst.label, label && label[0] ? label : (out.groceries.languageNo ? "Følger med" : "Watching"), sizeof(dst.label));
        out.groceries.runningLowCount++;
      }
    }

    JsonArray recipesArr;
    if (!groceryInsights.isNull()) recipesArr = groceryInsights["recipes"].as<JsonArray>();
    if (!recipesArr.isNull()) {
      for (JsonObject item : recipesArr) {
        if (out.groceries.recipeCount >= 2) break;

        const char* name = item["name"] | "";
        if (!name || !name[0]) continue;

        GroceryRecipeFrameInsight& dst = out.groceries.recipes[out.groceries.recipeCount];
        strlcpy(dst.name, name, sizeof(dst.name));

        JsonArray missingArr = item["missing"].as<JsonArray>();
        if (!missingArr.isNull()) {
          for (JsonVariant missing : missingArr) {
            if (dst.missingCount >= 2) break;
            const char* missingName = missing | "";
            if (!missingName || !missingName[0]) continue;
            strlcpy(dst.missing[dst.missingCount], missingName, sizeof(dst.missing[dst.missingCount]));
            dst.missingCount++;
          }
        }

        out.groceries.recipeCount++;
      }
    }

    JsonArray dinnerArr = modules["dinner_planner"].as<JsonArray>();
    if (dinnerArr.isNull()) dinnerArr = modules["dinnerPlanner"].as<JsonArray>();
    if (dinnerArr.isNull()) dinnerArr = settings["dinner_planner"].as<JsonArray>();
    if (dinnerArr.isNull()) dinnerArr = settings["dinnerPlanner"].as<JsonArray>();
    if (!dinnerArr.isNull()) {
      for (JsonObject item : dinnerArr) {
        if (out.groceries.dinnerCount >= 14) break;

        const char* date = item["date"] | item["day"] | item["planned_date"] | "";
        const char* title = item["title"] | item["name"] | item["dish"] | item["meal"] | "";
        if (!date || !date[0] || !title || !title[0]) continue;

        DinnerPlanFrameItem& dst = out.groceries.dinners[out.groceries.dinnerCount];
        strlcpy(dst.date, date, sizeof(dst.date));
        strlcpy(dst.title, title, sizeof(dst.title));
        out.groceries.dinnerCount++;
      }
    }

    // ===== modules.surf_settings =====
    JsonObject ss = modules["surf_settings"].as<JsonObject>();
    if (!ss.isNull()) {
      out.surfSettings.fuelPenalty = (bool)(ss["fuelPenalty"] | false);

      float hl = ss["homeLat"] | 0.0f;
      float hn = ss["homeLon"] | 0.0f;

      out.surfSettings.homeLat = hl;
      out.surfSettings.homeLon = hn;

      const char* lbl = ss["homeLabel"] | "";
      if (lbl && lbl[0]) strlcpy(out.surfSettings.homeLabel, lbl, sizeof(out.surfSettings.homeLabel));
      else out.surfSettings.homeLabel[0] = '\0';
    }
  }

  return true;
}

} // namespace FrameConfigApi
