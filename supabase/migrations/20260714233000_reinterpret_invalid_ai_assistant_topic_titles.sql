-- Queue existing AI Assistant Watches whose stored title is not a safe short topic header.
-- This intentionally does not derive replacement titles in SQL; the existing GPT interpretation worker regenerates them.
-- Idempotent: enqueue_ai_assistant_interpretation upserts the single open queue row per Watch.

create or replace function public.ai_assistant_has_valid_topic_title(p_title text)
returns boolean language sql immutable as $$
  select coalesce(
    p_title is not null
    and btrim(p_title) <> ''
    and btrim(p_title) ~ '[[:alnum:]]'
    and btrim(p_title) !~* '(https?://|www\.)'
    and btrim(p_title) !~ '[?!.:;()\[\]{}][[:space:]]*$'
    and array_length(regexp_split_to_array(btrim(p_title), '\s+'), 1) between 1 and 3
    and btrim(p_title) !~* '^(hva|hvor|når|hvordan|skjer|gi|finn|følg|følge|varsle|beskjed|si|what|where|when|how|find|follow|update|tell|notify|watch|monitor|track|alert|is|are|can|will)(\s|$)'
    and not exists (
      select 1
      from unnest(regexp_split_to_array(lower(btrim(p_title)), '\s+')) as word
      where regexp_replace(word, '^[^[:alnum:]]+|[^[:alnum:]]+$', '', 'g') in (
        'hva','hvor','når','hvordan','skjer','finn','følg','følge','oppdatering','oppdateringer','nyheter','assistent',
        'what','where','when','how','find','follow','update','updates','news','watch','monitoring','monitor','track','alert','assistant'
      )
    ),
    false
  );
$$;

with invalid_watches as (
  select id, owner_user_id, original_request
  from public.monitoring_watches
  where status in ('active', 'error')
    and not public.ai_assistant_has_valid_topic_title(title)
)
select public.enqueue_ai_assistant_interpretation(id, owner_user_id, original_request, now())
from invalid_watches;

update public.monitoring_watches
set interpretation_status = 'pending', interpretation_error = null
where status in ('active', 'error')
  and not public.ai_assistant_has_valid_topic_title(title);
