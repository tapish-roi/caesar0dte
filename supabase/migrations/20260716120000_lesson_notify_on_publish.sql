-- Per-lesson email-notification opt-in.
--
-- When a mentor creates a lesson with the "notify students" switch on, this
-- flag is set true. On the lesson's first publish (draft -> published) the
-- notify-new-lesson edge function emails every student who has access to the
-- lesson's category. The flag is then consumed (set back to false) so that
-- unpublishing and re-publishing later does not re-notify.
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS notify_on_publish BOOLEAN NOT NULL DEFAULT false;
