
CREATE TABLE public.live_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  scheduled_live_id UUID NOT NULL REFERENCES public.live_scheduled(id) ON DELETE CASCADE,
  mentor_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (student_id, scheduled_live_id)
);

ALTER TABLE public.live_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can manage own reminders"
  ON public.live_reminders FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Mentors can view reminders for their lives"
  ON public.live_reminders FOR SELECT
  USING (auth.uid() = mentor_id);
