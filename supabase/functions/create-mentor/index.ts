import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { email, password, fullName } = await req.json();

    if (!email || !password || !fullName) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Gate: only allow-listed emails may create a mentor account ──────
    // MENTOR_ALLOWED_EMAILS is a Supabase secret: comma- or newline-separated
    // list of authorized addresses. Not visible to clients; edit it server-side
    // to add/remove mentors. Fails closed — if it is unset, no one can sign up.
    const allowRaw = Deno.env.get('MENTOR_ALLOWED_EMAILS') ?? '';
    const allowList = allowRaw
      .split(/[,\n]/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (allowList.length === 0) {
      console.error('MENTOR_ALLOWED_EMAILS is not configured — rejecting mentor signup');
      return new Response(
        JSON.stringify({ error: 'הרשמת מנטורים אינה זמינה כרגע. פנה למנהל המערכת.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!allowList.includes(String(email).trim().toLowerCase())) {
      return new Response(
        JSON.stringify({ error: 'אימייל זה אינו מורשה ליצירת חשבון מנטור.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // Admin client with service role key
    const adminClient = createClient(
      supabaseUrl!,
      serviceRoleKey!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Create the auth user (trigger will create profile+role via handle_new_user)
    console.log('Creating user:', email);
    const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: 'mentor' },
    });

    if (createError) {
      console.error('createUser error:', JSON.stringify(createError));
      throw new Error(createError.message);
    }
    const userId = userData.user.id;
    console.log('User created:', userId);

    // 2. Ensure profile exists (trigger may have already created it)
    const { error: profileError } = await adminClient.from('profiles').upsert({
      user_id: userId,
      full_name: fullName,
      email,
    }, { onConflict: 'user_id' });

    if (profileError) {
      console.error('profile upsert error:', JSON.stringify(profileError));
      throw new Error(`Profile error: ${profileError.message}`);
    }

    // 3. Ensure role exists
    const { error: roleError } = await adminClient.from('user_roles').upsert({
      user_id: userId,
      role: 'mentor',
    }, { onConflict: 'user_id,role' });

    if (roleError) {
      console.error('role upsert error:', JSON.stringify(roleError));
      // Non-fatal — role may already exist from trigger
    }

    return new Response(JSON.stringify({ success: true, userId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Unhandled error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
