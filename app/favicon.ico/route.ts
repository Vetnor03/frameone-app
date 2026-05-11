import { NextResponse } from 'next/server'

export const dynamic = 'force-static'

export function GET(request: Request) {
  return NextResponse.redirect(new URL('/favicon.svg', request.url), 308)
}
