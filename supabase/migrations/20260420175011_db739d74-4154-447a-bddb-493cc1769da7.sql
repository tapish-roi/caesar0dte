-- Allow daily ATR snapshots per ticker (composite PK), so the cache can hold history.
ALTER TABLE public.stock_atr_data DROP CONSTRAINT stock_atr_data_pkey;
ALTER TABLE public.stock_atr_data ADD CONSTRAINT stock_atr_data_pkey PRIMARY KEY (ticker, date);
CREATE INDEX IF NOT EXISTS stock_atr_data_ticker_idx ON public.stock_atr_data (ticker);