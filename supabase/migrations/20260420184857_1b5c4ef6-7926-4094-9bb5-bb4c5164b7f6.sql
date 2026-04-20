-- Reshape stock_atr_data to match new ATR module spec
-- Existing columns: ticker, date, price, atr, fetched_at  (PK: ticker,date)
-- New columns:      ticker, data_date, close_price, atr, created_at, updated_at  (id PK + unique(ticker,data_date))

-- 1. Add the new columns (nullable first so we can backfill)
ALTER TABLE public.stock_atr_data
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS data_date date,
  ADD COLUMN IF NOT EXISTS close_price numeric,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. Backfill from old columns
UPDATE public.stock_atr_data
SET data_date = COALESCE(data_date, date),
    close_price = COALESCE(close_price, price),
    updated_at = COALESCE(updated_at, fetched_at);

-- 3. Drop the old composite PK (ticker, date) so we can promote id to PK
ALTER TABLE public.stock_atr_data DROP CONSTRAINT IF EXISTS stock_atr_data_pkey;

-- 4. Make required columns NOT NULL
ALTER TABLE public.stock_atr_data
  ALTER COLUMN data_date SET NOT NULL,
  ALTER COLUMN close_price SET NOT NULL,
  ALTER COLUMN atr SET NOT NULL;

-- 5. New PK on id + unique constraint for upsert
ALTER TABLE public.stock_atr_data ADD PRIMARY KEY (id);
ALTER TABLE public.stock_atr_data
  ADD CONSTRAINT stock_atr_data_ticker_data_date_key UNIQUE (ticker, data_date);

-- 6. Drop legacy columns
ALTER TABLE public.stock_atr_data
  DROP COLUMN IF EXISTS price,
  DROP COLUMN IF EXISTS date,
  DROP COLUMN IF EXISTS fetched_at;

-- 7. Index for the latest-per-ticker queries
CREATE INDEX IF NOT EXISTS idx_stock_atr_data_ticker_date
  ON public.stock_atr_data (ticker, data_date DESC);

-- 8. Auto-update updated_at on row updates
DROP TRIGGER IF EXISTS update_stock_atr_data_updated_at ON public.stock_atr_data;
CREATE TRIGGER update_stock_atr_data_updated_at
  BEFORE UPDATE ON public.stock_atr_data
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS already enabled with public SELECT policy ("Authenticated can read atr cache").
-- Replace with broader public read so unauth users can also see cached data if ever needed,
-- but keep writes restricted (no INSERT/UPDATE/DELETE policies => only service role can write).
DROP POLICY IF EXISTS "Authenticated can read atr cache" ON public.stock_atr_data;
CREATE POLICY "Anyone can read atr cache"
  ON public.stock_atr_data FOR SELECT
  USING (true);