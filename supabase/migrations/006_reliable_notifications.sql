-- ============================================================
-- 006: Reliable notification system
-- Replaces per-subscription cron jobs with a single periodic cron
-- that runs every 5 minutes, adds failure logging, and tracks
-- whether a reminder was already sent for the current billing period.
-- ============================================================

-- ── 1. Add tracking flag to subscriptions ──
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS reminder_sent_for_period boolean NOT NULL DEFAULT false;

-- Reset the flag whenever next_charge_date changes (subscription renews)
CREATE OR REPLACE FUNCTION public.reset_reminder_sent_flag()
RETURNS trigger AS $$
BEGIN
  IF NEW.next_charge_date IS DISTINCT FROM OLD.next_charge_date THEN
    NEW.reminder_sent_for_period := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reset_reminder_sent_on_renewal ON public.subscriptions;
CREATE TRIGGER reset_reminder_sent_on_renewal
  BEFORE UPDATE OF next_charge_date ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_reminder_sent_flag();

-- Also reset when reminder settings change so user gets a new notification
CREATE OR REPLACE FUNCTION public.reset_reminder_on_settings_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.reminder_days_before IS DISTINCT FROM OLD.reminder_days_before
     OR NEW.reminder_time IS DISTINCT FROM OLD.reminder_time
     OR (NEW.reminder_enabled = true AND OLD.reminder_enabled = false)
  THEN
    NEW.reminder_sent_for_period := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reset_reminder_on_settings ON public.subscriptions;
CREATE TRIGGER reset_reminder_on_settings
  BEFORE UPDATE OF reminder_days_before, reminder_time, reminder_enabled
  ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_reminder_on_settings_change();

-- New subscriptions start with flag = false (default)

-- ── 2. Notification log (dead letter queue + audit) ──
CREATE TABLE IF NOT EXISTS public.notification_log (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id uuid        REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  user_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  token           text,
  ticket_id       text,
  status          text        NOT NULL, -- 'sent', 'send_failed', 'receipt_error', 'no_device_token'
  error_message   text,
  error_details   text,
  payload         text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  retry_count     int         NOT NULL DEFAULT 0,
  resolved        boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_notification_log_status
  ON public.notification_log(status) WHERE NOT resolved;
CREATE INDEX IF NOT EXISTS idx_notification_log_created
  ON public.notification_log(created_at);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write this table
CREATE POLICY "Service role full access on notification_log"
  ON public.notification_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 3. Drop old per-subscription cron triggers ──
DROP TRIGGER IF EXISTS schedule_reminder_on_change ON public.subscriptions;
DROP TRIGGER IF EXISTS unschedule_reminder_on_delete ON public.subscriptions;

-- Clean up any existing per-subscription cron jobs
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT jobname FROM cron.job WHERE jobname LIKE 'reminder_%'
  LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- ── 4. Schedule the new periodic cron (every 5 minutes) ──
-- First, unschedule old daily cron if it exists
DO $$
BEGIN
  PERFORM cron.unschedule('send-push-reminders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('send-reminders-periodic');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'send-reminders-periodic',
  '*/5 * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://wwlbrmlshwgxchibtjhp.supabase.co/functions/v1/send-reminders',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    )
  $cron$
);

-- ── 5. Retry cron: check failed notifications every 30 minutes ──
DO $$
BEGIN
  PERFORM cron.unschedule('retry-failed-notifications');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'retry-failed-notifications',
  '*/30 * * * *',
  $cron$
    UPDATE public.subscriptions
    SET reminder_sent_for_period = false
    WHERE id IN (
      SELECT DISTINCT subscription_id
      FROM public.notification_log
      WHERE status = 'send_failed'
        AND NOT resolved
        AND retry_count < 3
        AND created_at > now() - interval '24 hours'
    );
    UPDATE public.notification_log
    SET retry_count = retry_count + 1,
        resolved = CASE WHEN retry_count >= 2 THEN true ELSE false END
    WHERE status = 'send_failed'
      AND NOT resolved
      AND retry_count < 3
      AND created_at > now() - interval '24 hours';
  $cron$
);
