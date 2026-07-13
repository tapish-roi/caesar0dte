-- Security fix: remove the client-side INSERT policy on user_roles.
--
-- The old policy allowed any authenticated user to insert an arbitrary role
-- row for themselves (WITH CHECK only verified auth.uid() = user_id, never the
-- role value). A student could insert { user_id: self, role: 'mentor' } from the
-- browser and gain full mentor privileges (all mentor RLS uses has_role()).
--
-- No legitimate client flow needs this policy: roles are assigned exclusively by
--   * public.handle_new_user()  — SECURITY DEFINER trigger on auth.users, and
--   * the create-mentor / invite-student edge functions — service-role clients,
-- both of which bypass RLS. Dropping the policy therefore closes the escalation
-- without affecting signup or invites.
--
-- The SELECT policy ("Users can view own role") is kept — reading your own role
-- is not a vulnerability. There are no UPDATE/DELETE policies, so those writes
-- remain blocked for non-service clients.

DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;
