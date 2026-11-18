import { NextResponse } from 'next/server'
import { getAuthenticatedUserId } from '@/app/lib/integrations/spond/server'
import { safeCity, validDate, METHODS, aladhanCoordinatesUrl, normalizeAladhan } from '@/app/lib/integrations/aladhan/preview.mjs'
import { resolveNorwegianCity } from '@/app/lib/integrations/aladhan/location.mjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function osloDate() {
  const p = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Oslo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date())
  const f=(k:string)=>p.find(x=>x.type===k)?.value||''
  return f('year')+'-'+f('month')+'-'+f('day')
}
export async function GET(req:Request) {
  if(!await getAuthenticatedUserId(req))return NextResponse.json({error:'Unauthorized'},{status:401})
  const q=new URL(req.url).searchParams
  const city=safeCity(q.get('city')),date=q.get('date')||osloDate()
  const asrMethod=Number(q.get('asrMethod')) as 1 | 2,method=Number(q.get('method')),highLatitude=Number(q.get('highLatitude'))
  const chosen=Date.parse(date+'T12:00:00Z'),today=Date.parse(osloDate()+'T12:00:00Z')
  if(!city||!validDate(date)||!Number.isFinite(chosen)||Math.abs(chosen-today)>365*86400000||
     ![1,2].includes(asrMethod)||!METHODS.includes(method)||![1,2,3].includes(highLatitude))
    return NextResponse.json({error:'Choose a Norwegian city, date, Asr method and calculation options.'},{status:400})
  try {
    const location=await resolveNorwegianCity(city)
    const url=aladhanCoordinatesUrl({latitude:location.latitude,longitude:location.longitude,date,asrMethod,method,highLatitude})
    // AlAdhan asks callers to cache responses; the preview is read-only.
    const res=await fetch(url,{headers:{Accept:'application/json'},next:{revalidate:21600},signal:AbortSignal.timeout(12000)})
    if(!res.ok)throw Error('Upstream HTTP '+res.status)
    const data:unknown=await res.json()
    return NextResponse.json(normalizeAladhan(data,{city:location.name,date,asrMethod,method,coordinates:location}),{headers:{'Cache-Control':'private, no-store'}})
  } catch(error) {
    console.warn('[aladhan-preview] failed',error instanceof Error?error.message:'unknown')
    return NextResponse.json({error:'Could not verify times for this city and method. Try again or choose another city.'},{status:502})
  }
}
