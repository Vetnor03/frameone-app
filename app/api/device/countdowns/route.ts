// app/api/device/countdowns/route.ts
// Backwards-compatible endpoint for physical frame firmware, which requests
// `/api/device/countdowns` while the app endpoint lives at `/api/device/countdown`.

import { GET as getCountdown } from '../countdown/route'

export const runtime = 'nodejs'

export function GET(req: Request) {
  return getCountdown(req)
}
