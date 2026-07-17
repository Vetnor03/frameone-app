-- Radar Phase 1: public source observation. Forward-only; no paid-run gating.
create table public.monitoring_watch_sources (
 id uuid primary key default gen_random_uuid(), watch_id uuid not null references public.monitoring_watches(id) on delete cascade,
 owner_user_id uuid not null references auth.users(id) on delete cascade, url text not null, normalized_url text not null, domain text not null,
 source_type text not null default 'unknown' check(source_type in ('unknown','html','rss','atom','json','sitemap')),
 source_role text not null default 'unknown' check(source_role in ('exact_url','official','listing','product','status','feed','article','unknown')),
 discovery_method text not null default 'openai_search' check(discovery_method in ('user_request','openai_search','openai_selected_source','repeated_source')),
 is_active boolean not null default false, probe_eligible boolean not null default false, probe_priority integer not null default 100,
 seen_count integer not null default 0 check(seen_count>=0), selected_count integer not null default 0 check(selected_count>=0),
 etag text, last_modified text, content_type text, content_length bigint, content_fingerprint text,
 last_checked_at timestamptz, last_changed_at timestamptz, last_seen_in_ai_at timestamptz, next_probe_at timestamptz,
 consecutive_errors integer not null default 0 check(consecutive_errors>=0), disabled_reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(watch_id,normalized_url)
);
create table public.monitoring_source_probe_queue (
 id uuid primary key default gen_random_uuid(), source_id uuid not null references public.monitoring_watch_sources(id) on delete cascade,
 watch_id uuid not null references public.monitoring_watches(id) on delete cascade, run_after timestamptz not null default now(),
 claimed_at timestamptz, claimed_by uuid, attempts integer not null default 0 check(attempts>=0), completed_at timestamptz,
 last_error text, created_at timestamptz not null default now()
);
create unique index monitoring_source_probe_one_open_idx on public.monitoring_source_probe_queue(source_id) where completed_at is null;
create index monitoring_source_probe_claim_idx on public.monitoring_source_probe_queue(run_after,created_at) where completed_at is null;
create table public.monitoring_source_probes (
 id uuid primary key default gen_random_uuid(), source_id uuid not null references public.monitoring_watch_sources(id) on delete cascade,
 watch_id uuid not null references public.monitoring_watches(id) on delete cascade, owner_user_id uuid not null references auth.users(id) on delete cascade,
 outcome text not null check(outcome in ('not_modified','unchanged','changed','unsupported','blocked','error')),
 http_status integer, change_detected boolean not null default false, previous_fingerprint text, new_fingerprint text,
 etag text, last_modified text, content_type text, bytes_read integer check(bytes_read>=0), duration_ms integer check(duration_ms>=0),
 signal_details jsonb not null default '{}'::jsonb, error_code text, checked_at timestamptz not null default now()
);
create index monitoring_source_probes_watch_checked_idx on public.monitoring_source_probes(watch_id,checked_at desc);
create index monitoring_source_probes_source_checked_idx on public.monitoring_source_probes(source_id,checked_at desc);
create trigger trg_monitoring_watch_sources_updated_at before update on public.monitoring_watch_sources for each row execute function public.set_timestamp_updated_at();

alter table public.monitoring_watch_sources enable row level security;
alter table public.monitoring_source_probe_queue enable row level security;
alter table public.monitoring_source_probes enable row level security;
create policy "Users can read accessible watch sources" on public.monitoring_watch_sources for select to authenticated using
 (exists(select 1 from public.monitoring_watches w where w.id=watch_id and public.can_access_monitoring_watch(w)));
create policy "Users can read accessible watch probes" on public.monitoring_source_probes for select to authenticated using
 (exists(select 1 from public.monitoring_watches w where w.id=watch_id and public.can_access_monitoring_watch(w)));
revoke insert,update,delete on public.monitoring_watch_sources,public.monitoring_source_probe_queue,public.monitoring_source_probes from anon,authenticated;
revoke select on public.monitoring_source_probe_queue from anon,authenticated;
grant select on public.monitoring_watch_sources,public.monitoring_source_probes to authenticated;

