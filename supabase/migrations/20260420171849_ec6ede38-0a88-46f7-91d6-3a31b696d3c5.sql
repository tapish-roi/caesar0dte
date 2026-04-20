-- =========================================================
-- TRADING JOURNAL — PHASE 1 SCHEMA
-- =========================================================

-- ---------- strategies ----------
CREATE TABLE public.strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  r_amount numeric(14,2),
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX idx_strategies_user ON public.strategies(user_id);

ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own strategies"
ON public.strategies FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Mentors can view student strategies"
ON public.strategies FOR SELECT
USING (public.is_community_member(user_id, auth.uid()));

CREATE TRIGGER strategies_updated_at
BEFORE UPDATE ON public.strategies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- user_tags ----------
CREATE TABLE public.user_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX idx_user_tags_user ON public.user_tags(user_id);

ALTER TABLE public.user_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own tags"
ON public.user_tags FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Mentors can view student tags"
ON public.user_tags FOR SELECT
USING (public.is_community_member(user_id, auth.uid()));

-- ---------- trades ----------
CREATE TABLE public.trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,                               -- always the student
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('long','short')),
  quantity numeric(18,6) NOT NULL,
  entry_price numeric(18,6),
  exit_price numeric(18,6),
  entry_date timestamptz,
  exit_date timestamptz,
  net_pnl numeric(18,2),
  commission numeric(18,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','expired','cancelled')),
  tags text[] NOT NULL DEFAULT '{}',
  strategy_id uuid REFERENCES public.strategies(id) ON DELETE SET NULL,
  images text[] NOT NULL DEFAULT '{}',
  notes text,
  is_demo boolean NOT NULL DEFAULT false,

  -- options fields
  option_strategy text,                                -- e.g. 'vertical', 'iron_condor', 'straddle', 'single'
  option_legs jsonb,                                   -- array of legs
  strike numeric(18,6),
  expiry_date date,
  group_key text,                                      -- OPT|underlying|type|strike|expiry|direction

  -- mentor-only fields
  mentor_rating int CHECK (mentor_rating BETWEEN 1 AND 5),
  mentor_notes text,

  -- soft delete
  deleted_at timestamptz,

  -- import provenance
  import_source text,                                  -- 'manual' | 'ibkr' | etc.
  import_batch_id uuid,
  external_id text,                                    -- broker trade id, for de-dup

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, import_source, external_id)
);

