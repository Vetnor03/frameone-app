import { NextResponse } from 'next/server'
import { syncAllWasteUsers } from '@/app/lib/integrations/waste/server'
export const runtime = 'nodejs'
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try { return NextResponse.json(await syncAllWasteUsers()) }
  catch { return NextResponse.json({ error: 'Waste sync could not start.' }, { status: 500 }) }
}
