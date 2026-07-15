/**
 * invite-student — Sends invite/recovery email via Supabase's default sender.
 *
 * (Branded Resend version was reverted — sending from a custom domain
 * requires a verified domain in Resend. Re-add when ready.)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify caller JWT
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) throw new Error('Unauthorized');

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller is a mentor
    const { data: roleRow } = await adminClient
      .from('user_roles').select('role')
      .eq('user_id', caller.id).eq('role', 'mentor').maybeSingle();
    if (!roleRow) throw new Error('Only mentors can invite students');

    const { inviteId, email, mentorId, redirectBase } = await req.json();
    if (!inviteId || !email || !mentorId) throw new Error('Missing required fields');
    if (mentorId !== caller.id) throw new Error('Forbidden');

    // Where the app is actually served. The client sends its full base (origin +
    // Vite BASE_URL, e.g. https://tapish-roi.github.io/caesar0dte/) because the
    // request Origin header drops the "/caesar0dte/" sub-path — which is exactly
    // what made invite links land on a 404. Normalize the trailing slash, then
    // fall back to origin / the lovable URL if the client didn't send it.
    const rawBase = (redirectBase || req.headers.get('origin') || 'https://caesar0dte.lovable.app');
    const appUrl = String(rawBase).replace(/\/+$/, '');

    // Get mentor name for the email
    const { data: mentorProfile } = await adminClient
      .from('profiles').select('full_name').eq('user_id', mentorId).maybeSingle();
    const mentorName = mentorProfile?.full_name ?? 'המנטור שלך';

    // Redirect URL after accepting the invite — includes mentor info for the page
    const acceptInviteUrl = `${appUrl}/accept-invite?mentor=${encodeURIComponent(mentorName)}&mentor_id=${encodeURIComponent(mentorId)}&email=${encodeURIComponent(email)}`;

    // Check if user already exists
    const { data: allUsers } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    let existingUser = allUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    // A leftover account that was created by a previous invite attempt but never
    // activated (never signed in, email never confirmed) is why re-inviting sent a
    // confusing "reset your password" email instead of a fresh invite. Delete that
    // stale shell so the invite path below runs and the student gets a proper
    // signup invite. Guarded tightly: only ever removes a never-used account, and
    // if the delete fails we keep the existing user and fall back to recovery.
    if (existingUser && !existingUser.last_sign_in_at && !existingUser.email_confirmed_at) {
      const { error: delErr } = await adminClient.auth.admin.deleteUser(existingUser.id);
      if (delErr) {
        console.warn('Could not delete stale invite account, will send recovery instead:', delErr.message);
      } else {
        console.log('Removed never-activated account to re-send a clean invite:', email);
        existingUser = undefined;
      }
    }

    let studentId: string;

    if (existingUser) {
      // Real existing user (has signed in before) — ensure student role and send a
      // password-recovery email so they can set a new password and access the app.
      studentId = existingUser.id;

      await adminClient.from('user_roles').upsert(
        { user_id: studentId, role: 'student' },
        { onConflict: 'user_id,role' }
      );

      const anonClient = createClient(supabaseUrl, anonKey);
      const { error: resetError } = await anonClient.auth.resetPasswordForEmail(email, {
        redirectTo: acceptInviteUrl,
      });
      if (resetError) throw new Error(`Failed to send reset email: ${resetError.message}`);
      console.log('Sent password recovery email to existing user:', email);
    } else {
      // New (or freshly-cleared) user — inviteUserByEmail creates the account AND
      // sends the "you've been invited" signup email automatically.
      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: acceptInviteUrl,
          data: { role: 'student', mentor_name: mentorName },
        }
      );
      if (inviteError) throw new Error(`Failed to invite user: ${inviteError.message}`);
      studentId = inviteData.user.id;
      console.log('Invited new student:', email, studentId);
    }

    // Ensure profile exists
    await adminClient.from('profiles').upsert(
      {
        user_id: studentId,
        full_name: email.split('@')[0],
        email,
      },
      { onConflict: 'user_id' }
    );

    // Ensure student role exists
    await adminClient.from('user_roles').upsert(
      { user_id: studentId, role: 'student' },
      { onConflict: 'user_id,role' }
    );

    // Update invite record with student_id
    await adminClient
      .from('community_invites')
      .update({ student_id: studentId })
      .eq('id', inviteId);

    return new Response(JSON.stringify({ success: true, studentId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('invite-student error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
