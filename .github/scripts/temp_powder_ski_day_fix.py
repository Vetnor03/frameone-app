from pathlib import Path
route_path = Path('app/api/ski/summary/route.ts')
home_path = Path('app/HomePageClient.tsx')
route = route_path.read_text()
home = home_path.read_text()

old = """    const local = osloParts(time)\n    if (!local.date || local.date <= today) continue\n\n    const instant = point?.data?.instant?.details ?? {}\n"""
new = """    const local = osloParts(time)\n    if (!local.date) continue\n    // Snow from mid/late afternoon onward is mainly relevant for the next ski morning.\n    const skiDate = local.hour >= 15 ? shiftDate(local.date, 1) : local.date\n    if (skiDate <= today) continue\n\n    const instant = point?.data?.instant?.details ?? {}\n"""
assert old in route
route = route.replace(old, new, 1)
route = route.replace("const day = grouped.get(local.date) || {", "const day = grouped.get(skiDate) || {", 1)
route = route.replace("grouped.set(local.date, day)", "grouped.set(skiDate, day)", 1)

old = """                        {isNo ? 'Estimert nysnø' : 'Estimated fresh snow'}\n                        {powder.elevation_m != null ? ` · ~${formatSkiMetric(powder.elevation_m)} m` : ''}\n                        {powder.confidence === 'low' ? ` · ${isNo ? 'lav sikkerhet' : 'low confidence'}` : ''}\n"""
new = """                        {isNo ? 'Estimert nysnø' : 'Estimated fresh snow'}\n                        {powder.basis === 'resort_top' && powder.elevation_m != null ? ` · ~${formatSkiMetric(powder.elevation_m)} m` : ''}\n                        {powder.confidence === 'low' ? ` · ${isNo ? 'lav sikkerhet' : 'low confidence'}` : ''}\n"""
assert old in home
home = home.replace(old, new, 1)

route_path.write_text(route)
home_path.write_text(home)
print('patched ski-day powder accumulation')
