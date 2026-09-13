import { NextResponse } from 'next/server'

const MET_USER_AGENT = 'RE:MIND Ski/1.0 https://re-mind.no'

function finiteNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function roundCoordinate(value: number) {
  return Math.round(value * 10_000) / 10_000
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const latitude = Number(searchParams.get('lat'))
  const longitude = Number(searchParams.get('lon'))
  const label = String(searchParams.get('label') || '').trim().slice(0, 120)

  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return NextResponse.json({ error: 'invalid_coordinates' }, { status: 400 })
  }

  const lat = roundCoordinate(latitude)
  const lon = roundCoordinate(longitude)
  const metUrl = new URL('https://api.met.no/weatherapi/locationforecast/2.0/compact')
  metUrl.searchParams.set('lat', String(lat))
  metUrl.searchParams.set('lon', String(lon))

  let response: Response
  try {
    response = await fetch(metUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': MET_USER_AGENT,
      },
      next: { revalidate: 600 },
    })
  } catch {
    return NextResponse.json({ error: 'met_request_failed' }, { status: 502 })
  }

  if (!response.ok) {
    return NextResponse.json({ error: 'met_request_failed' }, { status: 502 })
  }

  const payload = await response.json().catch(() => null)
  const point = Array.isArray(payload?.properties?.timeseries) ? payload.properties.timeseries[0] : null

  if (!point) {
    return NextResponse.json({ error: 'met_data_unavailable' }, { status: 502 })
  }

  const instant = point?.data?.instant?.details ?? {}
  const nextHour = point?.data?.next_1_hours?.details ?? {}

  return NextResponse.json({
    location: { label, lat, lon },
    generated_at: new Date().toISOString(),
    current: {
      temp_c: finiteNumber(instant.air_temperature),
      wind_mps: finiteNumber(instant.wind_speed),
      wind_dir_deg: finiteNumber(instant.wind_from_direction),
      gust_mps: finiteNumber(instant.wind_speed_of_gust),
      precipitation_1h_mm: finiteNumber(nextHour.precipitation_amount),
    },
  })
}
