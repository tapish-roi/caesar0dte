
-- Create live_sessions table to track active mentor live streams
CREATE TABLE public.live_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'סשן לייב',
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE NULL,
  viewer_count INTEGER NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mentors can insert own sessions"
  ON public.live_sessions FOR INSERT
  WITH CHECK (auth.uid() = mentor_id AND has_role(auth.uid(), 'mentor'::app_role));

CREATE POLICY "Mentors can update own sessions"
  ON public.live_sessions FOR UPDATE
  USING (auth.uid() = mentor_id);

CREATE POLICY "Community can view live sessions"
  ON public.live_sessions FOR SELECT
  USING (auth.uid() = mentor_id OR is_community_member(auth.uid(), mentor_id));

CREATE POLICY "Mentors can delete own sessions"
  ON public.live_sessions FOR DELETE
  USING (auth.uid() = mentor_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;

-- Create WebRTC signaling table for peer connections
CREATE TABLE public.live_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL,
  to_user_id UUID NOT NULL,
  signal_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.live_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can insert signals"
  ON public.live_signals FOR INSERT
  WITH CHECK (auth.uid() = from_user_id);

CREATE POLICY "Participants can view signals"
  ON public.live_signals FOR SELECT
  USING (auth.uid() = to_user_id OR auth.uid() = from_user_id);

CREATE POLICY "Participants can delete own signals"
  ON public.live_signals FOR DELETE
  USING (auth.uid() = from_user_id);

-- Enable realtime for signals
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_signals;
