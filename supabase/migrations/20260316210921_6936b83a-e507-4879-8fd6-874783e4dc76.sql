
-- ── 1. Student category access table ─────────────────────────────────────────
CREATE TABLE public.student_category_access (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_id   UUID NOT NULL,
  student_id  UUID NOT NULL,
  category_id UUID NOT NULL,
  granted_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (mentor_id, student_id, category_id)
);

ALTER TABLE public.student_category_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mentor can view access grants"
  ON public.student_category_access FOR SELECT
  USING (auth.uid() = mentor_id);

CREATE POLICY "Mentor can grant access"
  ON public.student_category_access FOR INSERT
  WITH CHECK (auth.uid() = mentor_id AND has_role(auth.uid(), 'mentor'::app_role));

CREATE POLICY "Mentor can revoke access"
  ON public.student_category_access FOR DELETE
  USING (auth.uid() = mentor_id);

CREATE POLICY "Student can view own access"
  ON public.student_category_access FOR SELECT
  USING (auth.uid() = student_id);

-- ── 2. Lesson attachment columns ──────────────────────────────────────────────
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS attachment_url  TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT;
