/**
 * zoom-webhook — Receives Zoom webhook events and updates zoom_sessions.
 *
 * Handles:
 *   - endpoint.url_validation  → HMAC challenge (required by Zoom on first setup)
 *   - meeting.ended            → marks the matching zoom_session as 'ended'
 *
 * Required Supabase secrets:
 *   ZOOM_WEBHOOK_SECRET_TOKEN  — from Zoom app → Feature → Event Subscriptions → Secret Token
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-zm-signature, x-zm-request-timestamp',
};

async function verifyZoomSignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
): Promise<boolean> {
  const message = `v0:${timestamp}:${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const hexSig = 'v0=' + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hexSig === signature;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const secretToken = Deno.env.get('ZOOM_WEBHOOK_SECRET_TOKEN');
  const rawBody = await req.text();
  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Bad JSON', { status: 400, headers: corsHeaders });
  }

  const event = payload.event as string;

  // ── Zoom URL validation challenge (one-time, on webhook setup) ────────
  if (event === 'endpoint.url_validation') {
    const plainToken = (payload.payload as Record<string, string>)?.plainToken;
    if (!secretToken || !plainToken) {
      return new Response(JSON.stringify({ error: 'Missing token' }), { status: 400, headers: corsHeaders });
    }
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secretToken),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(plainToken));
    const encryptedToken = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    return new Response(
      JSON.stringify({ plainToken, encryptedToken }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── Verify signature for all other events ─────────────────────────────
  if (secretToken) {
    const timestamp = req.headers.get('x-zm-request-timestamp') ?? '';
    const signature = req.headers.get('x-zm-signature') ?? '';
    const valid = await verifyZoomSignature(secretToken, timestamp, rawBody, signature);
    if (!valid) {
      console.warn('Invalid Zoom webhook signature');
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401, headers: corsHeaders });
    }
  }

  // ── Handle meeting.ended ──────────────────────────────────────────────
  if (event === 'meeting.ended') {
    const meetingObj = (payload.payload as Record<string, Record<string, unknown>>)?.object;
    const meetingId = String(meetingObj?.id ?? '');

    if (!meetingId) {
      return new Response('Missing meeting id', { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('zoom_sessions') as any)
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('meeting_id', meetingId)
      .eq('status', 'active');

    if (error) {
      console.error('Failed to end zoom session:', error.message);
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }

    console.log(`Meeting ${meetingId} ended — session closed`);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
