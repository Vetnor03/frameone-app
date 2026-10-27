"""Visual-only editorial Date ensemble using original F1 GFX glyph bitmaps.

Botanical SVG is a composition study, NOT e-paper bitmap/firmware artwork.
"""
def draw_editorial(plan, facts, fonts, glyph_paths, bbox_markup, render_calendar):
    pieces=[]
    for key in ("year","month","day","weekday"):
        area=plan["boxes"][key]
        pieces.append(glyph_paths(plan["text"][key],fonts[plan["fonts"][key]],
                                  area["x"],area["y"],"#191919"))
        pieces.append(bbox_markup(area,"#a88470" if key=="day" else "#78909b"))
    rule=plan["ornaments"]["monthRule"]
    mid=rule["x"]+rule["w"]//2
    y=rule["y"]
    pieces.append(f'<path d="M{rule["x"]},{y}H{mid-14} M{mid+14},{y}H{rule["x"]+rule["w"]}" '
                  'stroke="#777" stroke-width="1" fill="none"/>')
    pieces.append(f'<path d="M{mid},{y-5}l5,5 -5,5 -5,-5z" '
                  'stroke="#555" stroke-width="0.8" fill="none"/>')
    art=plan["illustration"]
    if art is not None:
        a=art["rect"]
        pieces.append(
            f'<g transform="translate({a["x"]},{a["y"]}) '
            f'scale({a["w"]/84:.5f},{a["h"]/88:.5f})" '
            'fill="none" stroke="#222" stroke-width="1.2" '
            'stroke-linecap="round" stroke-linejoin="round">'
            '<path d="M41 87 C39 71 45 57 40 44 C35 31 34 19 29 10"/>'
            '<path d="M40 59 C28 51 20 43 13 31 M41 52 C54 46 59 35 60 23 '
            'M40 42 C29 38 22 32 17 19 M38 32 C48 25 51 15 52 8"/>'
            '<path d="M27 48 C16 49 8 44 7 33 C18 30 27 37 27 48 Z"/>'
            '<path d="M48 42 C58 41 67 34 67 24 C57 23 49 31 48 42 Z"/>'
            '<path d="M31 31 C21 32 14 24 13 16 C23 14 31 20 31 31 Z"/>'
            '<path d="M43 25 C51 23 57 16 57 7 C49 8 43 15 43 25 Z"/>'
            '<path d="M44 67 C55 66 61 59 62 50 C52 49 45 55 44 67 Z"/>'
            '</g>')
        pieces.append(bbox_markup(a,"#84937b"))
    cal=plan["calendar"]
    pieces.append(render_calendar(cal,(facts["year"],facts["month0"]+1,facts["day"]),
                                   set(),fonts))
    pieces.append(bbox_markup(cal["rect"],"#849984"))
    return "".join(pieces)
