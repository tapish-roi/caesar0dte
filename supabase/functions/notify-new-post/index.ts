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

    // Fetch all community members with their notification preferences
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
      .select('user_id, full_name, email, phone, notify_sms, notify_email')
      .in('user_id', studentIds);

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const postPreview = post.content.length > 120 ? post.content.substring(0, 120) + '...' : post.content;
    const messageBody = `פוסט חדש מ${mentorName}:\n${postPreview}`;

    const smsResults: string[] = [];
    const emailResults: string[] = [];

    // ─── SMS via Twilio ───────────────────────────────────────────────────────
    const twilioApiKey = Deno.env.get('TWILIO_API_KEY');
    const twilioFrom = Deno.env.get('TWILIO_FROM_NUMBER');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (twilioApiKey && twilioFrom && lovableApiKey) {
      const smsRecipients = profiles.filter((p) => p.notify_sms && p.phone);

      for (const profile of smsRecipients) {
        try {
          const phone = profile.phone!.replace(/[^\d+]/g, '');
          const normalizedPhone = phone.startsWith('0') ? '+972' + phone.slice(1) : phone;

          const response = await fetch('https://connector-gateway.lovable.dev/twilio/Messages.json', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${lovableApiKey}`,
              'X-Connection-Api-Key': twilioApiKey,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              To: normalizedPhone,
              From: twilioFrom,
              Body: messageBody,
            }),
          });

          if (response.ok) {
            smsResults.push(profile.user_id);
          } else {
            const errBody = await response.text();
            console.error(`SMS failed for ${profile.user_id}: ${response.status} ${errBody}`);
          }
        } catch (e) {
          console.error(`SMS error for ${profile.user_id}:`, e);
        }
      }
    } else {
      console.log('Twilio not configured — skipping SMS notifications');
    }

    // ─── Email ────────────────────────────────────────────────────────────────
    // Email notifications will be sent once an email domain is configured.
    // For now, log which users would receive emails.
    const emailRecipients = profiles.filter((p) => p.notify_email && p.email);
    for (const profile of emailRecipients) {
      // TODO: Wire to send-transactional-email once email domain is set up
      console.log(`Would send email to: ${profile.email} — ${messageBody}`);
      emailResults.push(profile.user_id);
    }

    return new Response(
      JSON.stringify({
        sms_sent: smsResults.length,
        email_queued: emailResults.length,
        sms_recipients: smsResults,
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
