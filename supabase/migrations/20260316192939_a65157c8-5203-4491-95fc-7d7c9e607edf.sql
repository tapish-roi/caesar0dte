
-- 1. Re-create match_pending_invites to handle phone too
CREATE OR REPLACE FUNCTION public.match_pending_invites()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.community_invites
  SET student_id = NEW.id
  WHERE (contact = NEW.email OR contact = (NEW.raw_user_meta_data->>'phone'))
    AND student_id IS NULL
    AND status = 'pending';
  RETURN NEW;
END;
$$;

-- 2. Create the trigger on auth.users (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'on_auth_user_created_match_invites'
  ) THEN
    CREATE TRIGGER on_auth_user_created_match_invites
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.match_pending_invites();
  END IF;
END;
$$;

-- 3. Retroactively match all existing pending invites by email
UPDATE public.community_invites ci
SET student_id = au.id
FROM auth.users au
WHERE ci.student_id IS NULL
  AND ci.status = 'pending'
  AND ci.contact = au.email;
