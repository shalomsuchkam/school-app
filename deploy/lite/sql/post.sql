-- Runs as postgres after the app migrations, on every install/deploy (idempotent).
--
-- 20261014 schedules 'app-tick' against app_fn_url (the public URL). Locally the tick goes straight from pg_net to
-- the function container on the internal docker network: no TLS, no Caddy, works in maintenance mode, and can never
-- reach the cloud. cron.schedule with an existing job name replaces that job.
select cron.schedule('app-tick', '*/5 * * * *', $job$
  select net.http_post(
    url := 'http://functions:8000/functions/v1/app/tick',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-key', (select value from public.app_secrets where key = 'app_cron_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
$job$);

-- Belt and braces: no job of ours may call a Supabase Cloud host.
select cron.unschedule(jobid) from cron.job where command ilike '%supabase.co%';

-- PostgREST reloads its schema cache after DDL
notify pgrst, 'reload schema';
