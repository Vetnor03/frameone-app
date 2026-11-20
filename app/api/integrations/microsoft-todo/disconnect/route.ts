import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { disconnectIntegrationForUser } from '@/app/lib/integrations/disconnect'
import { MICROSOFT_TODO_PROVIDER } from '@/app/lib/integrations/microsoft-todo/server'
export const runtime='nodejs'
export async function POST(req:Request){
  const userId=await getAuthenticatedUserId(req)
  if(!userId)return NextResponse.json({error:'Unauthorized'},{status:401})
  try{return NextResponse.json(await disconnectIntegrationForUser(userId,MICROSOFT_TODO_PROVIDER))}
  catch{return NextResponse.json({error:'Could not disconnect Microsoft To Do'},{status:500})}
}
