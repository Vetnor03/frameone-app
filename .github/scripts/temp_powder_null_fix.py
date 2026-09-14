from pathlib import Path
p = Path('app/api/ski/summary/route.ts')
s = p.read_text()
old = """  const resortLat = finiteNumber(resort?.forecast_lat)\n  const resortLon = finiteNumber(resort?.forecast_lon)\n  const explicitElevation = finiteNumber(resort?.top_elevation_m)\n"""
new = """  const resortLat = resort?.forecast_lat == null ? null : finiteNumber(resort.forecast_lat)\n  const resortLon = resort?.forecast_lon == null ? null : finiteNumber(resort.forecast_lon)\n  const explicitElevation = resort?.top_elevation_m == null ? null : finiteNumber(resort.top_elevation_m)\n"""
assert old in s
s = s.replace(old, new, 1)
p.write_text(s)
print('patched null altitude handling')
