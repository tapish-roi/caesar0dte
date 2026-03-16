
-- Replace policy: use only auth.email() (safe built-in), not user_metadata
DROP POLICY IF EXISTS "Mentor and student can view invites" ON public.community_invites;
CREATE POLICY "Mentor and student can view invites"
  ON public.community_invites
  FOR SELECT
  USING (
    auth.uid() = mentor_id
    OR auth.uid() = student_id
    OR contact = auth.email()
  );
