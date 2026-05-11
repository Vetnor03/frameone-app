import { NextResponse } from 'next/server'
import { versionedIconPath } from '../lib/iconVersion'

export const dynamic = 'force-static'

export function GET(request: Request) {
  return NextResponse.redirect(new URL(versionedIconPath('/favicon.svg'), request.url), 308)
}
