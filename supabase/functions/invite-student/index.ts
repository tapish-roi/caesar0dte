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

    const { inviteId, email, mentorId } = await req.json();
    if (!inviteId || !email || !mentorId) throw new Error('Missing required fields');
    if (mentorId !== caller.id) throw new Error('Forbidden');

    const appUrl = req.headers.get('origin') || 'https://tradelearning.lovable.app';

    // Get mentor name for the email
    const { data: mentorProfile } = await adminClient
      .from('profiles').select('full_name').eq('user_id', mentorId).maybeSingle();
    const mentorName = mentorProfile?.full_name ?? 'המנטור שלך';

    const acceptInviteUrl = `${appUrl}/accept-invite?mentor=${encodeURIComponent(mentorName)}`;

    // Check if user already exists
    const { data: allUsers } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = allUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    let studentId: string;

    if (existingUser) {
      // Existing user — ensure they have student role and send password reset
      studentId = existingUser.id;

      await adminClient.from('user_roles').upsert(
        { user_id: studentId, role: 'student' },
        { onConflict: 'user_id,role' }
      );

      // Send password reset so they can access the app
      const anonClient = createClient(supabaseUrl, anonKey);
      await anonClient.auth.resetPasswordForEmail(email, { redirectTo: appUrl });
      console.log('Sent password reset to existing user:', email);
    } else {
      // New user — inviteUserByEmail creates account AND sends invite email in one step
      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: appUrl,
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
