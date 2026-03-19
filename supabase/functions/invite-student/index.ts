import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Send a branded invite email using Lovable's email API
async function sendInviteEmail(opts: {
  to: string;
  mentorName: string;
  inviteUrl: string;
  lovableApiKey: string;
  callbackUrl: string;
}) {
  const { to, mentorName, inviteUrl, lovableApiKey, callbackUrl } = opts;

  const subject = `הוזמנת להצטרף לקהילה של ${mentorName} ב-TradeLearn`;

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:Arial,sans-serif;direction:rtl;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background-color:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,0.4);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#10b981,#059669);padding:32px 40px;text-align:center;">
              <div style="display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.15);border-radius:12px;width:52px;height:52px;margin-bottom:16px;">
                <span style="font-size:28px;">📈</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.3px;">TradeLearn</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">פלטפורמת מנטורינג למסחר מקצועי</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 12px;color:#f1f5f9;font-size:20px;font-weight:700;">הוזמנת לקהילה! 🎉</h2>
              <p style="margin:0 0 20px;color:#94a3b8;font-size:15px;line-height:1.6;">
                <strong style="color:#f1f5f9;">${mentorName}</strong> מזמין/ת אותך להצטרף לקהילת הלומדים שלו/ה ב-TradeLearn.
              </p>
              <p style="margin:0 0 32px;color:#94a3b8;font-size:14px;line-height:1.6;">
                בקהילה תקבל/י גישה לשיעורים, שידורים חיים, קוויזים ועוד — הכל בהנחיית ${mentorName}.
              </p>
              <!-- CTA Button -->
              <div style="text-align:center;margin-bottom:32px;">
                <a href="${inviteUrl}"
                   style="display:inline-block;background:linear-gradient(135deg,#10b981,#059669);color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 40px;border-radius:10px;letter-spacing:0.3px;">
                  הצטרף/י לקהילה
                </a>
              </div>
              <!-- Note -->
              <p style="margin:0 0 8px;color:#64748b;font-size:12px;text-align:center;">
                הקישור תקף ל-24 שעות. אם לא ביקשת הזמנה זו, תוכל/י להתעלם מהמייל הזה.
              </p>
              <p style="margin:0;color:#475569;font-size:11px;text-align:center;word-break:break-all;">
                ${inviteUrl}
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #334155;text-align:center;">
              <p style="margin:0;color:#475569;font-size:12px;">
                © TradeLearn — פלטפורמת מנטורינג למסחר מקצועי
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const response = await fetch(callbackUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${lovableApiKey}`,
    },
    body: JSON.stringify({
      to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Email send failed (${response.status}): ${text}`);
  }

  return response.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

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

    // Check if user already exists
    const { data: allUsers } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = allUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    let studentId: string;
    let inviteLink: string;

    if (existingUser) {
      // Existing user — ensure they have student role and send password reset
      studentId = existingUser.id;

      await adminClient.from('user_roles').upsert(
        { user_id: studentId, role: 'student' },
        { onConflict: 'user_id,role' }
      );

      // Generate a password-reset link (so they can log in / set new password)
      const resetRedirectTo = `${appUrl}/accept-invite?mentor=${encodeURIComponent(mentorName)}&mentor_id=${encodeURIComponent(mentorId)}&email=${encodeURIComponent(email)}`;
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: resetRedirectTo },
      });
      if (linkError || !linkData?.properties?.action_link) {
        throw new Error(`Failed to generate link: ${linkError?.message}`);
      }
      inviteLink = linkData.properties.action_link;
      console.log('Generated recovery link for existing user:', email);
    } else {
      // New user — generate invite link (creates account + link, no auto-email)
      const inviteRedirectTo = `${appUrl}/accept-invite?mentor=${encodeURIComponent(mentorName)}&mentor_id=${encodeURIComponent(mentorId)}&email=${encodeURIComponent(email)}`;
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          redirectTo: inviteRedirectTo,
          data: { role: 'student', mentor_name: mentorName },
        },
      });
      if (linkError || !linkData?.properties?.action_link) {
        throw new Error(`Failed to generate invite link: ${linkError?.message}`);
      }
      inviteLink = linkData.properties.action_link;
      studentId = linkData.user.id;
      console.log('Generated invite link for new student:', email, studentId);
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

    // Send custom branded email if LOVABLE_API_KEY is available
    if (lovableApiKey) {
      try {
        // Lovable email API callback URL
        const callbackUrl = `https://api.lovable.app/api/send-email`;
        await sendInviteEmail({
          to: email,
          mentorName,
          inviteUrl: inviteLink,
          lovableApiKey,
          callbackUrl,
        });
        console.log('Sent branded invite email to:', email);
      } catch (emailErr) {
        // Don't fail the whole request if email send fails — the link still works
        console.error('Failed to send branded email, falling back:', emailErr);
      }
    } else {
      console.log('No LOVABLE_API_KEY — invite link generated but email not sent:', inviteLink);
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
