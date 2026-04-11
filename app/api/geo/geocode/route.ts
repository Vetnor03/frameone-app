// app/api/geo/geocode/route.ts
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function clean(s: string) {
  return String(s ?? '').trim()
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const text = clean(url.searchParams.get('text') || url.searchParams.get('q') || '')

    if (!text) {
      return NextResponse.json({ error: 'Missing ?text=' }, { status: 400 })
    }

    const apiKey = process.env.GEOAPIFY_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing GEOAPIFY_API_KEY' }, { status: 500 })
    }

    // Geoapify Geocoding API
    // We bias to Norway and Norwegian language to reduce ambiguity.
    const geocodeUrl =
      `https://api.geoapify.com/v1/geocode/search?` +
      `text=${encodeURIComponent(text)}` +
      `&lang=nb` +
      `&limit=1` +
      `&filter=countrycode:no` +
      `&format=json` +
      `&apiKey=${encodeURIComponent(apiKey)}`

    const resp = await fetch(geocodeUrl)
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      return NextResponse.json(
        { error: `Geoapify geocode failed: ${resp.status}`, details: txt || null },
        { status: 502 }
      )
    }

    const j: any = await resp.json()
    const r0 = Array.isArray(j?.results) ? j.results[0] : null
    if (!r0) {
      return NextResponse.json({ error: 'No results' }, { status: 404 })
    }

    const lat = Number(r0?.lat)
    const lon = Number(r0?.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json({ error: 'Invalid lat/lon from provider' }, { status: 502 })
    }

    const formatted = clean(r0?.formatted || r0?.address_line1 || text)

    return NextResponse.json({
      input: text,
      formatted,
      lat,
      lon,
      provider: 'geoapify',
      raw: {
        // keep tiny subset so you can debug, but not huge payload
        city: r0?.city ?? null,
        postcode: r0?.postcode ?? null,
        street: r0?.street ?? null,
        housenumber: r0?.housenumber ?? null,
        country_code: r0?.country_code ?? null,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 })
  }
}