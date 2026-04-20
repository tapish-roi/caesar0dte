-- Per-user calculator settings: persists shared account-level inputs across devices
CREATE TABLE public.user_calculator_settings (
  user_id UUID NOT NULL PRIMARY KEY,
  account_size NUMERIC NOT NULL DEFAULT 100000 CHECK (account_size > 0),
  risk_amount NUMERIC NOT NULL DEFAULT 1000 CHECK (risk_amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_calculator_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own calc settings"
  ON public.user_calculator_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own calc settings"
  ON public.user_calculator_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own calc settings"
  ON public.user_calculator_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_user_calculator_settings_updated_at
  BEFORE UPDATE ON public.user_calculator_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();