-- Store a URL without fragments/default ports and without common tracking keys.
create or replace function public.normalize_monitoring_source_url(p_url text) returns text language plpgsql immutable strict as $$
declare u text; scheme text; authority text; path_query text; host text;
begin
 u:=btrim(p_url); if u !~* '^https?://' or u ~* '^https?://[^/]*@' then return null; end if;
 scheme:=lower(substring(u from '^([a-z]+)://')); u:=regexp_replace(u,'^[a-z]+://','','i');
 authority:=split_part(u,'/',1); path_query:=substring(u from length(authority)+1); host:=lower(authority);
 host:=regexp_replace(host,'^www\.','','i'); host:=regexp_replace(host,':(80|443)$','','i');
 u:=scheme||'://'||host||case when path_query='' then '' else '/'||path_query end; u:=split_part(u,'#',1);
 u:=regexp_replace(u,'([?&])(utm_[^=]*|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|ref_src|ref_url)=[^&]*','\1','gi');
 u:=regexp_replace(u,'[?&]+$',''); u:=replace(u,'?&','?'); if u ~ '/$' then u:=left(u,-1); end if; return left(u,2000);
end $$;
revoke execute on function public.normalize_monitoring_source_url(text) from anon,authenticated;

-- Called once after every successful OpenAI run. Grounded and discovered URLs remain separate.
create or replace function public.register_monitoring_watch_sources(p_watch_id uuid,p_discovered jsonb,p_selected jsonb,p_original_request text,p_max_active integer default 3)
returns integer language plpgsql security definer set search_path=public as $$
declare w public.monitoring_watches; item jsonb; raw text; norm text; selected boolean; exact boolean; role text; method text; n integer:=0;
begin
 select * into w from public.monitoring_watches where id=p_watch_id; if not found then return 0; end if;
 for raw in select distinct (regexp_matches(coalesce(p_original_request,''),'https?://[^[:space:]<>"'']+','gi'))[1] loop
  norm:=public.normalize_monitoring_source_url(raw); if norm is null then continue; end if;
  insert into public.monitoring_watch_sources(watch_id,owner_user_id,url,normalized_url,domain,source_role,discovery_method,probe_eligible,probe_priority,seen_count,last_seen_in_ai_at,next_probe_at)
  values(w.id,w.owner_user_id,raw,norm,split_part(regexp_replace(norm,'^https?://','','i'),'/',1),'exact_url','user_request',true,0,1,now(),now())
  on conflict(watch_id,normalized_url) do update set last_seen_in_ai_at=now(),seen_count=monitoring_watch_sources.seen_count+1,source_role='exact_url',discovery_method='user_request',probe_eligible=true,probe_priority=0,disabled_reason=null; n:=n+1;
 end loop;
 for item in select value from jsonb_array_elements(coalesce(p_discovered,'[]')) loop
  raw:=item->>'url'; norm:=public.normalize_monitoring_source_url(raw); if norm is null then continue; end if;
  selected:=exists(select 1 from jsonb_array_elements(coalesce(p_selected,'[]')) s where public.normalize_monitoring_source_url(s->>'url')=norm);
  exact:=position(norm in coalesce(p_original_request,''))>0;
  role:=case when exact then 'exact_url' when norm ~* '/(status|incidents?)(/|$)' then 'status' when norm ~* '/(feed|rss|atom)([./?]|$)' then 'feed' when norm ~* '/(products?|events?|listings?)(/|$)' then case when norm ~* '/products?/' then 'product' else 'listing' end when norm ~* '/(news|blog|articles?)/[^/]+$' then 'article' else 'unknown' end;
  method:=case when exact then 'user_request' when selected then 'openai_selected_source' else 'openai_search' end;
  insert into public.monitoring_watch_sources(watch_id,owner_user_id,url,normalized_url,domain,source_role,discovery_method,probe_priority,seen_count,selected_count,last_seen_in_ai_at,next_probe_at)
  values(w.id,w.owner_user_id,raw,norm,split_part(regexp_replace(norm,'^https?://','','i'),'/',1),role,method,case role when 'exact_url' then 0 when 'feed' then 10 when 'status' then 15 when 'product' then 40 when 'listing' then 50 when 'article' then 90 else 70 end,1,case when selected then 1 else 0 end,now(),now())
  on conflict(watch_id,normalized_url) do update set url=excluded.url,last_seen_in_ai_at=now(),seen_count=monitoring_watch_sources.seen_count+1,selected_count=monitoring_watch_sources.selected_count+excluded.selected_count,source_role=case when monitoring_watch_sources.source_role='exact_url' then 'exact_url' else excluded.source_role end,discovery_method=case when monitoring_watch_sources.discovery_method='user_request' then 'user_request' when monitoring_watch_sources.seen_count+1>=2 then 'repeated_source' else excluded.discovery_method end;
  n:=n+1;
 end loop;
 update public.monitoring_watch_sources set probe_eligible=(source_role='exact_url' or source_type in ('rss','atom','json','sitemap') or seen_count>=2 or selected_count>=2 or source_role in ('status','product','listing','official','feed')) where watch_id=w.id and disabled_reason is null;
 with ranked as (select id,row_number() over(order by probe_priority,source_role,normalized_url,id) rn from public.monitoring_watch_sources where watch_id=w.id and probe_eligible and disabled_reason is null)
 update public.monitoring_watch_sources s set is_active=(r.rn<=greatest(1,least(p_max_active,3))),next_probe_at=coalesce(s.next_probe_at,now()) from ranked r where s.id=r.id;
 update public.monitoring_watch_sources set is_active=false where watch_id=w.id and (not probe_eligible or disabled_reason is not null);
 return n;
