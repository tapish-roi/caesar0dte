-- Raise the per-file upload cap on the lesson-assets bucket to 5 GiB.
--
-- The bucket was originally created without a file_size_limit, so it inherited
-- the Supabase project's global default (50 MiB). That is far too small for
-- lesson videos. Here we set an explicit per-bucket limit of 5 GiB.
--
-- IMPORTANT — this alone is NOT sufficient. Supabase enforces the *smaller* of
-- the bucket limit and the project-wide global limit, so you must ALSO raise the
-- global limit in the dashboard (Storage -> Settings -> "Upload file size limit")
-- to at least 5 GiB. Both levers require a paid plan: the Free tier hard-caps at
-- 50 MB regardless of this value.
--
-- 5 GiB = 5 * 1024^3 = 5368709120 bytes.

UPDATE storage.buckets
SET file_size_limit = 5368709120
WHERE id = 'lesson-assets';
