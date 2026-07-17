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

-- Country intent comes from the request and the structured interpretation. The
-- vocabulary is data-driven and deliberately conservative: absence/ambiguity is NULL.
create or replace function public.infer_monitoring_country_code(p_request text,p_structured jsonb default '{}'::jsonb)
returns text language plpgsql immutable as $$
declare haystack text:=lower(concat_ws(' ',p_request,p_structured::text)); hit text; hits text[]:='{}'; country record;
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
  if haystack ~ ('(^|[^[:alnum:]])(in|within|for|available in|sale in|location|country)[ :\"'']+('||country.names||')([^[:alnum:]]|$)')
     or lower(coalesce(p_structured->>'country_code',p_structured#>>'{location,country_code}'))=country.code then
   hits:=array_append(hits,country.code);
  end if;
 end loop;
 select min(x) into hit from unnest(hits) x having count(distinct x)=1; return hit;
end $$;

create or replace function public.monitoring_source_geography_relevance(p_url text,p_domain text,p_country_code text)
returns boolean language sql immutable as $$
 select case when p_country_code is null then null
  when lower(split_part(p_domain,':',1)) ~ ('(^|\.)'||lower(p_country_code)||'$') then true
  when p_url ~* ('[/?&](country|market|locale|region|lang)='||p_country_code||'([&#-]|$)')
    or p_url ~* ('^https?://[^/]+/'||p_country_code||'([/_-][a-z]{2})?(/|$)') then true
  else false end
$$;

create or replace function public.rerank_monitoring_watch_sources(p_watch_id uuid,p_max_active integer default 3)
returns integer language plpgsql security definer set search_path=public as $$
declare country text; n integer;
begin
 select public.infer_monitoring_country_code(w.original_request,w.search_guidance) into country from public.monitoring_watches w where w.id=p_watch_id;
 update public.monitoring_watch_sources s set geography_country_code=country,
  geography_relevant=public.monitoring_source_geography_relevance(s.normalized_url,s.domain,country) where s.watch_id=p_watch_id;
 with ranked as (
  select id,row_number() over(order by
   case when country is null then 0 when geography_relevant then 0 else 1 end,
   probe_priority,case source_role when 'exact_url' then 0 when 'official' then 1 when 'product' then 2 when 'stable_detail' then 3 when 'listing' then 4 else 9 end,
   selected_count desc,seen_count desc,normalized_url,id) rn
  from public.monitoring_watch_sources where watch_id=p_watch_id and probe_eligible and disabled_reason is null)
 update public.monitoring_watch_sources s set is_active=r.rn<=greatest(1,least(p_max_active,3)),next_probe_at=coalesce(s.next_probe_at,now()) from ranked r where s.id=r.id;
 update public.monitoring_watch_sources set is_active=false where watch_id=p_watch_id and (not probe_eligible or disabled_reason is not null);
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
      seen_count=k.seen_count+s.seen_count,selected_count=k.selected_count+s.selected_count,
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
 select public.infer_monitoring_country_code(w.original_request,w.search_guidance) is null or s.geography_relevant is true
$$;

create or replace function public.get_guarded_watch_decision(p_watch_id uuid,p_owner_allowlisted boolean,p_discovery_hours integer default 12)
returns table(can_gate boolean,reason text,discovery_due boolean,signal_id uuid) language plpgsql security definer set search_path=public as $$
declare w public.monitoring_watches; e record; active_count int; strong_count int; healthy_count int; relevant_healthy int; sig uuid; country text;
begin
 select * into w from public.monitoring_watches where id=p_watch_id;
 if not found or not p_owner_allowlisted then return query select false,'owner_not_allowlisted',false,null::uuid; return; end if;
 select * into e from public.get_monitoring_watch_schedule_eligibility(p_watch_id);
 if not e.eligible or not e.use_instant_cadence or w.status<>'active' or not w.monitoring_enabled then return query select false,'watch_not_entitled',false,null::uuid; return; end if;
 country:=public.infer_monitoring_country_code(w.original_request,w.search_guidance);
 select count(*),count(*) filter(where public.is_guarded_strong_source(s)),
  count(*) filter(where public.is_guarded_strong_source(s) and s.content_fingerprint is not null and s.last_checked_at>=now()-interval '45 minutes' and s.consecutive_errors=0),
  count(*) filter(where public.is_guarded_strong_source(s) and s.content_fingerprint is not null and s.last_checked_at>=now()-interval '45 minutes' and s.consecutive_errors=0 and (country is null or s.geography_relevant is true))
 into active_count,strong_count,healthy_count,relevant_healthy from public.monitoring_watch_sources s where s.watch_id=p_watch_id and s.is_active;
 select id into sig from public.monitoring_source_change_signals where watch_id=p_watch_id and consumed_at is null order by detected_at limit 1;
 if active_count=0 then return query select false,'missing_sources',true,sig; return; end if;
 if strong_count=0 or healthy_count=0 then return query select false,'sources_missing_stale_or_failing',true,sig; return; end if;
 -- Reuse the established fail-open reason so both the guarded scheduler and source
 -- worker enqueue safety_fallback without requiring a rollout-mode change.
 if country is not null and relevant_healthy=0 then return query select false,'eligibility_uncertain',true,sig; return; end if;
 return query select true,case when sig is null then 'healthy_sources_unchanged' else 'source_change_pending' end,
  coalesce(w.last_full_discovery_at<now()-make_interval(hours=>greatest(1,p_discovery_hours)),true),sig;
end $$;

-- Extend the existing service-only backfill with repair, geography and promotion.
create or replace function public.backfill_monitoring_watch_sources(p_watch_id uuid default null) returns integer language plpgsql security definer set search_path=public as $$
declare w public.monitoring_watches; discovered jsonb; selected jsonb; total integer:=0;
begin
 total:=public.renormalize_monitoring_watch_sources(p_watch_id);
 for w in select * from public.monitoring_watches where p_watch_id is null or id=p_watch_id loop
  select coalesce(jsonb_agg(x),'[]') into discovered from (select jsonb_array_elements(coalesce(r.discovered_sources,'[]')) x from public.monitoring_runs r where r.watch_id=w.id union all select jsonb_array_elements(coalesce(u.grounded_sources,'[]')) from public.monitoring_updates u where u.watch_id=w.id) q;
  select coalesce(jsonb_agg(x),'[]') into selected from (select jsonb_array_elements(coalesce(u.grounded_sources,'[]')) x from public.monitoring_updates u where u.watch_id=w.id) q;
  total:=total+public.register_monitoring_watch_sources(w.id,discovered||selected,selected,w.original_request,3);
  update public.monitoring_watch_sources s set source_role='stable_detail' where s.watch_id=w.id and s.source_role='unknown' and public.is_stable_grounded_detail(s);
  perform public.rerank_monitoring_watch_sources(w.id,3);
 end loop; return total;
end $$;

revoke execute on function public.normalize_monitoring_source_url(text),public.infer_monitoring_country_code(text,jsonb),public.monitoring_source_geography_relevance(text,text,text),public.is_monitoring_source_geographically_relevant(public.monitoring_watch_sources,public.monitoring_watches),public.rerank_monitoring_watch_sources(uuid,integer),public.renormalize_monitoring_watch_sources(uuid),public.get_guarded_watch_decision(uuid,boolean,integer),public.backfill_monitoring_watch_sources(uuid) from public,anon,authenticated;
grant execute on function public.rerank_monitoring_watch_sources(uuid,integer),public.renormalize_monitoring_watch_sources(uuid),public.get_guarded_watch_decision(uuid,boolean,integer),public.backfill_monitoring_watch_sources(uuid) to service_role;

notify pgrst,'reload schema';
