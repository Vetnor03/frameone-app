import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { syncMicrosoftTodoFromStoredConnection } from '@/app/lib/integrations/microsoft-todo/server'
export const runtime='nodejs'
export async function POST(req:Request){
  const userId=await getAuthenticatedUserId(req)
  if(!userId)return NextResponse.json({error:'Unauthorized'},{status:401})
  try {
    return NextResponse.json(await syncMicrosoftTodoFromStoredConnection(userId))
  }catch{
    return NextResponse.json({error:'Could not refresh Microsoft To Do tasks. Reconnect if this continues.'},{status:502})
  }
}
