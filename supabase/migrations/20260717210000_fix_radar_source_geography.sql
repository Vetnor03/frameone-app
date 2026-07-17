-- Phase 2 production-source repair. This migration changes neither rollout mode nor secrets.

alter table public.monitoring_watch_sources
  add column if not exists geography_relevant boolean,
  add column if not exists geography_country_code text;

-- Normalize only the path component. In particular, never run slash replacement over
-- the scheme or query (where an escaped/Unicode value and its spelling must survive).
create or replace function public.normalize_monitoring_source_url(p_url text) returns text
language plpgsql immutable strict as $$
declare u text; scheme text; authority text; remainder text; path_part text; suffix text; host text; marker integer;
begin
 u:=btrim(p_url); if u !~* '^https?://' or u ~* '^https?://[^/]*@' then return null; end if;
 scheme:=lower(substring(u from '^([a-z]+)://')); u:=regexp_replace(u,'^[a-z]+://','','i');
 authority:=split_part(regexp_replace(u,'[/?#].*$',''),'#',1);
 if authority='' then return null; end if;
 remainder:=substring(u from length(authority)+1); host:=lower(authority);
 host:=regexp_replace(host,'^www\.','','i'); host:=regexp_replace(host,':(80|443)$','','i');
 marker:=coalesce(nullif(least(coalesce(nullif(position('?' in remainder),0),2147483647),coalesce(nullif(position('#' in remainder),0),2147483647)),2147483647),length(remainder)+1);
 path_part:=left(remainder,marker-1); suffix:=substring(remainder from marker);
 path_part:=regexp_replace(path_part,'/{2,}','/','g');
 u:=scheme||'://'||host||path_part||split_part(suffix,'#',1);
 u:=regexp_replace(u,'([?&])(utm_[^=]*|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|ref_src|ref_url)=[^&]*','\1','gi');
 u:=regexp_replace(u,'[?&]+$',''); u:=replace(u,'?&','?');
 if split_part(u,'?',1) ~ '/$' then u:=regexp_replace(u,'/([?]|$)','\1'); end if;
 return left(u,2000);
end $$;

