import { createRemindIconImageResponse } from '../lib/remindIconImage'

export const dynamic = 'force-static'

export function GET() {
  return createRemindIconImageResponse(512)
}
