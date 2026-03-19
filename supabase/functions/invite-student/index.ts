import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Verify the caller is an authenticated mentor
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify caller's JWT
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) throw new Error('Unauthorized');

    // Check caller is a mentor
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: roleRow } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id)
      .eq('role', 'mentor')
      .maybeSingle();
    if (!roleRow) throw new Error('Only mentors can invite students');

    const { inviteId, email, mentorId } = await req.json();
    if (!inviteId || !email || !mentorId) throw new Error('Missing required fields');

    // Validate mentorId matches caller
    if (mentorId !== caller.id) throw new Error('Forbidden');

    // 1. Check if a user with this email already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);

    let studentId: string;

    if (existingUser) {
      studentId = existingUser.id;

      // Ensure student role exists
      await adminClient.from('user_roles').upsert(
        { user_id: studentId, role: 'student' },
        { onConflict: 'user_id,role' }
      );
    } else {
      // 2. Create a new student account (confirmed, random temp password)
      const tempPassword = crypto.randomUUID() + 'Aa1!';
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { role: 'student' },
      });
      if (createError) throw new Error(`Failed to create user: ${createError.message}`);
      studentId = newUser.user.id;
    }

    // 3. Update invite record with student_id
    await adminClient
      .from('community_invites')
      .update({ student_id: studentId })
      .eq('id', inviteId);

    // 4. Get mentor profile for the email
    const { data: mentorProfile } = await adminClient
      .from('profiles')
      .select('full_name')
      .eq('user_id', mentorId)
      .maybeSingle();
    const mentorName = mentorProfile?.full_name ?? 'המנטור שלך';

    // 5. Send password reset/setup email so student can access the app
    const appUrl = req.headers.get('origin') || supabaseUrl.replace('.supabase.co', '.app');

    if (!existingUser) {
      // New user — send invite email (magic link to set up account)
      const { error: inviteEmailError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: appUrl,
        data: { mentor_name: mentorName, role: 'student' },
      });
      if (inviteEmailError) {
        console.log('Invite email note (new user):', inviteEmailError.message);
      }
    } else {
      // Existing user — send password reset email so they can login
      const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
      const { error: resetError } = await anonClient.auth.resetPasswordForEmail(email, {
        redirectTo: appUrl,
      });
      if (resetError) {
        console.log('Reset email note (existing user):', resetError.message);
      }
    }

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
