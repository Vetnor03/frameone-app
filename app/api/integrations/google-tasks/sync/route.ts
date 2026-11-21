import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { googleTasksAllowedForUser, syncGoogleTasksFromStoredConnection } from '@/app/lib/integrations/google-tasks/server'

export const runtime = 'nodejs'
export async function POST(req: Request) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) return NextResponse.json({error:'Unauthorized'},{status:401})
  if(!googleTasksAllowedForUser(userId)) return NextResponse.json({error:'Google Tasks verification pending'},{status:403})
  try {return NextResponse.json(await syncGoogleTasksFromStoredConnection(userId))}
  catch(error) {
    console.warn('[google-tasks:sync]',error instanceof Error?error.message:'failed')
    return NextResponse.json({error:'Could not sync Google Tasks. Try reconnecting if this continues.'},{status:502})
  }
}
