// app/api/device/countdowns/route.ts
// Backwards-compatible endpoint for physical frame firmware, which requests
// `/api/device/countdowns` while the app endpoint lives at `/api/device/countdown`.

export { GET, runtime } from '../countdown/route'
