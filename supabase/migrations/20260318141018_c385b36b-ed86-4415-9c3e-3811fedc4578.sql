
-- ── lesson_questions: public questions on lessons ──────────────────────────
CREATE TABLE public.lesson_questions (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id   UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  mentor_id   UUID NOT NULL,
  student_id  UUID NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lesson_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Community members can view lesson questions"
  ON public.lesson_questions FOR SELECT
  USING (auth.uid() = mentor_id OR is_community_member(auth.uid(), mentor_id));

CREATE POLICY "Students can insert lesson questions"
  ON public.lesson_questions FOR INSERT
  WITH CHECK (auth.uid() = student_id AND is_community_member(auth.uid(), mentor_id));

CREATE POLICY "Students or mentor can delete lesson questions"
  ON public.lesson_questions FOR DELETE
  USING (auth.uid() = student_id OR auth.uid() = mentor_id);

CREATE TRIGGER update_lesson_questions_updated_at
  BEFORE UPDATE ON public.lesson_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── lesson_question_answers: mentor answers to public questions ────────────
CREATE TABLE public.lesson_question_answers (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES public.lesson_questions(id) ON DELETE CASCADE,
  mentor_id   UUID NOT NULL,
  content     TEXT NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lesson_question_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Community members can view lesson answers"
  ON public.lesson_question_answers FOR SELECT
  USING (
    auth.uid() = mentor_id
    OR EXISTS (
      SELECT 1 FROM public.lesson_questions lq
      WHERE lq.id = question_id AND is_community_member(auth.uid(), lq.mentor_id)
    )
  );

CREATE POLICY "Mentor can insert lesson answers"
  ON public.lesson_question_answers FOR INSERT
  WITH CHECK (auth.uid() = mentor_id AND has_role(auth.uid(), 'mentor'::app_role));

CREATE POLICY "Mentor can delete own lesson answers"
  ON public.lesson_question_answers FOR DELETE
  USING (auth.uid() = mentor_id);

CREATE TRIGGER update_lesson_question_answers_updated_at
  BEFORE UPDATE ON public.lesson_question_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── private_questions: private student→mentor questions ────────────────────
CREATE TABLE public.private_questions (
  id           UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id   UUID NOT NULL,
  mentor_id    UUID NOT NULL,
  lesson_id    UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  question     TEXT NOT NULL,
  answer       TEXT,
  answered_at  TIMESTAMP WITH TIME ZONE,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.private_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own private questions"
  ON public.private_questions FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Mentor can view private questions sent to them"
  ON public.private_questions FOR SELECT
  USING (auth.uid() = mentor_id);

CREATE POLICY "Students can insert private questions"
  ON public.private_questions FOR INSERT
  WITH CHECK (auth.uid() = student_id AND is_community_member(auth.uid(), mentor_id));

CREATE POLICY "Mentor can answer private questions"
  ON public.private_questions FOR UPDATE
  USING (auth.uid() = mentor_id);

CREATE POLICY "Student or mentor can delete private questions"
  ON public.private_questions FOR DELETE
  USING (auth.uid() = student_id OR auth.uid() = mentor_id);

CREATE TRIGGER update_private_questions_updated_at
  BEFORE UPDATE ON public.private_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.lesson_questions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lesson_question_answers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.private_questions;
