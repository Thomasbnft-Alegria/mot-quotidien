-- RESET COMPLET du système de notifications

-- 1. Supprimer TOUS les cron jobs liés aux push
DO $$
DECLARE job_rec RECORD;
BEGIN
  FOR job_rec IN
    SELECT jobname FROM cron.job
    WHERE jobname LIKE 'push_%' OR jobname = 'push_dst_update' OR jobname = 'mot_quotidien_daily_push'
  LOOP
    BEGIN PERFORM cron.unschedule(job_rec.jobname); EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
END;
$$;

-- 2. Désactiver le trigger qui créait des jobs automatiquement (source du problème)
DROP TRIGGER IF EXISTS trg_push_cron ON push_subscriptions;

-- 3. UN SEUL job fixe : 10h30 UTC = 12h30 Paris (heure d'été)
SELECT cron.schedule(
  'mot_quotidien_daily_push',
  '30 10 * * *',
  $$SELECT net.http_post(
    url:='https://akbcsrwqzdspscybhvlo.supabase.co/functions/v1/send-daily-notification',
    body:='{"scheduled":true}'::jsonb,
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrYmNzcndxemRzcHNjeWJodmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NDMyNjUsImV4cCI6MjA4NTUxOTI2NX0.IqAhbxGp8iUk0WmZK0gKAFUBgH2MM9ZNoBn5nkhvZLY"}'::jsonb
  )$$
);