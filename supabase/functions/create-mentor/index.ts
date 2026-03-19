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

    // Admin client with service role key
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Create the auth user
    const { data: userData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,   // skip email verification for now
      user_metadata: { full_name: fullName, role: 'mentor' },
    });

    if (createError) throw createError;
    const userId = userData.user.id;

    // 2. Insert profile
    const { error: profileError } = await adminClient.from('profiles').upsert({
      user_id: userId,
      full_name: fullName,
      email,
      phone: phone || null,
    }, { onConflict: 'user_id' });

    if (profileError) throw profileError;

    // 3. Insert role
    const { error: roleError } = await adminClient.from('user_roles').upsert({
      user_id: userId,
      role: 'mentor',
    }, { onConflict: 'user_id,role' });

    if (roleError) throw roleError;

    return new Response(JSON.stringify({ success: true, userId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
