-- AI Follow is intentionally shelved for the pilot/release.
-- Remove its scheduled interpretation/monitoring jobs so dormant backend code
-- cannot wake or consume OpenAI/Supabase resources. Re-enabling AI Follow later
-- must recreate the desired schedules deliberately.
do $$
declare
  job record;
begin
  for job in
    select jobid
    from cron.job
    where command ilike '%/functions/v1/interpret-ai-assistant%'
       or command ilike '%/functions/v1/monitoring-worker%'
       or command ilike '%/functions/v1/monitoring-scheduler%'
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end
$$;
