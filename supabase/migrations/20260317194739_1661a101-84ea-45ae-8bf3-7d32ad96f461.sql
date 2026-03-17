
-- Function that runs on INSERT/UPDATE to clean up past scheduled lives
CREATE OR REPLACE FUNCTION public.cleanup_past_scheduled_lives()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.live_scheduled
  WHERE scheduled_at < now()
    AND id != NEW.id;
  RETURN NEW;
END;
$$;

-- Trigger: runs after every insert/update on live_scheduled
DROP TRIGGER IF EXISTS trg_cleanup_past_scheduled_lives ON public.live_scheduled;
CREATE TRIGGER trg_cleanup_past_scheduled_lives
AFTER INSERT OR UPDATE ON public.live_scheduled
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_past_scheduled_lives();
