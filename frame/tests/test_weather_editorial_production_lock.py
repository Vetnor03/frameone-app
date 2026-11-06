from pathlib import Path

SOURCE = Path(__file__).parents[1] / "src" / "modules" / "ModuleWeather.cpp"

def test_weather_editorial_production_lock_keeps_smart_logic():
    text = SOURCE.read_text(encoding="utf-8")
    assert 'RemindEditorialFonts.h' in text
    assert 'renderEditorialAdaptiveWeather' in text
    assert 'shouldShowTomorrowForecast(data)' in text
    assert '"I MORGEN"' in text
    assert 'const int forecastStart=useTomorrow?2:1;' in text
    assert 'data.tomorrowInsight' in text
    assert 'buildWeatherInsight(insight,sizeof(insight),data)' in text
    assert 'renderAdaptiveWeatherLegacy' in text
    assert 'weatherWindShort' in text
    assert 'snprintf(out,n,"%d m/s %s"' in text
