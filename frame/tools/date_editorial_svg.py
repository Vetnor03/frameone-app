"""Visual-only original-GFX editorial Date ensemble.

Native-shared one-pixel botanical strokes are a software *study*, not an
actual GxEPD2 framebuffer or physical e-paper rendering.
"""
from date_botanical_1bit import render_ink_botanical
def draw_editorial(plan, facts, fonts, glyph_paths, bbox_markup, render_calendar):
    pieces=[]
    for key in ("year","month","day","weekday"):
        area=plan["boxes"][key]
        pieces.append(glyph_paths(plan["text"][key],fonts[plan["fonts"][key]],
                                  area["x"],area["y"],"#191919"))
        pieces.append(bbox_markup(area,"#a88470" if key=="day" else "#78909b"))
    rule=plan["ornaments"]["monthRule"]
    if rule is not None:
        mid=rule["x"]+rule["w"]//2
        y=rule["y"]
        pieces.append(f'<path d="M{rule["x"]},{y}H{mid-14} M{mid+14},{y}H{rule["x"]+rule["w"]}" '
                      'stroke="#777" stroke-width="1" fill="none"/>')
        pieces.append(f'<path d="M{mid},{y-5}l5,5 -5,5 -5,-5z" '
                      'stroke="#555" stroke-width="0.8" fill="none"/>')
    art=plan["illustration"]
    if art is not None:
        a=art["rect"]
        pieces.append(render_ink_botanical(a))
        pieces.append(bbox_markup(a,"#84937b"))
    cal=plan["calendar"]
    pieces.append(render_calendar(cal,(facts["year"],facts["month0"]+1,facts["day"]),
                                   set(),fonts))
    pieces.append(bbox_markup(cal["rect"],"#849984"))
    return "".join(pieces)
