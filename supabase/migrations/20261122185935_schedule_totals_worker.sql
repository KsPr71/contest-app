begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Store WORKER_TOKEN as contest_totals_worker_token in Vault before applying.
-- The worker is invoked only while published photos have pending changes.
select cron.schedule('contest-publish-totals', '10 seconds', $job$
  select net.http_post(
    url := 'https://yvgynxxiddmmeblolvqt.supabase.co/functions/v1/publish-vote-totals',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-worker-token', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'contest_totals_worker_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) where exists (select 1 from private.vote_totals_pending);
$job$);
commit;
