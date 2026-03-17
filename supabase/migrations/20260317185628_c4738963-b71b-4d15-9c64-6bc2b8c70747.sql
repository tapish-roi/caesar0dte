
-- Table for scheduled live events (mentor creates in advance)
CREATE TABLE public.live_scheduled (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.live_scheduled ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mentors can manage their scheduled lives"
  ON public.live_scheduled FOR ALL
  USING (auth.uid() = mentor_id)
  WITH CHECK (auth.uid() = mentor_id);

CREATE POLICY "Community members can view scheduled lives"
  ON public.live_scheduled FOR SELECT
  USING (is_community_member(auth.uid(), mentor_id));

-- Table for live recordings (past live sessions)
CREATE TABLE public.live_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  recording_url TEXT,
  thumbnail_url TEXT,
  duration_minutes INTEGER,
  live_session_id UUID REFERENCES public.live_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.live_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mentors can manage their recordings"
  ON public.live_recordings FOR ALL
  USING (auth.uid() = mentor_id)
  WITH CHECK (auth.uid() = mentor_id);

CREATE POLICY "Community members can view recordings"
  ON public.live_recordings FOR SELECT
  USING (is_community_member(auth.uid(), mentor_id));

CREATE TRIGGER update_live_scheduled_updated_at
  BEFORE UPDATE ON public.live_scheduled
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_live_recordings_updated_at
  BEFORE UPDATE ON public.live_recordings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
