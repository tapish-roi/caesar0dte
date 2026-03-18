
-- Add updated_at to lesson_question_answers for edit tracking
ALTER TABLE public.lesson_question_answers 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

-- Allow mentors to update their own lesson answers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lesson_question_answers' AND policyname = 'Mentor can update own lesson answers'
  ) THEN
    CREATE POLICY "Mentor can update own lesson answers"
      ON public.lesson_question_answers
      FOR UPDATE
      USING (auth.uid() = mentor_id);
  END IF;
END $$;

-- Allow students to update their own lesson questions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lesson_questions' AND policyname = 'Students can update own lesson questions'
  ) THEN
    CREATE POLICY "Students can update own lesson questions"
      ON public.lesson_questions
      FOR UPDATE
      USING (auth.uid() = student_id);
  END IF;
END $$;

-- Allow students to update their own private questions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'private_questions' AND policyname = 'Students can update own private questions'
  ) THEN
    CREATE POLICY "Students can update own private questions"
      ON public.private_questions
      FOR UPDATE
      USING (auth.uid() = student_id)
      WITH CHECK (auth.uid() = student_id);
  END IF;
END $$;
