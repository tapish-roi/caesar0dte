/**
 * create-zoom-meeting — Server-to-Server OAuth edge function.
 *
 * Creates an instant Zoom meeting on behalf of the platform account
 * and returns the join URL + meeting ID.
 *
 * Required Supabase secrets (set via Dashboard → Settings → Edge Functions):
 *   ZOOM_ACCOUNT_ID   — from Zoom marketplace app
 *   ZOOM_CLIENT_ID    — from Zoom marketplace app
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
    const { title } = await req.json() as { title?: string };
    if (!title?.trim()) {
      return new Response(JSON.stringify({ error: "Missing meeting title" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Zoom credentials ──────────────────────────────────────────────
    const accountId = Deno.env.get("ZOOM_ACCOUNT_ID");
    const clientId = Deno.env.get("ZOOM_CLIENT_ID");
    const clientSecret = Deno.env.get("ZOOM_CLIENT_SECRET");

    if (!accountId || !clientId || !clientSecret) {
      console.error("Missing Zoom env vars");
      return new Response(
        JSON.stringify({ error: "Zoom credentials not configured on server" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Step 1: get access token via Server-to-Server OAuth ───────────
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
      const err = await tokenRes.text();
      console.error("Zoom token error:", err);
      return new Response(
        JSON.stringify({ error: "Failed to authenticate with Zoom" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { access_token } = await tokenRes.json() as { access_token: string };

    // ── Step 2: create instant meeting ────────────────────────────────
    const meetingRes = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: title.trim(),
        type: 1, // instant meeting
        settings: {
          join_before_host: true,
          waiting_room: false,
          mute_upon_entry: false,
          approval_type: 2, // no registration required
        },
      }),
    });

    if (!meetingRes.ok) {
      const err = await meetingRes.text();
      console.error("Zoom meeting creation error:", err);
      return new Response(
        JSON.stringify({ error: "Failed to create Zoom meeting" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const meeting = await meetingRes.json() as {
      id: number;
      join_url: string;
      password: string;
    };

    return new Response(
      JSON.stringify({
        meeting_id: meeting.id,
        join_url: meeting.join_url,
        password: meeting.password,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
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
