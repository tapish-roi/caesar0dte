
-- Live chat messages table
CREATE TABLE IF NOT EXISTS public.live_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  display_name text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_chat_messages ENABLE ROW LEVEL SECURITY;

-- Anyone in the community can read chat messages for a session
CREATE POLICY "Community can read chat" ON public.live_chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = live_chat_messages.session_id
        AND (auth.uid() = ls.mentor_id OR public.is_community_member(auth.uid(), ls.mentor_id))
    )
  );

-- Authenticated users can insert their own messages
CREATE POLICY "Authenticated can send chat" ON public.live_chat_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Enable realtime for chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_chat_messages;
