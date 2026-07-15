import { NextRequest, NextResponse } from 'next/server'

const EMERGENCY_REMINDERS_BYPASS_DEVICE_ID = 'frm_54AE37455F34'

export function proxy(request: NextRequest) {
  const deviceId = request.nextUrl.searchParams.get('device_id')

  if (deviceId !== EMERGENCY_REMINDERS_BYPASS_DEVICE_ID) {
    return NextResponse.next()
  }

  return NextResponse.json(
    { error: 'reminders_temporarily_unavailable' },
    {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}

export const config = {
  matcher: ['/api/device/reminders'],
}
