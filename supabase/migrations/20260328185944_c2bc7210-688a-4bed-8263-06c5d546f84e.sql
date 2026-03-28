
-- Add display_name column to community_members
ALTER TABLE public.community_members ADD COLUMN display_name text DEFAULT NULL;

-- Allow mentors to update community_members (for setting display_name)
CREATE POLICY "Mentors can update members"
ON public.community_members
FOR UPDATE
USING (auth.uid() = mentor_id)
WITH CHECK (auth.uid() = mentor_id);
