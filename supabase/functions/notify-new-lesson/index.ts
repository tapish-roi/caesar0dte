import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Emails a mentor's students when a lesson is published, but only students who
// can actually see the lesson's category. Category access mirrors the UI rule:
// a student with NO grants for this mentor sees ALL categories; a student WITH
// any grant sees only the categories granted to them. Uncategorized lessons go
// to every member. Recipients get the email regardless of their personal
// email-notification preference — the mentor's per-lesson switch is the opt-in.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { lesson_id, mentor_id, siteUrl } = await req.json();

    if (!lesson_id || !mentor_id) {
      return new Response(JSON.stringify({ error: 'Missing lesson_id or mentor_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch the lesson. Guard: it must belong to this mentor and be published.
    const { data: lesson } = await supabase
      .from('lessons')
      .select('id, title, category_id, mentor_id, is_published')
      .eq('id', lesson_id)
      .single();

    if (!lesson || lesson.mentor_id !== mentor_id) {
      return new Response(JSON.stringify({ error: 'Lesson not found for this mentor' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!lesson.is_published) {
      return new Response(JSON.stringify({ error: 'Lesson is not published' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Category title (null for uncategorized lessons).
    let categoryTitle: string | null = null;
    if (lesson.category_id) {
      const { data: category } = await supabase
        .from('categories')
        .select('title')
        .eq('id', lesson.category_id)
        .single();
      categoryTitle = category?.title ?? null;
    }

    // Mentor display name.
    const { data: mentorProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', mentor_id)
      .single();
    const mentorName = mentorProfile?.full_name ?? 'המנטור שלך';

    // All students in this mentor's community.
    const { data: members } = await supabase
      .from('community_members')
      .select('student_id')
      .eq('mentor_id', mentor_id);

    if (!members || members.length === 0) {
      return new Response(JSON.stringify({ email_sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const studentIds = members.map((m) => m.student_id);

    // Category-access filter (see header comment). Only needed when the lesson
    // is in a category; uncategorized lessons reach everyone.
    let allowedStudentIds = new Set<string>(studentIds);
    if (lesson.category_id) {
      const { data: grants } = await supabase
        .from('student_category_access')
        .select('student_id, category_id')
        .eq('mentor_id', mentor_id);

      const studentsWithAnyGrant = new Set<string>();
      const studentsWithThisCategory = new Set<string>();
      for (const g of grants ?? []) {
        studentsWithAnyGrant.add(g.student_id);
        if (g.category_id === lesson.category_id) studentsWithThisCategory.add(g.student_id);
      }
      allowedStudentIds = new Set(
        studentIds.filter((sid) => !studentsWithAnyGrant.has(sid) || studentsWithThisCategory.has(sid))
      );
    }

    if (allowedStudentIds.size === 0) {
      return new Response(JSON.stringify({ email_sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Emails for the allowed students.
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name, email')
      .in('user_id', [...allowedStudentIds]);

    const recipients = (profiles ?? []).filter((p) => !!p.email);
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ email_sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const link = typeof siteUrl === 'string' && siteUrl.startsWith('http')
      ? siteUrl
      : 'https://tapish-roi.github.io/caesar0dte/';
    const categoryLine = categoryTitle
      ? `<p style="color:#555;line-height:1.6;margin:0 0 4px;">בקטגוריה: <strong>${categoryTitle}</strong></p>`
      : '';

    const emailResults: string[] = [];
    for (const profile of recipients) {
      try {
        const emailHtml = `
          <div dir="rtl" style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111;">
            <h2 style="color:#111; margin:0 0 12px;">${mentorName} העלה שיעור חדש</h2>
            <p style="color:#333; font-size:16px; line-height:1.6; margin:0 0 4px;"><strong>${lesson.title}</strong></p>
            ${categoryLine}
            <p style="color:#555; line-height:1.6; margin:12px 0 20px;">היכנס/י לפלטפורמה כדי לצפות בשיעור.</p>
            <a href="${link}" style="display:inline-block; background:#e2b54e; color:#1a1206; text-decoration:none; font-weight:700; padding:12px 24px; border-radius:10px;">כניסה לפלטפורמה</a>
            <hr style="border:none; border-top:1px solid #eee; margin:24px 0;" />
            <p style="font-size:12px; color:#aaa;">קיבלת אימייל זה כי אתה חבר בקהילה של ${mentorName} ב-Caesar 0 DTE.</p>
          </div>
        `;

        const { error: emailError } = await supabase.functions.invoke('send-transactional-email', {
          body: {
            to: profile.email!,
            subject: `שיעור חדש: ${lesson.title}`,
            html: emailHtml,
            message_id: `new-lesson-${lesson_id}-${profile.user_id}`,
            template_name: 'new-lesson',
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

    return new Response(
      JSON.stringify({ email_sent: emailResults.length, email_recipients: emailResults }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('notify-new-lesson error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
