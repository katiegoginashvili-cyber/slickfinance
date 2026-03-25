-- ============================================================
-- Add timezone to user_preferences for correct reminder scheduling
-- ============================================================

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

-- ============================================================
-- Update trigger to convert reminder_time from user's local
-- timezone to UTC before scheduling the cron job
-- ============================================================

CREATE OR REPLACE FUNCTION public.schedule_subscription_reminder()
RETURNS trigger AS $$
DECLARE
  job_name     text;
  remind_date  date;
  remind_hour  int;
  remind_min   int;
  cron_expr    text;
  user_tz      text;
  utc_time     timestamptz;
BEGIN
  -- If reminders are disabled or subscription is not active, just clean up
  IF NOT new.reminder_enabled OR new.status NOT IN ('active', 'trial') THEN
    BEGIN
      PERFORM cron.unschedule('reminder_' || new.id::text);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RETURN new;
  END IF;

  job_name := 'reminder_' || new.id::text;

  -- Calculate the reminder date
  remind_date := new.next_charge_date - coalesce(new.reminder_days_before, 1);

  -- Skip if reminder date is in the past
  IF remind_date < current_date THEN
    RETURN new;
  END IF;

  -- Get user's timezone (fall back to UTC)
  SELECT coalesce(p.timezone, 'UTC') INTO user_tz
    FROM public.user_preferences p
   WHERE p.user_id = new.user_id;

  IF user_tz IS NULL THEN
    user_tz := 'UTC';
  END IF;

  -- Convert local reminder time → UTC
  utc_time := (remind_date || ' ' || coalesce(new.reminder_time, '09:00'))::timestamp
              AT TIME ZONE user_tz
              AT TIME ZONE 'UTC';

  remind_hour := extract(hour FROM utc_time)::int;
  remind_min  := extract(minute FROM utc_time)::int;

  -- Handle date shift (e.g. 01:00 Asia/Tbilisi → 21:00 UTC previous day)
  remind_date := utc_time::date;

  -- Skip if the UTC reminder time is now in the past
  IF utc_time < now() THEN
    RETURN new;
  END IF;

  -- Remove existing job if any (reschedule scenario)
  BEGIN
    PERFORM cron.unschedule(job_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Build one-shot cron expression: minute hour day month *
  cron_expr := remind_min || ' ' || remind_hour || ' ' ||
               extract(day FROM remind_date)::int || ' ' ||
               extract(month FROM remind_date)::int || ' *';

  -- Schedule the one-shot cron job
  PERFORM cron.schedule(
    job_name,
    cron_expr,
    format(
      $cron$SELECT net.http_post(
        url := 'https://wwlbrmlshwgxchibtjhp.supabase.co/functions/v1/send-single-reminder',
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{"subscription_id":"%s"}'::jsonb
      )$cron$,
      new.id::text
    )
  );

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
