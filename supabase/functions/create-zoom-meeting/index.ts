/**
 * create-zoom-meeting — Server-to-Server OAuth edge function.
 *
 * Creates a Zoom meeting (instant or scheduled) on behalf of the platform account.
 * Pass `scheduled_at` (ISO string) to create a scheduled meeting (type 2).
 * Omit it for an instant meeting (type 1).
 *
 * Required Supabase secrets:
 *   ZOOM_ACCOUNT_ID    — from Zoom marketplace app
 *   ZOOM_CLIENT_ID     — from Zoom marketplace app
 *   ZOOM_CLIENT_SECRET — from Zoom marketplace app
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth: require valid Supabase session ──────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse request body ────────────────────────────────────────────
    const { title, scheduled_at } = await req.json() as {
      title?: string;
      scheduled_at?: string; // ISO 8601 — if provided, creates a scheduled meeting
    };

    if (!title?.trim()) {
      return new Response(JSON.stringify({ error: "Missing meeting title" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Zoom credentials ──────────────────────────────────────────────
    const accountId    = Deno.env.get("ZOOM_ACCOUNT_ID");
    const clientId     = Deno.env.get("ZOOM_CLIENT_ID");
    const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");

    if (!accountId || !clientId || !clientSecret) {
      return new Response(
        JSON.stringify({ error: "Zoom credentials not configured on server" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Step 1: get access token ──────────────────────────────────────
    const tokenRes = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    if (!tokenRes.ok) {
      console.error("Zoom token error:", await tokenRes.text());
      return new Response(
        JSON.stringify({ error: "Failed to authenticate with Zoom" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { access_token } = await tokenRes.json() as { access_token: string };

    // ── Step 2: create meeting (instant or scheduled) ─────────────────
    const isScheduled = !!scheduled_at;
    const meetingBody: Record<string, unknown> = {
      topic: title.trim(),
      type: isScheduled ? 2 : 1, // 1 = instant, 2 = scheduled
      settings: {
        join_before_host: true,
        waiting_room: false,
        mute_upon_entry: false,
        approval_type: 2,
      },
    };

    if (isScheduled) {
      meetingBody.start_time = scheduled_at; // ISO 8601, e.g. "2026-05-10T09:00:00Z"
      meetingBody.duration = 60;             // default 60 min; user can adjust in Zoom
      meetingBody.timezone = "Asia/Jerusalem";
    }

    const meetingRes = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(meetingBody),
    });

    if (!meetingRes.ok) {
      console.error("Zoom meeting creation error:", await meetingRes.text());
      return new Response(
        JSON.stringify({ error: "Failed to create Zoom meeting" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const meeting = await meetingRes.json() as {
      id: number;
      join_url: string;
      password: string;
      start_time?: string;
    };

    return new Response(
      JSON.stringify({
        meeting_id: meeting.id,
        join_url: meeting.join_url,
        password: meeting.password,
        start_time: meeting.start_time,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("create-zoom-meeting error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
