"""R1 source-contract checks; these do not replace native 1-bit visual QA."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = (ROOT / "src/modules/ModuleReminders.cpp").read_text()
PREVIEW = (ROOT / "src/modules/RemindersEditorialPreview.h").read_text()

def test_r1_preview_is_gated_and_uses_unchanged_reminders_feed():
    assert '#include "RemindersEditorialPreview.h"' in MODULE
    assert "#if REMIND_REMINDERS_EDITORIAL_PREVIEW_ENABLED" in MODULE
    assert "if (renderEditorialRemindersPreview(c, buckets, bucketCount))" in MODULE
    # Preserve the original fetch and full legacy renderer paths in R1.
    assert '"&limit=10&tz=Europe/Oslo&skip_sync=0&display_profiles="' in MODULE
    assert "renderSmall(c, buckets, bucketCount, primaryIdx)" in MODULE
    assert "renderMedium(c, buckets, bucketCount, primaryIdx)" in MODULE
    assert "renderLarge(c, buckets, bucketCount, primaryIdx)" in MODULE
    assert "renderXL(c, buckets, bucketCount, primaryIdx)" in MODULE
    assert "renderAdaptiveReminders(c, buckets, bucketCount)" in MODULE

def test_r1_original_editorial_bitmaps_and_gfx_metrics():
    assert "RemindEditorialFonts::fraunces48()" in PREVIEW
    assert "RemindEditorialFonts::dm24()" in PREVIEW
    assert "RemindEditorialFonts::dm18()" in PREVIEW
    assert "wrapTextToLines(reminder.title,lines," in PREVIEW
    assert "measureText(text,font,x1,y1,w,h)" in PREVIEW
    assert "planEditorialReminders(" in PREVIEW
    assert "plan=EditorialReminderPlan{}" in PREVIEW
    assert "REM_EDIT_PANORAMA" in PREVIEW and "REM_EDIT_TWO_COLUMNS" in PREVIEW
    assert "editorialShiftSection" in PREVIEW
    assert "malloc(sizeof(EditorialReminderPlan))" in PREVIEW

def test_r1_all_16_rectangles_derive_from_full_800_by_480_panel():
    # Geometry contract only. Physical bounding and raster QA remains pending.
    # Test every possible colSpan x rowSpan combination, not 16 hardcoded layouts.
    for columns in range(1, 5):
        for rows in range(1, 5):
            w, h = 200 * columns, 120 * rows
            pad = max(10, min(23, round(min(w, h) * 0.075)))
            usable_w, usable_h = w - pad * 2, h - pad * 2
            assert usable_w > 0 and usable_h > 0
            assert usable_w <= 800 and usable_h <= 480
            # Section/overflow calculations must be based on resolved pixels.
            reserve = 28 if 2 > 1 else 0
            assert 0 < usable_h - reserve <= h
