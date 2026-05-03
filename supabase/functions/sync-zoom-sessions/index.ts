/**
 * sync-zoom-sessions — Polls the Zoom API to close any sessions
 * whose meeting has already ended (fallback for missed webhooks).
 *
 * Called by ZoomHub on every refetch (every 15 s).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getZoomToken(): Promise<string> {
  const accountId   = Deno.env.get('ZOOM_ACCOUNT_ID')!;
  const clientId    = Deno.env.get('ZOOM_CLIENT_ID')!;
  const clientSecret = Deno.env.get('ZOOM_CLIENT_SECRET')!;

  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );
  if (!res.ok) throw new Error('Failed to get Zoom token');
  const { access_token } = await res.json() as { access_token: string };
  return access_token;
}

/** Returns true if the Zoom meeting is still live (started / waiting). */
async function isMeetingActive(token: string, meetingId: string): Promise<boolean> {
  const res = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return false; // meeting deleted / never existed
  if (!res.ok) return true;             // unknown error → assume still active
  const data = await res.json() as { status?: string };
  // status values: "waiting" | "started" | "ended"
  return data.status !== 'ended';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Fetch all active sessions that have a meeting_id to check
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sessions, error } = await (supabase.from('zoom_sessions') as any)
      .select('id, meeting_id')
      .eq('status', 'active')
      .not('meeting_id', 'is', null);

    if (error) throw error;
    if (!sessions || sessions.length === 0) {
      return new Response(JSON.stringify({ closed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = await getZoomToken();
    let closed = 0;

    for (const session of sessions as { id: string; meeting_id: string }[]) {
      const active = await isMeetingActive(token, session.meeting_id);
      if (!active) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('zoom_sessions') as any)
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('id', session.id);
        closed++;
        console.log(`Auto-closed session ${session.id} (meeting ${session.meeting_id})`);
      }
    }

    return new Response(JSON.stringify({ closed }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('sync-zoom-sessions error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
