
-- Add media_url, media_type, post_type to community_posts
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'discussion',
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS media_type TEXT;

-- Comments table for community post discussions
CREATE TABLE IF NOT EXISTS public.community_post_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.community_post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Community members can view comments"
  ON public.community_post_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.community_posts cp
      WHERE cp.id = post_id
        AND (auth.uid() = cp.mentor_id OR is_community_member(auth.uid(), cp.mentor_id))
    )
  );

CREATE POLICY "Community members can insert comments"
  ON public.community_post_comments FOR INSERT
  WITH CHECK (
    auth.uid() = author_id AND
    EXISTS (
      SELECT 1 FROM public.community_posts cp
      WHERE cp.id = post_id
        AND (auth.uid() = cp.mentor_id OR is_community_member(auth.uid(), cp.mentor_id))
    )
  );

CREATE POLICY "Authors can delete own comments"
  ON public.community_post_comments FOR DELETE
  USING (auth.uid() = author_id);

CREATE POLICY "Mentor can delete comments on own posts"
  ON public.community_post_comments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.community_posts cp
      WHERE cp.id = post_id AND cp.mentor_id = auth.uid()
    )
  );

CREATE TRIGGER update_community_post_comments_updated_at
  BEFORE UPDATE ON public.community_post_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
