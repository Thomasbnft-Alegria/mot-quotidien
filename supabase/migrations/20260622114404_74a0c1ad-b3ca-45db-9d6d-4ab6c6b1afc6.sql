-- Nettoyage des cron jobs push orphelins
DO $$
DECLARE
  job_rec RECORD;
BEGIN
  FOR job_rec IN SELECT jobname FROM cron.job WHERE jobname LIKE 'push_%' LOOP
    BEGIN
      PERFORM cron.unschedule(job_rec.jobname);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END;
$$;

-- Recréer les jobs uniquement pour la subscription active
UPDATE push_subscriptions
SET preferred_time = preferred_time
WHERE enabled = true
  AND preferred_time IS NOT NULL;