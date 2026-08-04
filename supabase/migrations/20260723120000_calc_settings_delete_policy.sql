-- user_calculator_settings already has SELECT / INSERT / UPDATE policies scoped
-- to auth.uid(). Add the missing DELETE so a user can drop their own row.
DROP POLICY IF EXISTS "Users delete own calc settings" ON public.user_calculator_settings;

CREATE POLICY "Users delete own calc settings"
  ON public.user_calculator_settings FOR DELETE
  USING (auth.uid() = user_id);
