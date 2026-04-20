// Fetch ATR + price for a ticker from Finviz, with daily caching in stock_atr_data.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface FinvizSnapshot {
  price: number | null;
  atr: number | null;
  raw: Record<string, string>;
}

function parseFinvizSnapshot(html: string): FinvizSnapshot {
  // Finviz quote page contains a table with class "snapshot-table2".
  // Extract every <td>...</td> as alternating label/value cells.
  const tableMatch = html.match(
    /<table[^>]*snapshot-table2[^>]*>([\s\S]*?)<\/table>/i,
  );
  if (!tableMatch) return { price: null, atr: null, raw: {} };

  const cells = [...tableMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
    (m) =>
      m[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .trim(),
  );

  const raw: Record<string, string> = {};
  for (let i = 0; i < cells.length - 1; i += 2) {
    raw[cells[i]] = cells[i + 1];
  }

  const num = (v?: string) => {
    if (!v) return null;
    const n = parseFloat(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  };

  return {
    price: num(raw["Price"]) ?? num(raw["Prev Close"]),
    atr: num(raw["ATR"]) ?? num(raw["ATR (14)"]),
    raw,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth check
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const tickerRaw = String(body.ticker ?? "").trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(tickerRaw)) {
      return new Response(JSON.stringify({ error: "Invalid ticker" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const today = new Date().toISOString().slice(0, 10);

    // 1. Try cache (today's row)
    const { data: cached } = await admin
      .from("stock_atr_data")
      .select("ticker, price, atr, date, fetched_at")
      .eq("ticker", tickerRaw)
      .eq("date", today)
      .maybeSingle();

    if (cached && cached.atr !== null) {
      return new Response(
        JSON.stringify({ ...cached, source: "cache" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 2. Fetch from Finviz
    const url = `https://finviz.com/quote.ashx?t=${encodeURIComponent(tickerRaw)}&p=d`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          error: `Finviz returned ${res.status}`,
          ticker: tickerRaw,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const html = await res.text();
    const snap = parseFinvizSnapshot(html);

    if (snap.price === null && snap.atr === null) {
      return new Response(
        JSON.stringify({
          error: "Could not parse Finviz response (ticker may not exist)",
          ticker: tickerRaw,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 3. Upsert cache
    await admin.from("stock_atr_data").upsert(
      {
        ticker: tickerRaw,
        date: today,
        price: snap.price,
        atr: snap.atr,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "ticker,date" },
    );

    return new Response(
      JSON.stringify({
        ticker: tickerRaw,
        date: today,
        price: snap.price,
        atr: snap.atr,
        source: "finviz",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("fetch-atr error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
