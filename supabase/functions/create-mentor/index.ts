import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { email, password, fullName, phone } = await req.json();

    if (!email || !password || !fullName) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log('SUPABASE_URL:', supabaseUrl ? 'set' : 'MISSING');
    console.log('SUPABASE_SERVICE_ROLE_KEY:', serviceRoleKey ? 'set' : 'MISSING');

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
      phone: phone || null,
    }, { onConflict: 'user_id' });

    if (profileError) {
      console.error('profile upsert error:', JSON.stringify(profileError));
      // Non-fatal — profile may already exist from trigger
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
