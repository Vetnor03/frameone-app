import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { assertPublicDns, errorBackoffMinutes, normalizeContent, sha256, SUPPORTED_TYPES, validatePublicUrl } from '../_shared/radar/probe.ts'

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value))
Deno.serve(async (req) => {
  if (req.headers.get('x-monitoring-secret') !== Deno.env.get('MONITORING_WORKER_SECRET')) return new Response('Unauthorized',{status:401})
  const mode=Deno.env.get('RADAR_SOURCE_PROBE_MODE')||'off'; if (mode!=='shadow'&&mode!=='guarded') return Response.json({ok:true,mode:'off',claimed:0})
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const limit=clamp(Number(new URL(req.url).searchParams.get('limit')||Deno.env.get('RADAR_SOURCE_PROBE_BATCH_SIZE')||20),1,100)
  const {data:jobs,error}=await db.rpc('claim_monitoring_source_probe_queue',{max_count:limit,worker_id:crypto.randomUUID(),stale_after_minutes:15})
  if(error) return Response.json({ok:false,error:'claim_failed'},{status:500})
  const results=[]; for(const job of jobs||[]) results.push(await processJob(db,job,mode)); return Response.json({ok:true,mode,claimed:jobs?.length||0,results})
})
async function processJob(db:any,job:any,mode:string) {
  const started=Date.now(); const complete=(patch:Record<string,unknown>)=>db.from('monitoring_source_probe_queue').update({completed_at:new Date().toISOString(),...patch}).eq('id',job.id)
  const {data:source}=await db.from('monitoring_watch_sources').select('*,monitoring_watches(*)').eq('id',job.source_id).maybeSingle()
  const watch=source?.monitoring_watches; const {data:eligibility}=watch?await db.rpc('get_monitoring_watch_schedule_eligibility',{p_watch_id:watch.id}).maybeSingle():{data:null}
  if(!source||!watch||watch.status!=='active'||!watch.is_instant||!eligibility?.eligible||!eligibility?.use_instant_cadence||!source.is_active||!source.probe_eligible||source.disabled_reason) { await complete({last_error:'source_not_eligible'}); return {job_id:job.id,skipped:true} }
  const maxBytes=clamp(Number(Deno.env.get('RADAR_SOURCE_MAX_BYTES')||524288),1024,524288); const timeout=clamp(Number(Deno.env.get('RADAR_SOURCE_TIMEOUT_MS')||8000),1000,8000)
  let status:number|null=null,bytes=0,type:string|null=null,etag:string|null=null,lastModified:string|null=null
  try {
    let url=validatePublicUrl(source.url); let response:Response|null=null
    for(let redirects=0;redirects<=3;redirects++) {
      await assertPublicDns(url); const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeout)
      try { response=await fetch(url,{redirect:'manual',signal:controller.signal,headers:{'user-agent':'RE:MIND Radar Source Probe/1.0 (+https://remind.today)','accept':'text/html, application/json, application/rss+xml, application/atom+xml, application/xml, text/xml','if-none-match':source.etag||'','if-modified-since':source.last_modified||''}}) } finally { clearTimeout(timer) }
      if([301,302,303,307,308].includes(response.status)) { if(redirects===3) throw new Error('redirect_limit'); const location=response.headers.get('location'); if(!location) throw new Error('unsafe_redirect'); url=validatePublicUrl(new URL(location,url).toString()); continue } break
    }
    if(!response) throw new Error('fetch_failed'); status=response.status; etag=response.headers.get('etag'); lastModified=response.headers.get('last-modified'); type=response.headers.get('content-type')?.split(';')[0].toLowerCase()||null
    if(status===304) return await recordSuccess(db,job,source,{outcome:'not_modified',status,bytes,type,etag,lastModified,fingerprint:source.content_fingerprint,sourceType:source.source_type,duration:Date.now()-started})
    if(status===404||status===410) throw new Error(`permanent_http_${status}`); if(!response.ok) throw new Error(`http_${status}`)
    if(!type||!SUPPORTED_TYPES.has(type)) throw new Error('unsupported_content_type')
    const declared=Number(response.headers.get('content-length')||0); if(declared>maxBytes) throw new Error('response_too_large')
    const reader=response.body?.getReader(); const chunks:Uint8Array[]=[]
    if(reader) while(true) { const {done,value}=await reader.read(); if(done) break; bytes+=value.byteLength; if(bytes>maxBytes) { await reader.cancel(); throw new Error('response_too_large') } chunks.push(value) }
    const body=new TextDecoder().decode(concat(chunks,bytes)); const normalized=normalizeContent(body,type); const fingerprint=await sha256(normalized.normalized)
    return await recordSuccess(db,job,source,{outcome:source.content_fingerprint&&source.content_fingerprint!==fingerprint?'changed':'unchanged',status,bytes,type,etag,lastModified,fingerprint,sourceType:normalized.sourceType,duration:Date.now()-started})
  } catch(error) {
    const code=(error instanceof DOMException&&error.name==='AbortError')?'timeout':String((error as Error)?.message||'probe_error').replace(/[^a-z0-9_]/gi,'_').slice(0,80)
    const errors=source.consecutive_errors+1; const permanent=/^(permanent_http_404|permanent_http_410|unsupported_content_type|unsafe_redirect|blocked_)/.test(code); const disabled=permanent&&errors>=3?code:null
    await db.from('monitoring_source_probes').insert({source_id:source.id,watch_id:watch.id,owner_user_id:source.owner_user_id,outcome:code.startsWith('blocked_')||code==='unsafe_redirect'?'blocked':code==='unsupported_content_type'?'unsupported':'error',http_status:status,change_detected:false,etag,last_modified:lastModified,content_type:type,bytes_read:bytes,duration_ms:Date.now()-started,signal_details:{},error_code:code})
    await db.from('monitoring_watch_sources').update({last_checked_at:new Date().toISOString(),consecutive_errors:errors,next_probe_at:new Date(Date.now()+errorBackoffMinutes(errors)*60000).toISOString(),disabled_reason:disabled,is_active:disabled?false:source.is_active}).eq('id',source.id)
    await complete({last_error:code}); return {job_id:job.id,ok:false,error_code:code}
  }
}
function concat(chunks:Uint8Array[],size:number){const out=new Uint8Array(size);let p=0;for(const c of chunks){out.set(c,p);p+=c.length}return out}
async function recordSuccess(db:any,job:any,source:any,r:any) { const now=new Date().toISOString(); const baseline=!source.content_fingerprint&&r.fingerprint; const outcome=baseline?'baseline_created':r.outcome; const changed=outcome==='changed'; const {data:probe}=await db.from('monitoring_source_probes').insert({source_id:source.id,watch_id:source.watch_id,owner_user_id:source.owner_user_id,outcome,http_status:r.status,change_detected:changed,previous_fingerprint:source.content_fingerprint,new_fingerprint:r.fingerprint,etag:r.etag,last_modified:r.lastModified,content_type:r.type,bytes_read:r.bytes,duration_ms:r.duration,signal_details:{source_type:r.sourceType}}).select('id').single(); await db.from('monitoring_watch_sources').update({etag:r.etag,last_modified:r.lastModified,content_type:r.type,content_length:r.bytes,content_fingerprint:r.fingerprint,source_type:r.sourceType,last_checked_at:now,last_changed_at:changed?now:source.last_changed_at,next_probe_at:new Date(Date.now()+15*60000).toISOString(),consecutive_errors:0,disabled_reason:null}).eq('id',source.id); if(changed&&mode==='guarded'&&probe?.id){ const allow=(Deno.env.get('RADAR_TWO_STAGE_OWNER_ALLOWLIST')||'').split(',').map(v=>v.trim()).includes(source.owner_user_id); if(allow){ const {data:decision}=await db.rpc('get_guarded_watch_decision',{p_watch_id:source.watch_id,p_owner_allowlisted:true,p_discovery_hours:Number(Deno.env.get('RADAR_STRONG_SOURCE_DISCOVERY_HOURS')||12)}).maybeSingle(); if(decision?.can_gate) await db.rpc('record_guarded_source_change',{p_watch_id:source.watch_id,p_source_id:source.id,p_probe_id:probe.id,p_reason:'meaningful_fingerprint_change'}); }} await db.from('monitoring_source_probe_queue').update({completed_at:now,last_error:null}).eq('id',job.id); return {job_id:job.id,ok:true,outcome} }
