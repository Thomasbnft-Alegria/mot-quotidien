-- 1. Supprimer tous les cron jobs push existants
DO $$
DECLARE job_rec RECORD;
BEGIN
  FOR job_rec IN SELECT jobname FROM cron.job WHERE jobname LIKE 'push_%' LOOP
    BEGIN PERFORM cron.unschedule(job_rec.jobname); EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
END;
$$;

-- 2. Nouveau trigger : 1 seul job par subscription, heure UTC calculée dynamiquement
CREATE OR REPLACE FUNCTION manage_push_cron_jobs()
RETURNS TRIGGER AS $$
DECLARE
  rec        RECORD;
  job_name   TEXT;
  h_paris    INT;
  m_paris    INT;
  h_utc      INT;
  utc_offset INT;
  anon_key   CONSTANT TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrYmNzcndxemRzcHNjeWJodmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NDMyNjUsImV4cCI6MjA4NTUxOTI2NX0.IqAhbxGp8iUk0WmZK0gKAFUBgH2MM9ZNoBn5nkhvZLY';
  fn_url     CONSTANT TEXT := 'https://akbcsrwqzdspscybhvlo.supabase.co/functions/v1/send-daily-notification';
BEGIN
  rec := CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  job_name := 'push_' || rec.id::TEXT;

  BEGIN PERFORM cron.unschedule(job_name);       EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule(job_name || '_w'); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule(job_name || '_s'); EXCEPTION WHEN OTHERS THEN NULL; END;

  IF TG_OP = 'DELETE' OR NOT rec.enabled OR rec.preferred_time IS NULL THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  h_paris := EXTRACT(HOUR   FROM rec.preferred_time)::INT;
  m_paris := EXTRACT(MINUTE FROM rec.preferred_time)::INT;

  utc_offset := ROUND(
    EXTRACT(EPOCH FROM (
      (NOW() AT TIME ZONE 'Europe/Paris') - (NOW() AT TIME ZONE 'UTC')
    )) / 3600
  )::INT;
  h_utc := MOD(h_paris - utc_offset + 24, 24);

  PERFORM cron.schedule(
    job_name,
    m_paris || ' ' || h_utc || ' * * *',
    format(
      $cmd$SELECT net.http_post(url:=%L, body:='{"scheduled":true}'::jsonb, headers:=(%L)::jsonb)$cmd$,
      fn_url,
      json_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || anon_key)::text
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Job hebdomadaire pour recalculer l'heure UTC lors des changements d'heure
SELECT cron.unschedule('push_dst_update') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push_dst_update');
SELECT cron.schedule(
  'push_dst_update',
  '0 2 * * 0',
  $cmd$UPDATE push_subscriptions SET preferred_time = preferred_time WHERE enabled = true AND preferred_time IS NOT NULL$cmd$
);

-- 4. Recréer le job (1 seul désormais) pour la subscription active
UPDATE push_subscriptions
SET preferred_time = preferred_time
WHERE enabled = true AND preferred_time IS NOT NULL;