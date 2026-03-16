
-- Re-create the trigger on auth.users (was missing)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill user_roles for any existing users who signed up but have no role row
INSERT INTO public.user_roles (user_id, role)
SELECT
  au.id,
  (au.raw_user_meta_data->>'role')::app_role
FROM auth.users au
WHERE
  au.raw_user_meta_data->>'role' IN ('mentor', 'student')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = au.id
  )
ON CONFLICT DO NOTHING;
