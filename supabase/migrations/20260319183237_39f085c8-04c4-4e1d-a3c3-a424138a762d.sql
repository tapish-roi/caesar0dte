
-- Fix match_pending_invites: when triggered from profiles table, use NEW.email and NEW.phone directly
-- (not raw_user_meta_data which only exists on auth.users)
CREATE OR REPLACE FUNCTION public.match_pending_invites()
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
