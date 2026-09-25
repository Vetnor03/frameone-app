from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INO = (ROOT / "src" / "frame_v2.5.1.ino").read_text(encoding="utf-8")
SURF_CPP = (ROOT / "src" / "modules" / "ModuleSurf.cpp").read_text(encoding="utf-8")
SURF_H = (ROOT / "src" / "modules" / "ModuleSurf.h").read_text(encoding="utf-8")
SMART_CPP = (ROOT / "src" / "core" / "SmartRefresh.cpp").read_text(encoding="utf-8")
SMART_H = (ROOT / "src" / "core" / "SmartRefresh.h").read_text(encoding="utf-8")


def test_manual_update_does_not_force_surf_source_refresh():
    start = INO.index("static bool fetchAndRenderExplicit(")
    end = INO.index("static bool refreshContentSignatureBestEffort()", start)
    body = INO[start:end]
    assert 'SmartRefresh::fetchRenderState(DeviceIdentity::getToken(), "all", desired)' in body
    assert "invalidateScheduled" not in body


def test_scheduled_work_passes_refresh_scope_and_invalidates_only_due_surf():
    assert "fetchRenderState(DeviceIdentity::getToken(), affected, desired, scheduledModules)" in INO
    assert "ModuleSurf::invalidateScheduled(scheduledModules);" in INO
    assert 'if (refreshModules.length()) url += "&refresh_modules=" + refreshModules;' in SMART_CPP
    assert 'const String& refreshModules = ""' in SMART_H


def test_local_surf_cache_has_no_independent_age_expiry():
    start = SURF_CPP.index("static void tick(int idx")
    end = SURF_CPP.index("static const char* ratingToWord", start)
    body = SURF_CPP[start:end]
    assert "bool needs = !cache.valid;" in body
    assert "cache.fetchedAtMs" not in body.split("bool needs =", 1)[1].split("if (!needs) return;", 1)[0]
    assert "invalidateScheduled(const String& modulesCsv)" in SURF_CPP
    assert "void invalidateScheduled(const String& modulesCsv);" in SURF_H
    assert '"/api/device/surf-frame?device_id="' in SURF_CPP
    assert '"/api/surf/score?"' not in SURF_CPP


def test_surf_config_floor_matches_backend_three_hour_schedule():
    assert "SURF_SOURCE_REFRESH_FLOOR_MS = 3UL * 60UL * 60UL * 1000UL" in SURF_CPP
    assert "src.refreshMs > SURF_SOURCE_REFRESH_FLOOR_MS" in SURF_CPP


def test_partial_refresh_does_not_preload_inactive_reminders():
    start = INO.index("static bool renderSmartDashboard")
    end = INO.index("static uint64_t explicitTimingRevision", start)
    body = INO[start:end]
    assert "bool remindersDirty = false;" in body
    assert "if (remindersDirty) ModuleReminders::preload();" in body
    assert "ModuleReminders::preload();\n  bool newsDirty" not in body


def test_firmware_version_remains_2_7_2():
    assert 'static const char* FW_VER = "v2.7.2";' in INO
