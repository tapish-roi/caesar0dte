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
    const { session_id, mentor_id, title, siteUrl } = await req.json();

    if (!session_id || !mentor_id) {
      return new Response(JSON.stringify({ error: 'Missing session_id or mentor_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch mentor profile
    const { data: mentorProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', mentor_id)
      .single();

    const mentorName = mentorProfile?.full_name ?? 'המנטור שלך';
    const sessionTitle = title || 'לייב סשן';

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

    // Fetch profiles with email notification preference
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name, email, notify_email')
      .in('user_id', studentIds);

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailRecipients = profiles.filter((p) => p.notify_email && p.email);
    const emailResults: string[] = [];

    // The CTA used to be href="#", so "watch the live" went nowhere. Callers can
    // pass siteUrl; fall back to the production site so the button always works.
    const link = typeof siteUrl === 'string' && siteUrl.startsWith('http')
      ? siteUrl
      : 'https://tapish-roi.github.io/caesar0dte/';

    for (const profile of emailRecipients) {
      try {
        const emailHtml = `
          <div dir="rtl" style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111; background: #fff;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:20px;">
              <div style="width:10px; height:10px; background:#ef4444; border-radius:50%; display:inline-block;"></div>
              <span style="color:#ef4444; font-weight:bold; text-transform:uppercase; letter-spacing:2px; font-size:12px;">LIVE</span>
            </div>
            <h2 style="color:#111; margin-bottom:8px; font-size:20px;">${mentorName} עולה ללייב עכשיו!</h2>
            <p style="color:#444; line-height:1.6; font-size:15px; margin-bottom:20px;">
              <strong>${sessionTitle}</strong> — הלייב כבר פועל. היכנס לקהילה כדי לצפות.
            </p>
            <a href="${link}" style="display:inline-block; background:#3b82f6; color:#fff; padding:12px 24px; border-radius:10px; font-size:14px; font-weight:600; text-decoration:none; margin-bottom:24px;">
              צפה בלייב עכשיו
            </a>
            <hr style="border:none; border-top:1px solid #eee; margin:24px 0;" />
            <p style="font-size:12px; color:#aaa;">קיבלת אימייל זה כי הפעלת התראות אימייל בפרופיל שלך ב-Caesar 0 DTE.</p>
          </div>
        `;

        const { error: emailError } = await supabase.functions.invoke('send-transactional-email', {
          body: {
            to: profile.email!,
            subject: `🔴 ${mentorName} עולה ללייב עכשיו — ${sessionTitle}`,
            html: emailHtml,
            message_id: `live-${session_id}-${profile.user_id}`,
            template_name: 'live-notification',
          },
        });

        if (emailError) {
          console.error(`Email error for ${profile.user_id}:`, emailError);
        } else {
          emailResults.push(profile.user_id);
        }
      } catch (e) {
        console.error(`Email error for ${profile.user_id}:`, e);
      }
    }

    return new Response(
      JSON.stringify({ email_sent: emailResults.length, email_recipients: emailResults }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('notify-live error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
