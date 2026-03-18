
-- ═══════════════════════════════════════════════
-- QUIZZES SCHEMA
-- ═══════════════════════════════════════════════

-- 1. Quizzes table
CREATE TABLE public.quizzes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_id UUID NOT NULL,
  lesson_id UUID REFERENCES public.lessons(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mentors can manage own quizzes"
  ON public.quizzes FOR ALL
  USING (auth.uid() = mentor_id)
  WITH CHECK (auth.uid() = mentor_id);

CREATE POLICY "Students can view published quizzes"
  ON public.quizzes FOR SELECT
  USING (is_published = true AND is_community_member(auth.uid(), mentor_id));

CREATE TRIGGER update_quizzes_updated_at
  BEFORE UPDATE ON public.quizzes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Quiz questions
CREATE TABLE public.quiz_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'multiple_choice', -- 'multiple_choice' | 'free_text'
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mentors can manage own quiz questions"
  ON public.quiz_questions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND q.mentor_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_id AND q.mentor_id = auth.uid()));

CREATE POLICY "Students can view questions of published quizzes"
  ON public.quiz_questions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.quizzes q
    WHERE q.id = quiz_id AND q.is_published = true AND is_community_member(auth.uid(), q.mentor_id)
  ));

-- 3. Multiple-choice options
CREATE TABLE public.quiz_question_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_question_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mentors can manage own quiz options"
  ON public.quiz_question_options FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.quiz_questions qq
    JOIN public.quizzes q ON q.id = qq.quiz_id
    WHERE qq.id = question_id AND q.mentor_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quiz_questions qq
    JOIN public.quizzes q ON q.id = qq.quiz_id
    WHERE qq.id = question_id AND q.mentor_id = auth.uid()
  ));

CREATE POLICY "Students can view options of published quizzes"
  ON public.quiz_question_options FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.quiz_questions qq
    JOIN public.quizzes q ON q.id = qq.quiz_id
    WHERE qq.id = question_id AND q.is_published = true AND is_community_member(auth.uid(), q.mentor_id)
  ));

-- 4. Quiz submissions
CREATE TABLE public.quiz_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  mentor_id UUID NOT NULL,
  score INTEGER,
  max_score INTEGER,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mentors can view submissions for their quizzes"
  ON public.quiz_submissions FOR SELECT
  USING (auth.uid() = mentor_id);

CREATE POLICY "Students can view own submissions"
  ON public.quiz_submissions FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Students can insert own submissions"
  ON public.quiz_submissions FOR INSERT
  WITH CHECK (auth.uid() = student_id AND is_community_member(auth.uid(), mentor_id));

-- 5. Quiz answers
CREATE TABLE public.quiz_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.quiz_submissions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  selected_option_id UUID REFERENCES public.quiz_question_options(id) ON DELETE SET NULL,
  answer_text TEXT,
  is_correct BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mentors can view answers for their quizzes"
  ON public.quiz_answers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.quiz_submissions s
    JOIN public.quizzes q ON q.id = s.quiz_id
    WHERE s.id = submission_id AND q.mentor_id = auth.uid()
  ));

CREATE POLICY "Students can view own answers"
  ON public.quiz_answers FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.quiz_submissions s
    WHERE s.id = submission_id AND s.student_id = auth.uid()
  ));

CREATE POLICY "Students can insert own answers"
  ON public.quiz_answers FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quiz_submissions s
    WHERE s.id = submission_id AND s.student_id = auth.uid()
  ));