end $$;
revoke execute on function public.register_monitoring_watch_sources(uuid,jsonb,jsonb,text,integer) from public,anon,authenticated; grant execute on function public.register_monitoring_watch_sources(uuid,jsonb,jsonb,text,integer) to service_role;

create or replace function public.enqueue_due_monitoring_source_probes(max_count integer default 100) returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 with candidates as (
  select s.id,s.watch_id,row_number() over(partition by s.watch_id order by s.probe_priority,s.source_role,s.normalized_url,s.id) rn
  from public.monitoring_watch_sources s join public.monitoring_watches w on w.id=s.watch_id
  cross join lateral public.get_monitoring_watch_schedule_eligibility(w.id) e
  where w.status='active' and w.is_instant and e.eligible and e.use_instant_cadence and s.is_active and s.probe_eligible and s.disabled_reason is null and s.next_probe_at<=now()
 ), due as (select s.id,s.watch_id from candidates s where rn<=3 order by id limit greatest(1,least(max_count,1000))), ins as (
  insert into public.monitoring_source_probe_queue(source_id,watch_id) select id,watch_id from due on conflict do nothing returning 1)
 select count(*) into n from ins; return n;
end $$;
create or replace function public.claim_monitoring_source_probe_queue(max_count integer default 20,worker_id uuid default gen_random_uuid(),stale_after_minutes integer default 15)
returns setof public.monitoring_source_probe_queue language plpgsql security definer set search_path=public as $$
begin return query with picked as (select q.id from public.monitoring_source_probe_queue q where q.completed_at is null and q.run_after<=now() and (q.claimed_at is null or q.claimed_at<now()-make_interval(mins=>greatest(1,stale_after_minutes))) order by q.run_after,q.created_at limit greatest(1,least(max_count,100)) for update skip locked)
 update public.monitoring_source_probe_queue q set claimed_at=now(),claimed_by=worker_id,attempts=q.attempts+1 from picked where q.id=picked.id returning q.*; end $$;
revoke execute on function public.enqueue_due_monitoring_source_probes(integer),public.claim_monitoring_source_probe_queue(integer,uuid,integer) from public,anon,authenticated;
grant execute on function public.enqueue_due_monitoring_source_probes(integer),public.claim_monitoring_source_probe_queue(integer,uuid,integer) to service_role;

-- Approximately 14-day operational retention; never touches Watches, runs, or updates.
create or replace function public.prune_monitoring_source_probes(retention_days integer default 14) returns integer language plpgsql security definer set search_path=public as $$ declare n integer; begin delete from public.monitoring_source_probes where checked_at<now()-make_interval(days=>greatest(1,retention_days)); get diagnostics n=row_count; return n; end $$;
revoke execute on function public.prune_monitoring_source_probes(integer) from public,anon,authenticated; grant execute on function public.prune_monitoring_source_probes(integer) to service_role;
notify pgrst,'reload schema';