-- Country intent is tri-state. A valid structured country wins; explicit
-- availability/market phrases win over incidental origin mentions.
create or replace function public.monitoring_country_intent(p_request text,p_structured jsonb default '{}'::jsonb)
returns table(intent_state text,country_code text) language plpgsql immutable as $$
declare haystack text:=lower(concat_ws(' ',p_request,p_structured::text)); structured text:=lower(coalesce(p_structured->>'country_code',p_structured#>>'{location,country_code}')); targeted text[]:='{}'; contextual text[]:='{}'; country record;
begin
 for country in select * from (values
  ('no','norway|norge|noreg|norwegian'),('se','sweden|sverige|swedish'),('dk','denmark|danmark|danish'),
  ('fi','finland|suomi|finnish'),('de','germany|deutschland|german'),('cz','czechia|czech republic|česko|czech'),
  ('gb','united kingdom|uk|britain|british'),('us','united states|usa|american'),('ca','canada|canadian'),
  ('fr','france|french'),('es','spain|españa|spanish'),('it','italy|italia|italian'),('nl','netherlands|nederland|dutch'),
  ('be','belgium|belgië|belgique|belgian'),('at','austria|österreich|austrian'),('ch','switzerland|schweiz|suisse|swiss'),
  ('pl','poland|polska|polish'),('au','australia|australian'),('nz','new zealand'),('ie','ireland|irish'),
  ('pt','portugal|portuguese'),('jp','japan|japanese'),('kr','south korea|korea|korean')) as c(code,names)
 loop
  if structured=country.code then return query select 'resolved',country.code; return; end if;
  if haystack ~ ('(^|[^[:alnum:]])(available|availability|on sale|sale|buy|shipping|delivery|market|retailer(s)?)[^.;,]{0,24}(in|to|for)[ :"'']+('||country.names||')([^[:alnum:]]|$)') then targeted:=array_append(targeted,country.code);
  elsif haystack ~ ('(^|[^[:alnum:]])(in|within|for|location|country)[ :"'']+('||country.names||')([^[:alnum:]]|$)') then contextual:=array_append(contextual,country.code); end if;
 end loop;
 if structured<>'' then return query select 'ambiguous',null::text; return; end if;
 if cardinality(targeted)>0 then contextual:=targeted; end if;
 if cardinality(contextual)=0 then return query select 'none',null::text;
 elsif (select count(distinct x) from unnest(contextual)x)=1 then return query select 'resolved',contextual[1];
 else return query select 'ambiguous',null::text; end if;
end $$;

create or replace function public.infer_monitoring_country_code(p_request text,p_structured jsonb default '{}'::jsonb)
returns text language sql immutable as $$ select country_code from public.monitoring_country_intent(p_request,p_structured) where intent_state='resolved' $$;

create or replace function public.monitoring_source_geography_relevance(p_url text,p_domain text,p_country_code text)
returns boolean language sql immutable as $$
 select case when p_country_code is null then null
  when lower(split_part(p_domain,':',1)) ~ ('(^|\.)'||case lower(p_country_code) when 'gb' then 'uk' else lower(p_country_code) end||'$') then true
  when p_url ~* ('[?&](country|market|region)='||p_country_code||'([&#]|$)') then true
  when p_url ~* ('[?&]locale=[a-z]{2}[-_]'||p_country_code||'([&#]|$)') then true
  when p_url ~* ('^https?://[^/]+/(country|market|region)/'||p_country_code||'(/|$)') then true
  else false end
$$;

create or replace function public.rerank_monitoring_watch_sources(p_watch_id uuid,p_max_active integer default 3)
returns integer language plpgsql security definer set search_path=public as $$
declare country text; n integer;
begin
 select public.infer_monitoring_country_code(w.original_request,w.search_guidance) into country from public.monitoring_watches w where w.id=p_watch_id;
 update public.monitoring_watch_sources s set geography_country_code=country,
  geography_relevant=public.monitoring_source_geography_relevance(s.normalized_url,s.domain,country)
 where s.watch_id=p_watch_id and (s.geography_country_code,s.geography_relevant) is distinct from
  (country,public.monitoring_source_geography_relevance(s.normalized_url,s.domain,country));
 with ranked as (
  select id,row_number() over(order by
   case when country is null then 0 when geography_relevant then 0 else 1 end,
   probe_priority,case source_role when 'exact_url' then 0 when 'official' then 1 when 'product' then 2 when 'stable_detail' then 3 when 'listing' then 4 else 9 end,
   selected_count desc,seen_count desc,normalized_url,id) rn
  from public.monitoring_watch_sources where watch_id=p_watch_id and probe_eligible and disabled_reason is null)
 update public.monitoring_watch_sources s set is_active=r.rn<=greatest(1,least(p_max_active,3)),next_probe_at=coalesce(s.next_probe_at,now()) from ranked r where s.id=r.id and (s.is_active is distinct from (r.rn<=greatest(1,least(p_max_active,3))) or s.next_probe_at is null);
 update public.monitoring_watch_sources set is_active=false where watch_id=p_watch_id and (not probe_eligible or disabled_reason is not null) and is_active;
 get diagnostics n=row_count; return n;
end $$;

-- Lock one watch at a time, redirect every historical FK, then merge the source.
-- Colliding live signals are consumed rather than deleted, retaining the audit trail.
create or replace function public.renormalize_monitoring_watch_sources(p_watch_id uuid default null)
returns integer language plpgsql security definer set search_path=public as $$
declare s public.monitoring_watch_sources; keeper public.monitoring_watch_sources; norm text; repaired integer:=0; wid uuid;
begin
 for wid in select id from public.monitoring_watches where p_watch_id is null or id=p_watch_id order by id loop
  perform pg_advisory_xact_lock(hashtextextended(wid::text,20260717));
  for s in select * from public.monitoring_watch_sources where watch_id=wid order by created_at,id loop
   norm:=public.normalize_monitoring_source_url(s.url); if norm is null then continue; end if;
   select * into keeper from public.monitoring_watch_sources where watch_id=wid and normalized_url=norm and id<>s.id order by created_at,id limit 1;
   if found then
    update public.monitoring_source_change_signals set consumed_at=coalesce(consumed_at,now()) where source_id=s.id and consumed_at is null and exists(select 1 from public.monitoring_source_change_signals k where k.source_id=keeper.id and k.consumed_at is null);
    delete from public.monitoring_source_probe_queue q where q.source_id=s.id and q.completed_at is null and exists(select 1 from public.monitoring_source_probe_queue k where k.source_id=keeper.id and k.completed_at is null);
    update public.monitoring_source_probe_queue set source_id=keeper.id where source_id=s.id;
    update public.monitoring_source_probes set source_id=keeper.id where source_id=s.id;
    update public.monitoring_source_change_signals set source_id=keeper.id where source_id=s.id;
    update public.monitoring_two_stage_audit set source_id=keeper.id where source_id=s.id;
    update public.monitoring_watch_sources k set
      seen_count=greatest(k.seen_count,s.seen_count),selected_count=greatest(k.selected_count,s.selected_count),
      source_role=case least(array_position(array['exact_url','official','feed','status','product','stable_detail','listing','article','unknown'],k.source_role),array_position(array['exact_url','official','feed','status','product','stable_detail','listing','article','unknown'],s.source_role)) when 1 then 'exact_url' when 2 then 'official' when 3 then 'feed' when 4 then 'status' when 5 then 'product' when 6 then 'stable_detail' when 7 then 'listing' when 8 then 'article' else 'unknown' end,
      probe_eligible=k.probe_eligible or s.probe_eligible,is_active=k.is_active or s.is_active,probe_priority=least(k.probe_priority,s.probe_priority),
      content_fingerprint=case when s.last_checked_at>k.last_checked_at then coalesce(s.content_fingerprint,k.content_fingerprint) else coalesce(k.content_fingerprint,s.content_fingerprint) end,
      etag=coalesce(k.etag,s.etag),last_modified=coalesce(k.last_modified,s.last_modified),content_type=coalesce(k.content_type,s.content_type),content_length=coalesce(k.content_length,s.content_length),
      last_checked_at=greatest(k.last_checked_at,s.last_checked_at),last_changed_at=greatest(k.last_changed_at,s.last_changed_at),last_seen_in_ai_at=greatest(k.last_seen_in_ai_at,s.last_seen_in_ai_at),next_probe_at=least(k.next_probe_at,s.next_probe_at),
      consecutive_errors=least(k.consecutive_errors,s.consecutive_errors),disabled_reason=case when k.disabled_reason is null or s.disabled_reason is null then null else k.disabled_reason end
    where k.id=keeper.id;
    delete from public.monitoring_watch_sources where id=s.id; repaired:=repaired+1;
   elsif s.normalized_url<>norm then
    update public.monitoring_watch_sources set normalized_url=norm,domain=split_part(regexp_replace(norm,'^https?://','','i'),'/',1) where id=s.id; repaired:=repaired+1;
   end if;
  end loop;
  update public.monitoring_watch_sources x set source_role='stable_detail' where x.watch_id=wid and x.source_role='unknown' and public.is_stable_grounded_detail(x);
  perform public.rerank_monitoring_watch_sources(wid,3);
 end loop; return repaired;
end $$;

-- Geography is an additional prerequisite only when the user expressed country intent.
create or replace function public.is_monitoring_source_geographically_relevant(s public.monitoring_watch_sources,w public.monitoring_watches)
returns boolean language sql stable as $$
 select i.intent_state='none' or (i.intent_state='resolved' and s.geography_relevant is true)
 from public.monitoring_country_intent(w.original_request,w.search_guidance) i
$$;

create or replace function public.get_guarded_watch_decision(p_watch_id uuid,p_owner_allowlisted boolean,p_discovery_hours integer default 12)
returns table(can_gate boolean,reason text,discovery_due boolean,signal_id uuid) language plpgsql security definer set search_path=public as $$
declare w public.monitoring_watches; e record; active_count int; strong_count int; healthy_count int; relevant_healthy int; sig uuid; intent record;
begin
 select * into w from public.monitoring_watches where id=p_watch_id;
 if not found or not p_owner_allowlisted then return query select false,'owner_not_allowlisted',false,null::uuid; return; end if;
 select * into e from public.get_monitoring_watch_schedule_eligibility(p_watch_id);
 if not e.eligible or not e.use_instant_cadence or w.status<>'active' or not w.monitoring_enabled then return query select false,'watch_not_entitled',false,null::uuid; return; end if;
 select * into intent from public.monitoring_country_intent(w.original_request,w.search_guidance);
 select count(*),count(*) filter(where public.is_guarded_strong_source(s)),
  count(*) filter(where public.is_guarded_strong_source(s) and s.content_fingerprint is not null and s.last_checked_at>=now()-interval '45 minutes' and s.consecutive_errors=0),
  count(*) filter(where public.is_guarded_strong_source(s) and s.content_fingerprint is not null and s.last_checked_at>=now()-interval '45 minutes' and s.consecutive_errors=0 and s.geography_relevant is true)
 into active_count,strong_count,healthy_count,relevant_healthy from public.monitoring_watch_sources s where s.watch_id=p_watch_id and s.is_active;
 select id into sig from public.monitoring_source_change_signals where watch_id=p_watch_id and consumed_at is null order by detected_at limit 1;
 if active_count=0 then return query select false,'missing_sources',false,sig; return; end if;
 if strong_count=0 then return query select false,'not_strong_source_watch',false,sig; return; end if;
 if healthy_count=0 then return query select false,'sources_missing_stale_or_failing',false,sig; return; end if;
 if intent.intent_state='ambiguous' or (intent.intent_state='resolved' and relevant_healthy=0) then return query select false,'eligibility_uncertain',false,sig; return; end if;
 return query select true,'healthy_strong_sources',coalesce(w.last_full_discovery_at,'-infinity'::timestamptz)<now()-make_interval(hours=>greatest(1,least(p_discovery_hours,48))),sig;
exception when others then return query select false,'eligibility_uncertain',false,null::uuid;
end $$;

-- Normalize string/object arrays from real persisted JSON without inventing columns.
create or replace function public.monitoring_source_objects(p_urls jsonb) returns jsonb language sql immutable as $$
 select coalesce(jsonb_agg(case when jsonb_typeof(v)='string' then jsonb_build_object('url',v#>>'{}') when jsonb_typeof(v)='object' then v end) filter(where jsonb_typeof(v) in ('string','object')),'[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(p_urls)='array' then p_urls else '[]'::jsonb end) v
$$;

-- The service-only backfill recomputes distinct historical evidence and upserts
-- deterministic maxima; it never feeds history through the incrementing registry RPC.
create or replace function public.backfill_monitoring_watch_sources(p_watch_id uuid default null) returns integer language plpgsql security definer set search_path=public as $$
declare w public.monitoring_watches; h record; role text; method text; total integer:=0;
begin
 total:=public.renormalize_monitoring_watch_sources(p_watch_id);
 create temporary table if not exists monitoring_backfill_evidence(watch_id uuid,evidence_id text,url text,selected boolean) on commit drop;
 truncate monitoring_backfill_evidence;
 insert into monitoring_backfill_evidence
 select u.watch_id,'run:'||u.run_id,v->>'url',true from public.monitoring_updates u cross join lateral jsonb_array_elements(public.monitoring_source_objects(u.source_urls)) v where p_watch_id is null or u.watch_id=p_watch_id;
 insert into monitoring_backfill_evidence
 select r.watch_id,'run:'||r.id,v->>'url',is_selected from public.monitoring_runs r
 cross join lateral (values
  ('discovered_sources',public.monitoring_source_objects(r.raw_result->'discovered_sources'),false),
  ('sources',public.monitoring_source_objects(r.raw_result->'sources'),true),
  ('grounded_sources',public.monitoring_source_objects(r.raw_result->'grounded_sources'),true),
  ('normalized_returned_source_urls',public.monitoring_source_objects(r.raw_result->'normalized_returned_source_urls'),false),
  ('normalized_citation_urls',public.monitoring_source_objects(r.raw_result->'normalized_citation_urls'),true)
 ) j(kind,urls,is_selected) cross join lateral jsonb_array_elements(j.urls) v
 where (p_watch_id is null or r.watch_id=p_watch_id) and r.status in ('no_change','change','uncertain');
 for w in select * from public.monitoring_watches where p_watch_id is null or id=p_watch_id loop
  for h in select norm,min(url) url,count(distinct evidence_id) seen_count,count(distinct evidence_id) filter(where selected) selected_count
   from (select e.*,public.normalize_monitoring_source_url(e.url) norm from monitoring_backfill_evidence e where e.watch_id=w.id) x where norm is not null group by norm
  loop
   role:=case when position(h.norm in w.original_request)>0 then 'exact_url' when h.norm ~* '/(status|incidents?)(/|$)' then 'status' when h.norm ~* '/(feed|rss|atom)([./?]|$)' then 'feed' when h.norm ~* '/products?/' then 'product' when h.norm ~* '/(events?|listings?)(/|$)' then 'listing' when h.norm ~* '/(news|blog|articles?)/[^/]+$' then 'article' else 'unknown' end;
   method:=case when role='exact_url' then 'user_request' when h.selected_count>0 then 'openai_selected_source' when h.seen_count>=2 then 'repeated_source' else 'openai_search' end;
   insert into public.monitoring_watch_sources(watch_id,owner_user_id,url,normalized_url,domain,source_role,discovery_method,probe_priority,seen_count,selected_count,last_seen_in_ai_at,next_probe_at)
   values(w.id,w.owner_user_id,h.url,h.norm,split_part(regexp_replace(h.norm,'^https?://','','i'),'/',1),role,method,case role when 'exact_url' then 0 when 'feed' then 10 when 'status' then 15 when 'product' then 40 when 'listing' then 50 when 'article' then 90 else 70 end,case when role='exact_url' then greatest(1,h.seen_count) else h.seen_count end,h.selected_count,now(),now())
   on conflict(watch_id,normalized_url) do update set seen_count=case when monitoring_watch_sources.source_role='exact_url' or excluded.source_role='exact_url' then greatest(1,excluded.seen_count) else excluded.seen_count end,selected_count=excluded.selected_count,source_role=case when monitoring_watch_sources.source_role in ('exact_url','official') then monitoring_watch_sources.source_role else excluded.source_role end,discovery_method=excluded.discovery_method
   where (monitoring_watch_sources.seen_count,monitoring_watch_sources.selected_count,monitoring_watch_sources.source_role,monitoring_watch_sources.discovery_method) is distinct from (case when monitoring_watch_sources.source_role='exact_url' or excluded.source_role='exact_url' then greatest(1,excluded.seen_count) else excluded.seen_count end,excluded.selected_count,case when monitoring_watch_sources.source_role in ('exact_url','official') then monitoring_watch_sources.source_role else excluded.source_role end,excluded.discovery_method);
   total:=total+1;
  end loop;
  update public.monitoring_watch_sources set seen_count=1 where watch_id=w.id and source_role='exact_url' and seen_count<1;
  -- Correct counters first, then revoke stale promotion/eligibility before considering promotion again.
  update public.monitoring_watch_sources s set source_role='unknown' where s.watch_id=w.id and s.source_role='stable_detail' and not public.is_stable_grounded_detail(s);
  update public.monitoring_watch_sources set probe_eligible=(source_role='exact_url' or source_type in ('rss','atom','json','sitemap') or seen_count>=2 or selected_count>=2 or source_role in ('status','product','listing','official','feed')) where watch_id=w.id and disabled_reason is null and probe_eligible is distinct from (source_role='exact_url' or source_type in ('rss','atom','json','sitemap') or seen_count>=2 or selected_count>=2 or source_role in ('status','product','listing','official','feed'));
  update public.monitoring_watch_sources s set source_role='stable_detail' where s.watch_id=w.id and s.source_role='unknown' and public.is_stable_grounded_detail(s);
  perform public.rerank_monitoring_watch_sources(w.id,3);
 end loop; return total;
end $$;

revoke execute on function public.normalize_monitoring_source_url(text),public.monitoring_country_intent(text,jsonb),public.infer_monitoring_country_code(text,jsonb),public.monitoring_source_geography_relevance(text,text,text),public.monitoring_source_objects(jsonb),public.is_monitoring_source_geographically_relevant(public.monitoring_watch_sources,public.monitoring_watches),public.rerank_monitoring_watch_sources(uuid,integer),public.renormalize_monitoring_watch_sources(uuid),public.get_guarded_watch_decision(uuid,boolean,integer),public.backfill_monitoring_watch_sources(uuid) from public,anon,authenticated;
grant execute on function public.rerank_monitoring_watch_sources(uuid,integer),public.renormalize_monitoring_watch_sources(uuid),public.get_guarded_watch_decision(uuid,boolean,integer),public.backfill_monitoring_watch_sources(uuid) to service_role;

notify pgrst,'reload schema';
