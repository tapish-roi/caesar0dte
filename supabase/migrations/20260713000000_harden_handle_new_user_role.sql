-- Security fix: stop trusting client-controlled signup metadata for role assignment.
--
-- `handle_new_user` (SECURITY DEFINER, fires on every auth.users insert) previously
-- read NEW.raw_user_meta_data->>'role' and inserted the matching row into
-- public.user_roles. That metadata is populated from the `data` field of
-- supabase.auth.signUp({ options: { data: { role: 'mentor' } } }), which any visitor
-- can call directly from the browser with the anon key. If public email signups are
-- enabled, an attacker could self-assign the 'mentor' role and gain full mentor
-- access — get_user_role() (and every has_role() RLS check) would return 'mentor'.
-- Migration 20260708000000 removed the client INSERT *policy* on user_roles, but this
-- SECURITY DEFINER trigger bypasses RLS and reintroduced the same escalation.
--
-- Legitimate role assignment does NOT need this path: both privileged flows use the
-- service role and upsert user_roles themselves —
--   * create-mentor  edge function  -> user_roles upsert role='mentor'
--   * invite-student  edge function  -> user_roles upsert role='student'
-- so dropping the metadata-based insert closes the hole without affecting signup or
-- invites. A direct self-signup now creates a profile but NO role, i.e. no access.

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  -- Create profile only. Roles are assigned exclusively by the create-mentor /
  -- invite-student edge functions (service role), never from client-supplied metadata.
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log the error but don't fail the user creation
  RAISE WARNING 'handle_new_user error for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- NOTE: existing already-escalated accounts are intentionally NOT auto-deleted here.
-- A blind heuristic (e.g. "mentor with no content") would also strip a legitimate
-- mentor who was just created via the edge function and hasn't authored anything yet.
-- Instead, audit suspect mentor grants manually and revoke confirmed-bad ones. Run:
--
--   SELECT ur.user_id, p.email, p.created_at
--   FROM public.user_roles ur
--   JOIN public.profiles p ON p.user_id = ur.user_id
--   WHERE ur.role = 'mentor'
--     AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.mentor_id = ur.user_id)
--     AND NOT EXISTS (SELECT 1 FROM public.lessons   l WHERE l.mentor_id = ur.user_id)
--     AND NOT EXISTS (SELECT 1 FROM public.community_members m WHERE m.mentor_id = ur.user_id);
--
-- Cross-check each row against your intended mentor list, then:
--   DELETE FROM public.user_roles WHERE user_id = '<confirmed-bad-uuid>' AND role = 'mentor';
