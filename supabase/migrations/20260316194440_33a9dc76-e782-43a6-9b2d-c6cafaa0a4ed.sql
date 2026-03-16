
-- 1. Function to match invite to existing user on INSERT
CREATE OR REPLACE FUNCTION public.match_invite_on_insert()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.community_invites
  SET student_id = au.id
  FROM auth.users au
  WHERE community_invites.id = NEW.id
    AND community_invites.student_id IS NULL
    AND (au.email = NEW.contact OR au.raw_user_meta_data->>'phone' = NEW.contact);
  RETURN NEW;
END;
$$;

-- 2. Trigger: fires after every new invite is inserted
DROP TRIGGER IF EXISTS on_community_invite_created ON public.community_invites;
CREATE TRIGGER on_community_invite_created
  AFTER INSERT ON public.community_invites
  FOR EACH ROW EXECUTE FUNCTION public.match_invite_on_insert();

-- 3. Also update the community_invites RLS SELECT policy to allow matching by contact
-- (so students can see invites matched by email before student_id is set)
DROP POLICY IF EXISTS "Mentor and student can view invites" ON public.community_invites;
CREATE POLICY "Mentor and student can view invites"
  ON public.community_invites
  FOR SELECT
  USING (
    auth.uid() = mentor_id
    OR auth.uid() = student_id
    OR contact = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR contact = (SELECT raw_user_meta_data->>'phone' FROM auth.users WHERE id = auth.uid())
  );
