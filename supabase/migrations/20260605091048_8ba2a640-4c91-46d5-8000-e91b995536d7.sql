-- ============================================================
-- Migration: Dynamic pg_cron scheduling per push subscription
-- ============================================================

CREATE OR REPLACE FUNCTION manage_push_cron_jobs()
RETURNS TRIGGER AS $$
DECLARE
  rec         RECORD;
  job_winter  TEXT;
  job_summer  TEXT;
  h_paris     INT;
  m_paris     INT;
  h_utc1      INT;
  h_utc2      INT;
  anon_key    CONSTANT TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrYmNzcndxemRzcHNjeWJodmxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5NDMyNjUsImV4cCI6MjA4NTUxOTI2NX0.IqAhbxGp8iUk0WmZK0gKAFUBgH2MM9ZNoBn5nkhvZLY';
  fn_url      CONSTANT TEXT := 'https://akbcsrwqzdspscybhvlo.supabase.co/functions/v1/send-daily-notification';
BEGIN
  rec := CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  job_winter := 'push_' || rec.id::TEXT || '_w';
  job_summer  := 'push_' || rec.id::TEXT || '_s';

  BEGIN PERFORM cron.unschedule(job_winter); EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN PERFORM cron.unschedule(job_summer); EXCEPTION WHEN OTHERS THEN NULL; END;

  IF TG_OP = 'DELETE' OR NOT rec.enabled OR rec.preferred_time IS NULL THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  h_paris := EXTRACT(HOUR   FROM rec.preferred_time)::INT;
  m_paris := EXTRACT(MINUTE FROM rec.preferred_time)::INT;
  h_utc1 := MOD(h_paris - 1 + 24, 24);
  h_utc2 := MOD(h_paris - 2 + 24, 24);

  PERFORM cron.schedule(
    job_winter,
    m_paris || ' ' || h_utc1 || ' * * *',
    format(
      $cmd$SELECT net.http_post(url:=%L, body:=(%L)::jsonb, headers:=(%L)::jsonb)$cmd$,
      fn_url,
      json_build_object('scheduled', true, 'endpoint', rec.endpoint)::text,
      json_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || anon_key)::text
    )
  );

  PERFORM cron.schedule(
    job_summer,
    m_paris || ' ' || h_utc2 || ' * * *',
    format(
      $cmd$SELECT net.http_post(url:=%L, body:=(%L)::jsonb, headers:=(%L)::jsonb)$cmd$,
      fn_url,
      json_build_object('scheduled', true, 'endpoint', rec.endpoint)::text,
      json_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || anon_key)::text
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_push_cron ON push_subscriptions;
CREATE TRIGGER trg_push_cron
  AFTER INSERT OR UPDATE OR DELETE
  ON push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION manage_push_cron_jobs();

UPDATE push_subscriptions
SET    preferred_time = preferred_time
WHERE  enabled = true AND preferred_time IS NOT NULL;
