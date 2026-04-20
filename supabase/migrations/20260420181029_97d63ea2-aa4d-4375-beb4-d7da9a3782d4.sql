-- 1. Add mentor_id column to trades (optional cache field)
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS mentor_id uuid;

-- 2. Performance indexes
CREATE INDEX IF NOT EXISTS idx_trades_user_deleted
  ON public.trades (user_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_trades_user_entry
  ON public.trades (user_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_trades_user_strategy
  ON public.trades (user_id, strategy_id);

-- 3. Unique constraint on user_tags (case-insensitive per user)
CREATE UNIQUE INDEX IF NOT EXISTS user_tags_user_name_unique
  ON public.user_tags (user_id, lower(name));

-- 4. Security-definer snapshot function for mentor read access
CREATE OR REPLACE FUNCTION public._get_trade_snapshot(_trade_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  trade_owner uuid;
BEGIN
  SELECT user_id INTO trade_owner FROM public.trades WHERE id = _trade_id;
  IF trade_owner IS NULL THEN
    RETURN NULL;
  END IF;

  -- Allow if caller is the owner OR a mentor of that owner
  IF auth.uid() = trade_owner
     OR public.is_community_member(trade_owner, auth.uid()) THEN
    SELECT to_jsonb(t.*) INTO result FROM public.trades t WHERE t.id = _trade_id;
    RETURN result;
  END IF;

  RETURN NULL;
END;
$$;

-- 5. Storage bucket for trade screenshots (private, per-user folder)
INSERT INTO storage.buckets (id, name, public)
VALUES ('trade-images', 'trade-images', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users CRUD only their own folder (path: {user_id}/...)
DROP POLICY IF EXISTS "Users can view own trade images" ON storage.objects;
CREATE POLICY "Users can view own trade images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'trade-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can upload own trade images" ON storage.objects;
CREATE POLICY "Users can upload own trade images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'trade-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Users can delete own trade images" ON storage.objects;
CREATE POLICY "Users can delete own trade images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'trade-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Mentors can also view trade images of their community students
DROP POLICY IF EXISTS "Mentors can view student trade images" ON storage.objects;
CREATE POLICY "Mentors can view student trade images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'trade-images'
  AND public.is_community_member(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);