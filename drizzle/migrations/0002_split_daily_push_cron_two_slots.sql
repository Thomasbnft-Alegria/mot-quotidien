DO $$
DECLARE cmd text;
BEGIN
  SELECT command INTO cmd FROM cron.job WHERE jobname = 'mot_quotidien_daily_push';
  IF cmd IS NULL THEN
    RAISE EXCEPTION 'job mot_quotidien_daily_push introuvable';
  END IF;
  PERFORM cron.schedule('mot_quotidien_daily_push_u10', '30 10 * * *', cmd);
  PERFORM cron.schedule('mot_quotidien_daily_push_u11', '30 11 * * *', cmd);
  PERFORM cron.unschedule('mot_quotidien_daily_push');
END
$$;