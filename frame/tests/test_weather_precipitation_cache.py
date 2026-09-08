from pathlib import Path


def test_hourly_precipitation_replaces_daily_aggregate_before_accumulation():
    source = Path("frame/src/modules/ModuleWeather.cpp").read_text()
    reset = "if (!anyDay[di]) day.precipMm = 0.0f;"
    add = "day.precipMm += pr;"

    assert reset in source
    assert source.index(reset) < source.index(add, source.index(reset))


def test_xl_weather_renderer_does_not_draw_location_label():
    source = Path("frame/src/modules/ModuleWeather.cpp").read_text()
    large_xl = source.split("static void renderLargeXL", 1)[1].split("static void renderAdaptiveWeather", 1)[0]
    xl = large_xl.split("// XL", 1)[1]
    small = source.split("static void renderSmall", 1)[1].split("static void renderMedium", 1)[0]

    assert "getDisplayLocationName" not in xl
    assert "getDisplayLocationName" in large_xl
    assert "getDisplayLocationName" in small
