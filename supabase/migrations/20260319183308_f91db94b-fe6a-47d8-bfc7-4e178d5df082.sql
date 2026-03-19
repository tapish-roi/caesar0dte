
-- Separate the two triggers: one for auth.users, one for profiles

-- 1. Fix match_pending_invites back for auth.users (uses NEW.id, NEW.raw_user_meta_data)
CREATE OR REPLACE FUNCTION public.match_pending_invites()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
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

-- 2. New function for profiles table trigger (uses NEW.user_id, NEW.phone)
CREATE OR REPLACE FUNCTION public.match_pending_invites_from_profile()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.community_invites
  SET student_id = NEW.user_id
  WHERE (contact = NEW.email OR contact = NEW.phone)
    AND student_id IS NULL
    AND status = 'pending';
  RETURN NEW;
END;
$$;

-- 3. Update the profiles trigger to use the new function
DROP TRIGGER IF EXISTS on_profile_created_match_invites ON public.profiles;
CREATE TRIGGER on_profile_created_match_invites
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.match_pending_invites_from_profile();
