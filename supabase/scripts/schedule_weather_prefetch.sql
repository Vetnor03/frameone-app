-- Install after the Weather prefetch API has reached production and
-- FORECAST_PREFETCH_SECRET is installed in Vercel (production).
-- Supabase Vault must contain an identical 'weather_prefetch_secret'.
-- One lightweight backend-only invocation every five minutes. The endpoint
-- skips all Open-Meteo calls when cached forecasts are less than 2h40m old.
select cron.schedule(
  're_mind_weather_prefetch',
  '*/5 * * * *',
  $job$
    select net.http_get(
      url := 'https://re-mind.no/api/cron/weather-prefetch',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'weather_prefetch_secret')
      ),
      timeout_milliseconds := 55000
    );
  $job$
);
