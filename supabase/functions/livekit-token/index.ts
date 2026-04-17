import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { AccessToken } from "https://esm.sh/livekit-server-sdk@2.7.2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TokenRequest {
  sessionId: string;
  displayName?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth
      .getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const body = (await req.json()) as TokenRequest;
    const { sessionId, displayName } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return new Response(JSON.stringify({ error: "Missing sessionId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role to bypass RLS for session lookup + role check
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify session exists
    const { data: session, error: sessionError } = await serviceClient
      .from("live_sessions")
      .select("id, mentor_id, status")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user role
    const { data: userRole } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    const isMentor = session.mentor_id === userId ||
      userRole?.role === "mentor";

    // Get profile name as fallback
    let resolvedName = displayName;
    if (!resolvedName) {
      const { data: profile } = await serviceClient
        .from("profiles")
        .select("full_name")
        .eq("user_id", userId)
        .maybeSingle();
      resolvedName = profile?.full_name ?? "Guest";
    }

    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL");

    if (!apiKey || !apiSecret || !livekitUrl) {
      console.error("Missing LiveKit env vars");
      return new Response(
        JSON.stringify({ error: "LiveKit not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: resolvedName,
      ttl: 60 * 60 * 6, // 6 hours
      metadata: JSON.stringify({
        role: isMentor ? "mentor" : "student",
        sessionMentorId: session.mentor_id,
      }),
    });

    at.addGrant({
      room: sessionId,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // Mentors get admin powers (mute others, remove participants, update room)
      roomAdmin: isMentor,
      roomCreate: isMentor,
    });

    const jwt = await at.toJwt();

    return new Response(
      JSON.stringify({
        token: jwt,
        url: livekitUrl,
        identity: userId,
        role: isMentor ? "mentor" : "student",
        name: resolvedName,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("livekit-token error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
