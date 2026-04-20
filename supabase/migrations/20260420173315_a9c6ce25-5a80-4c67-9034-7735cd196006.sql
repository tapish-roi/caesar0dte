-- Fix infinite recursion: skip purge when we are already inside a trigger
CREATE OR REPLACE FUNCTION public.purge_old_deleted_trades()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Avoid recursion: only purge from the top-level statement, never from a nested trigger
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  DELETE FROM public.trades
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '30 days';

  RETURN NULL;
END;
$function$;