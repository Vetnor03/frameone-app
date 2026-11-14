"""Groceries follows locked News R2.3 design without changing data behavior."""
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MODULE=(ROOT/"src/modules/ModuleGroceries.cpp").read_text()
STYLE=(ROOT/"src/modules/GroceriesNewsStyle.h").read_text()
NEWS=(ROOT/"src/modules/NewsEditorialPreview.h").read_text()

def test_news_style_live_in_legacy_and_adaptive_renderers():
    assert '#include "GroceriesNewsStyle.h"' in MODULE
    assert "groceriesNewsHeading(c,header,topPad)" in MODULE
    assert "groceriesNewsAdaptiveHeading(x,top,width,height,value)" in MODULE
    assert "groceriesNewsItem(raw,x,y,width,height,layout.horizontal,capacity)" in MODULE
    assert "groceriesNewsItem(raw,c.x+inset,listY+i*rowH" in MODULE
    assert 'case CELL_SMALL:' in MODULE
    assert 'case CELL_MEDIUM:' in MODULE
    assert 'case CELL_LARGE:' in MODULE
    assert 'case CELL_XL:' in MODULE

def test_actual_visible_count_controls_markers_not_total_cache_count():
    assert "shown>=2 && !centered" in STYLE
    assert "if (visibleCount >= 2) groceriesNewsDiamond" in MODULE
    assert "if (visibleCount >= 2) groceriesNewsDiamond" in MODULE
    assert "newsEditorialFinalizeOrnaments" in NEWS
    assert "plan.shown!=1" in NEWS
    assert "d.drawPixel(cx-dx,cy+dy,ink)" in STYLE

def test_preserve_groceries_data_and_subfeatures():
    for contract in (
        "getRotationStep4h()", "wrapIndex(rotation+i,g_cache.count)",
        "formatItem(item,raw,sizeof(raw))",
        "drawDinnerPlanList(right, rightTop)",
        "drawRunningLowList(left, leftTop)",
        "drawMealIdeasList(right, rightTop)",
        "GroceriesAdaptivePolicy::compose(input)",
        "adaptiveFutureDinner(today, i)",
        "GroceriesAdaptivePolicy::mealMissingCount(",
        '"/api/device/groceries?device_id="',
        "if (g_cache.count > capacity && listH >= overflowH)",
    ):
        assert contract in MODULE, contract

def test_only_visual_helpers_no_test_grid_or_static_assets():
    assert "CountdownImages.h" not in MODULE
    assert "drawGrid" not in STYLE
    assert "render" not in STYLE
