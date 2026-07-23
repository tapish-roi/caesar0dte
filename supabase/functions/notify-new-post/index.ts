import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { post_id, mentor_id } = await req.json();

    if (!post_id || !mentor_id) {
      return new Response(JSON.stringify({ error: 'Missing post_id or mentor_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch the post details
    const { data: post } = await supabase
      .from('community_posts')
      .select('content, post_type')
      .eq('id', post_id)
      .single();

    if (!post) {
      return new Response(JSON.stringify({ error: 'Post not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch mentor profile
    const { data: mentorProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', mentor_id)
      .single();

    const mentorName = mentorProfile?.full_name ?? 'המנטור שלך';

    // Fetch all community members
    const { data: members } = await supabase
      .from('community_members')
      .select('student_id')
      .eq('mentor_id', mentor_id);

    if (!members || members.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const studentIds = members.map((m) => m.student_id);

    // Fetch profiles with notification preferences for these students
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name, email, notify_email')
      .in('user_id', studentIds);

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const postPreview = post.content.length > 120 ? post.content.substring(0, 120) + '...' : post.content;

    const emailResults: string[] = [];

    // ─── Email via Lovable send-transactional-email ───────────────────────────
    const emailRecipients = profiles.filter((p) => p.notify_email && p.email);

    if (emailRecipients.length > 0) {
      // Try to call send-transactional-email edge function if it exists
      const projectId = Deno.env.get('SUPABASE_URL')?.match(/https:\/\/([^.]+)\./)?.[1];

      for (const profile of emailRecipients) {
        try {
          const emailHtml = `
            <div dir="rtl" style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111;">
              <h2 style="color: #111; margin-bottom: 8px;">פוסט חדש מ${mentorName}</h2>
              <p style="color: #555; line-height: 1.6; white-space: pre-wrap;">${postPreview}</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
              <p style="font-size: 12px; color: #aaa;">קיבלת אימייל זה כי הפעלת התראות אימייל בפרופיל שלך ב-Caesar 0 DTE.</p>
            </div>
          `;

          const { error: emailError } = await supabase.functions.invoke('send-transactional-email', {
            body: {
              to: profile.email!,
              subject: `פוסט חדש מ${mentorName} בקהילה`,
              html: emailHtml,
              message_id: `new-post-${post_id}-${profile.user_id}`,
              template_name: 'new-community-post',
            },
          });

          if (emailError) {
            console.error(`Email invoke error for ${profile.user_id}:`, emailError);
          } else {
            emailResults.push(profile.user_id);
          }
        } catch (e) {
          console.error(`Email error for ${profile.user_id}:`, e);
        }
      }
    }

    return new Response(
      JSON.stringify({
        email_sent: emailResults.length,
        email_recipients: emailResults,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('notify-new-post error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
