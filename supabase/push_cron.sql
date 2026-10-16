-- Ianz Fitness: run the send-reminders Edge Function every 5 minutes.
-- 1) Replace PASTE_CRON_SECRET_HERE with the CRON_SECRET you saved in Edge Functions → Secrets.
-- 2) Run in Supabase → SQL Editor. Running it again replaces the schedule.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('ianz-push-reminders') where exists (select 1 from cron.job where jobname = 'ianz-push-reminders');
select cron.schedule('ianz-push-reminders', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://atpinhpsvsmgaansocse.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'PASTE_CRON_SECRET_HERE'),
    body := '{}'::jsonb
  );
$$);