CREATE INDEX idx_trades_user_active ON public.trades(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_trades_user_deleted ON public.trades(user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_trades_symbol ON public.trades(user_id, symbol);
CREATE INDEX idx_trades_entry_date ON public.trades(user_id, entry_date);
CREATE INDEX idx_trades_exit_date ON public.trades(user_id, exit_date);
CREATE INDEX idx_trades_strategy ON public.trades(strategy_id);
CREATE INDEX idx_trades_group_key ON public.trades(user_id, group_key) WHERE group_key IS NOT NULL;
CREATE INDEX idx_trades_tags ON public.trades USING GIN (tags);

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- Students: full control over own trades
CREATE POLICY "Students view own trades"
ON public.trades FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Students insert own trades"
ON public.trades FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students update own trades"
ON public.trades FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students delete own trades"
ON public.trades FOR DELETE
USING (auth.uid() = user_id);

-- Mentors: read-only on their community students' trades
CREATE POLICY "Mentors view student trades"
ON public.trades FOR SELECT
USING (
  auth.uid() <> user_id
  AND public.is_community_member(user_id, auth.uid())
);

-- Mentors: update ONLY mentor_rating + mentor_notes (enforced by trigger below)
CREATE POLICY "Mentors update mentor fields only"
ON public.trades FOR UPDATE
USING (
  auth.uid() <> user_id
  AND public.is_community_member(user_id, auth.uid())
)
WITH CHECK (
  auth.uid() <> user_id
  AND public.is_community_member(user_id, auth.uid())
);

-- Trigger to enforce mentor column-restriction
CREATE OR REPLACE FUNCTION public.enforce_trade_mentor_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If the editor is the trade owner, allow anything (their own RLS already permitted it)
  IF auth.uid() = OLD.user_id THEN
    RETURN NEW;
  END IF;

  -- Otherwise this is a mentor edit — only mentor_rating / mentor_notes may change
  IF NEW.user_id            IS DISTINCT FROM OLD.user_id            OR
     NEW.symbol             IS DISTINCT FROM OLD.symbol             OR
     NEW.side               IS DISTINCT FROM OLD.side               OR
     NEW.quantity           IS DISTINCT FROM OLD.quantity           OR
     NEW.entry_price        IS DISTINCT FROM OLD.entry_price        OR
     NEW.exit_price         IS DISTINCT FROM OLD.exit_price         OR
     NEW.entry_date         IS DISTINCT FROM OLD.entry_date         OR
     NEW.exit_date          IS DISTINCT FROM OLD.exit_date          OR
     NEW.net_pnl            IS DISTINCT FROM OLD.net_pnl            OR
     NEW.commission         IS DISTINCT FROM OLD.commission         OR
     NEW.status             IS DISTINCT FROM OLD.status             OR
     NEW.tags               IS DISTINCT FROM OLD.tags               OR
     NEW.strategy_id        IS DISTINCT FROM OLD.strategy_id        OR
     NEW.images             IS DISTINCT FROM OLD.images             OR
     NEW.notes              IS DISTINCT FROM OLD.notes              OR
     NEW.is_demo            IS DISTINCT FROM OLD.is_demo            OR
     NEW.option_strategy    IS DISTINCT FROM OLD.option_strategy    OR
     NEW.option_legs        IS DISTINCT FROM OLD.option_legs        OR
     NEW.strike             IS DISTINCT FROM OLD.strike             OR
     NEW.expiry_date        IS DISTINCT FROM OLD.expiry_date        OR
     NEW.group_key          IS DISTINCT FROM OLD.group_key          OR
     NEW.deleted_at         IS DISTINCT FROM OLD.deleted_at         OR
     NEW.import_source      IS DISTINCT FROM OLD.import_source      OR
     NEW.import_batch_id    IS DISTINCT FROM OLD.import_batch_id    OR
     NEW.external_id        IS DISTINCT FROM OLD.external_id
  THEN
    RAISE EXCEPTION 'Mentors may only update mentor_rating and mentor_notes';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trades_enforce_mentor_scope
BEFORE UPDATE ON public.trades
FOR EACH ROW EXECUTE FUNCTION public.enforce_trade_mentor_update_scope();

CREATE TRIGGER trades_updated_at
BEFORE UPDATE ON public.trades
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-purge soft-deleted trades older than 30 days (runs on any trade write — cheap & no cron needed)
CREATE OR REPLACE FUNCTION public.purge_old_deleted_trades()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.trades
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '30 days';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trades_purge_old
AFTER INSERT OR UPDATE OR DELETE ON public.trades
FOR EACH STATEMENT EXECUTE FUNCTION public.purge_old_deleted_trades();

-- ---------- stock_atr_data ----------
CREATE TABLE public.stock_atr_data (
  ticker text PRIMARY KEY,
  price numeric(18,6),
  atr numeric(18,6),
  date date NOT NULL DEFAULT current_date,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_atr_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read atr cache"
ON public.stock_atr_data FOR SELECT
TO authenticated
USING (true);

-- (Inserts/updates handled by edge function via service role only — no client-side write policy needed)

-- ---------- storage policies on lesson-assets for trade-images ----------
-- Path layout: trade-images/{user_id}/{filename}
-- Owner = student. Mentors of that student can read.

CREATE POLICY "Students upload own trade images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'lesson-assets'
  AND (storage.foldername(name))[1] = 'trade-images'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Students update own trade images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'lesson-assets'
  AND (storage.foldername(name))[1] = 'trade-images'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Students delete own trade images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'lesson-assets'
  AND (storage.foldername(name))[1] = 'trade-images'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Owner and mentors view trade images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'lesson-assets'
  AND (storage.foldername(name))[1] = 'trade-images'
  AND (
    (storage.foldername(name))[2] = auth.uid()::text
    OR public.is_community_member(((storage.foldername(name))[2])::uuid, auth.uid())
  )
);
