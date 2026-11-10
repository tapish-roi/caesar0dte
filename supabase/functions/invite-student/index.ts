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
    //
    // community_invites.student_id references auth.users ON DELETE CASCADE, and the
    // first send already pointed this invite at the stale account. Deleting that
    // account would therefore delete the invite row itself: the pending invite
    // vanished from the mentor's list and the student's dashboard fallback was gone.
    // Detach every invite row from the stale account first, then re-attach them to
    // the new account below.
    const detachedInviteIds: string[] = [];
    if (existingUser && !existingUser.last_sign_in_at && !existingUser.email_confirmed_at) {
      const { data: detached, error: detachErr } = await adminClient
        .from('community_invites')
        .update({ student_id: null })
        .eq('student_id', existingUser.id)
        .select('id');
      if (detachErr) {
        console.warn('Could not detach invites from stale account, will send recovery instead:', detachErr.message);
      } else {
        detachedInviteIds.push(...(detached ?? []).map((r: { id: string }) => r.id));
        const { error: delErr } = await adminClient.auth.admin.deleteUser(existingUser.id);
        if (delErr) {
          console.warn('Could not delete stale invite account, will send recovery instead:', delErr.message);
          if (detachedInviteIds.length) {
            await adminClient.from('community_invites')
              .update({ student_id: existingUser.id }).in('id', detachedInviteIds);
          }
          detachedInviteIds.length = 0;
        } else {
          console.log('Removed never-activated account to re-send a clean invite:', email);
          existingUser = undefined;
        }
      }
    }

    let studentId: string;
    // Which mail actually went out. The mentor dashboard shows this after a
    // "send again", so it can tell the student whether to look for the invite
    // mail or the "reset your password" one.
    let emailType: 'invite' | 'recovery';

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
      emailType = 'recovery';
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
      emailType = 'invite';
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

    // Point this invite (and any rows detached from a deleted stale account) at
    // the student's current account.
    const { error: linkErr } = await adminClient
      .from('community_invites')
      .update({ student_id: studentId })
      .in('id', Array.from(new Set([inviteId, ...detachedInviteIds])));
    if (linkErr) console.error('Failed to link invite to student:', linkErr.message);

    return new Response(JSON.stringify({ success: true, studentId, emailType }), {
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
