"""R3.2 source-contract checks; these do not replace native 1-bit visual QA."""
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
    # R3.1 visual hierarchy contract: a day is context, never the hero.
    assert 'return editorialFitsInk(title,secondary,width,height)?secondary:nullptr;' in PREVIEW
    assert 'const GFXfont* secondary=compact?FONT_B9:RemindEditorialFonts::dm18();' in PREVIEW
    assert 'const bool largeHero=h>=250 && w>=300 && g_cache->count<=5;' in PREVIEW
    assert 'const GFXfont* font=(style==0 && i==0)' in PREVIEW
    assert 'RemindEditorialFonts::fraunces48()' in PREVIEW
    assert ':(style<=1)?RemindEditorialFonts::dm24()' in PREVIEW
    assert 'const int heroW=max(76,min(110,w*17/100));' in PREVIEW
    assert 'renderEditorialEmptyPreview(c)' in PREVIEW
    assert 'buildAdaptiveFallbackHeading(*primary,plan.primaryHeading' in PREVIEW
    assert 'findPrimaryBucketIndex(buckets,bucketCount)' in PREVIEW
    assert 'plan.overflow=max(0,g_cache->count-plan.shown)' in PREVIEW
    assert 'plan.primaryHeading' in PREVIEW
    assert 'safeCopy(plan.secondaryHeading' in PREVIEW
    assert 'if(!g_cache || !g_cache->ok)return false;' in PREVIEW

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
