#pragma once
#include <Arduino.h>

enum LayoutKey {
  LAYOUT_DEFAULT,
  LAYOUT_PYRAMID,
  LAYOUT_SQUARE,
  LAYOUT_FULL
};

enum ThemeKey {
  THEME_LIGHT,
  THEME_DARK
};

struct SlotModule {
  uint8_t slot = 0;
  char module[16] = {0};
};

// ===== Date module config (parsed from settings_json.modules.date) =====
struct HolidayItem {
  uint16_t year = 0;
  uint8_t month = 0; // 1..12
  uint8_t day = 0;   // 1..31
  char name[48] = {0};
};

struct DateModuleConfig {
  char country[3] = {'N','O','\0'};
  HolidayItem holidays[8];
  uint8_t holidayCount = 0;
};

// ===== Weather module config (parsed from settings_json.modules.weather[]) =====
struct WeatherModuleConfig {
  uint8_t id = 0;                 // 1..n
  float lat = 0;
  float lon = 0;

  char label[40] = {0};           // "Oslo, NO"
  char units[8] = "metric";       // "metric" or "imperial"

  uint32_t refreshMs = 600000UL;  // default 10 min
  bool showHiLo = true;
  bool showCondition = true;
};

// ===== Surf module config (parsed from settings_json.modules.surf[]) =====
// We support:
//  - spotId (ASCII stable id: "hellesto", "bore", ...)
//  - OR spot (display name, may contain æøå: "Hellestø")
// You can send either; firmware will URL-encode safely when requesting scores.
struct SurfModuleConfig {
  uint8_t id = 0;                 // 1..n (matches "surf:<id>")
  char spotId[32] = {0};          // preferred stable ASCII id (optional)
  char spot[48] = {0};            // display name (optional)
  uint32_t refreshMs = 1800000UL; // default 30 min
};

// ===== Surf global settings (parsed from settings_json.modules.surf_settings) =====
struct SurfSettingsConfig {
  bool fuelPenalty = false;
  float homeLat = 0.0f;
  float homeLon = 0.0f;
  char homeLabel[48] = {0};

  bool hasHome() const {
    return homeLat != 0.0f && homeLon != 0.0f;
  }
};

// ===== Soccer module config (parsed from settings_json.modules.soccer[]) =====
struct SoccerModuleConfig {
  uint8_t id = 0;                 // 1..n (matches "soccer:<id>")
  char teamId[32] = {0};          // football-data team id as string
  char teamName[48] = {0};        // display name
  char competitionId[16] = {0};   // optional
  char competitionName[48] = {0}; // optional
  uint32_t refreshMs = 10800000UL; // default 3h
};

// ===== Stocks module config (parsed from settings_json.modules.stocks[]) =====
struct StocksModuleConfig {
  uint8_t id = 0;                 // 1..n (matches "stocks:<id>")
  char symbol[24] = {0};          // e.g. "EQNR.OL"
  char name[48] = {0};            // e.g. "Equinor"
  uint32_t refreshMs = 900000UL;  // default 15 min
};

struct FrameConfig {
  LayoutKey layout = LAYOUT_DEFAULT;
  ThemeKey theme = THEME_DARK;

  SlotModule assigns[8];
  int assignCount = 0;

  // Parsed modules
  DateModuleConfig date;

  // Weather instances
  WeatherModuleConfig weather[4];
  uint8_t weatherCount = 0;

  // Surf instances
  SurfModuleConfig surf[4];
  uint8_t surfCount = 0;

  // Soccer instances
  SoccerModuleConfig soccer[4];
  uint8_t soccerCount = 0;

  // Stocks instances
  StocksModuleConfig stocks[4];
  uint8_t stocksCount = 0;

  // Surf global settings
  SurfSettingsConfig surfSettings;
};

namespace FrameConfigApi {
  bool fetch(FrameConfig& out, const String& deviceToken);
}
