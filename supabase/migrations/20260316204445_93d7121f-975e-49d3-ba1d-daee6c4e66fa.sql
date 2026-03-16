
-- Drop the old check constraint on lesson_type
ALTER TABLE public.lessons DROP CONSTRAINT IF EXISTS lessons_lesson_type_check;

-- Add new check constraint that includes 'live'
ALTER TABLE public.lessons ADD CONSTRAINT lessons_lesson_type_check
  CHECK (lesson_type IN ('recorded_lesson', 'zoom_recording', 'presentation', 'live'));

-- Add recording_url column to live_sessions to store the recorded video URL
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS recording_url text;

-- Add recording_url to community_posts via lesson reference (we use existing media_url field)
-- No schema change needed for community_posts since media_url already exists
