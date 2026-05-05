/**
 * invite-student — Sends a branded invitation email via Resend.
 *
 * Replaces Supabase's default invite/recovery emails with a fully custom
 * Hebrew RTL HTML template sent from our own branded sender address.
 *
 * Required Supabase secrets:
 *   RESEND_API_KEY            — Resend API key (https://resend.com/api-keys)
 *   SUPABASE_URL              — auto-populated
 *   SUPABASE_SERVICE_ROLE_KEY — auto-populated
 *   SUPABASE_ANON_KEY         — auto-populated
 *
 * Branding: edit FROM_EMAIL once you verify a domain in Resend
 * (e.g. 'Caesar 0DTE Lab <noreply@caesar0dte.com>').
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Branding ──────────────────────────────────────────────────────────────
// Until you verify a domain in Resend, sandbox sender ONLY delivers to your
// own Resend signup email. Swap to `noreply@yourdomain.com` after verifying.
const FROM_EMAIL = 'Caesar 0DTE Lab <onboarding@resend.dev>';
const APP_NAME   = 'Caesar 0DTE Lab';

// ── Email template (Hebrew RTL, dark space-themed) ────────────────────────
function buildInviteEmailHtml(opts: { mentorName: string; acceptUrl: string; isExisting: boolean }) {
  const { mentorName, acceptUrl, isExisting } = opts;
  const headline = isExisting ? 'הוזמנת להצטרף לקהילה' : 'הוזמנת לקהילה';
  const cta      = isExisting ? 'אפס סיסמה והצטרף' : 'הגדר סיסמה והצטרף';
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#0b0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#e6e9f2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0f1a;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:linear-gradient(135deg,#0f1525 0%,#1a1230 100%);border-radius:16px;overflow:hidden;border:1px solid rgba(120,150,255,0.18);">
        <tr><td style="padding:36px 40px;text-align:center;background:linear-gradient(135deg,rgba(80,120,255,0.14),rgba(180,80,255,0.10));border-bottom:1px solid rgba(120,150,255,0.15);">
          <h1 style="margin:0;font-size:26px;font-weight:700;color:#fff;letter-spacing:-0.02em;">${APP_NAME}</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <h2 style="margin:0 0 18px 0;font-size:22px;font-weight:600;color:#fff;">${headline}</h2>
          <p style="margin:0 0 14px 0;font-size:16px;line-height:1.7;color:#c5cad8;">
            <strong style="color:#fff;">${mentorName}</strong> הזמין אותך להצטרף לקהילה ב-${APP_NAME}.
          </p>
          <p style="margin:0 0 32px 0;font-size:16px;line-height:1.7;color:#c5cad8;">
            לחץ על הכפתור למטה כדי להגדיר את הסיסמה שלך ולהיכנס למערכת.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr><td align="center" style="border-radius:10px;background:linear-gradient(135deg,#5b8cff,#9b66ff);">
              <a href="${acceptUrl}" style="display:inline-block;padding:14px 40px;font-size:15px;font-weight:600;color:#fff;text-decoration:none;border-radius:10px;">${cta}</a>
            </td></tr>
          </table>
          <p style="margin:36px 0 0 0;font-size:13px;line-height:1.7;color:#7a8099;">
            אם הכפתור לא עובד, העתק את הקישור הבא לדפדפן:<br>
            <span style="word-break:break-all;color:#9aa3bf;">${acceptUrl}</span>
          </p>
        </td></tr>
        <tr><td style="padding:18px 40px;background:rgba(0,0,0,0.25);border-top:1px solid rgba(120,150,255,0.1);text-align:center;">
          <p style="margin:0;font-size:12px;color:#5e6478;">אם לא ציפית למייל זה, ניתן להתעלם ממנו.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendViaResend(to: string, subject: string, html: string, apiKey: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend API error (${res.status}): ${errText}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // ── Auth ────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized');

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!;
    const resendApiKey   = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) throw new Error('Email service not configured (RESEND_API_KEY missing)');

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) throw new Error('Unauthorized');

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Require mentor role
    const { data: roleRow } = await adminClient
      .from('user_roles').select('role')
      .eq('user_id', caller.id).eq('role', 'mentor').maybeSingle();
    if (!roleRow) throw new Error('Only mentors can invite students');

    // ── Parse request ───────────────────────────────────────────────────
    const { inviteId, email, mentorId } = await req.json();
    if (!inviteId || !email || !mentorId) throw new Error('Missing required fields');
    if (mentorId !== caller.id) throw new Error('Forbidden');

    const appUrl = req.headers.get('origin') || 'https://caesar0dte.lovable.app';

    const { data: mentorProfile } = await adminClient
      .from('profiles').select('full_name').eq('user_id', mentorId).maybeSingle();
    const mentorName = mentorProfile?.full_name ?? 'המנטור שלך';

    const redirectTo = `${appUrl}/accept-invite?mentor=${encodeURIComponent(mentorName)}&mentor_id=${encodeURIComponent(mentorId)}&email=${encodeURIComponent(email)}`;

    // ── Existing vs new user ────────────────────────────────────────────
    const { data: allUsers } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = allUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    let studentId: string;
    let actionLink: string;
    const isExisting = !!existingUser;

    if (existingUser) {
      studentId = existingUser.id;
      await adminClient.from('user_roles').upsert(
        { user_id: studentId, role: 'student' },
        { onConflict: 'user_id,role' }
      );

      // Generate recovery link WITHOUT sending Supabase's default email
      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
      });
      if (linkErr || !linkData?.properties?.action_link) {
        throw new Error(`Failed to generate recovery link: ${linkErr?.message ?? 'unknown'}`);
      }
      actionLink = linkData.properties.action_link;
    } else {
      // Generate invite link WITHOUT sending Supabase's default email
      // (also creates the user record automatically)
      const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          redirectTo,
          data: { role: 'student', mentor_name: mentorName },
        },
      });
      if (linkErr || !linkData?.user?.id || !linkData?.properties?.action_link) {
        throw new Error(`Failed to generate invite link: ${linkErr?.message ?? 'unknown'}`);
      }
      studentId  = linkData.user.id;
      actionLink = linkData.properties.action_link;
    }

    // ── Send branded email via Resend ───────────────────────────────────
    await sendViaResend(
      email,
      `${mentorName} הזמין אותך ל-${APP_NAME}`,
      buildInviteEmailHtml({ mentorName, acceptUrl: actionLink, isExisting }),
      resendApiKey,
    );

    // ── Ensure profile + role + invite record ───────────────────────────
    await adminClient.from('profiles').upsert(
      { user_id: studentId, full_name: email.split('@')[0], email },
      { onConflict: 'user_id' }
    );

    await adminClient.from('user_roles').upsert(
      { user_id: studentId, role: 'student' },
      { onConflict: 'user_id,role' }
    );

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
