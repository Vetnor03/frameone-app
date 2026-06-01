import { NextResponse } from 'next/server'
import { APP_ICON_PATH, versionedIconPath } from '../lib/iconVersion'

export const dynamic = 'force-static'

export function GET(request: Request) {
  return NextResponse.redirect(new URL(versionedIconPath(APP_ICON_PATH), request.url), 308)
}
