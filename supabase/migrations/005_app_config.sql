-- ============================================================
-- App configuration table for force-update and feature flags
-- ============================================================

CREATE TABLE public.app_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read config (no write from client)
CREATE POLICY "Anyone can read app_config"
  ON public.app_config FOR SELECT
  USING (true);

-- Seed minimum version
INSERT INTO public.app_config (key, value)
VALUES ('min_ios_version', '1.0.0'),
       ('min_android_version', '1.0.0');
