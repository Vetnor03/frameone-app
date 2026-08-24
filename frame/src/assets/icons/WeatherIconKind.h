#pragma once

namespace ModuleIcons {

enum WeatherIconKind {
  WEATHER_ICON_CLEAR,
  WEATHER_ICON_PARTLY_CLOUDY,
  WEATHER_ICON_OVERCAST,
  WEATHER_ICON_RAIN,
  WEATHER_ICON_SNOW,
  WEATHER_ICON_THUNDER,
  WEATHER_ICON_SLEET,
  WEATHER_ICON_FOG,
};

inline WeatherIconKind weatherIconKindForWmo(int wmo) {
  if (wmo == 0) return WEATHER_ICON_CLEAR;
  if (wmo == 1 || wmo == 2) return WEATHER_ICON_PARTLY_CLOUDY;
  if (wmo == 3) return WEATHER_ICON_OVERCAST;
  if (wmo == 45 || wmo == 48) return WEATHER_ICON_FOG;
  if ((wmo >= 51 && wmo <= 57) || (wmo >= 61 && wmo <= 65) ||
      (wmo >= 80 && wmo <= 82)) return WEATHER_ICON_RAIN;
  if (wmo == 66 || wmo == 67) return WEATHER_ICON_SLEET;
  if ((wmo >= 71 && wmo <= 77) || wmo == 85 || wmo == 86) return WEATHER_ICON_SNOW;
  if (wmo >= 95 && wmo <= 99) return WEATHER_ICON_THUNDER;
  return WEATHER_ICON_OVERCAST;
}

} // namespace ModuleIcons
