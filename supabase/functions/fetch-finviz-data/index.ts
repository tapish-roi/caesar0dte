// fetch-finviz-data — Scrape Prev Close + ATR(14) from Finviz for a batch of tickers.
// Validates JWT, throttles requests (500ms), upserts into stock_atr_data.
//
// "Prev Close", never "Price": the stored value must be the prior session's
// close. Finviz's "Price" field is the live/last trade, so during market hours
// it drifts all day and every ATR level derived from it drifts with it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_TICKERS = ["NFLX", "ORCL", "GOOG", "PLTR", "PANW", "OKLO"];
const MAX_TICKERS = 20;
const TICKER_REGEX = /^[A-Z]{1,5}$/;

interface StockData {
  ticker: string;
  closePrice: number;
  atr: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const prevCloseRe =
  /snapshot-td-label">Prev Close<\/div><\/td>\s*<td[^>]*>.*?<b>([0-9,]+\.?\d*)<\/b>/is;
const atrRe =
  /snapshot-td-label">ATR\s*\(14\)<\/div><\/td>\s*<td[^>]*>.*?<b>([0-9,]+\.?\d*)<\/b>/is;

function parseSnapshotValue(html: string, re: RegExp): number | null {
  const m = html.match(re);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function todayInUsEastern(): string {
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function fetchFinviz(ticker: string): Promise<StockData | null> {
  const url = `https://finviz.com/quote.ashx?t=${encodeURIComponent(ticker)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });
    if (!res.ok) {
      console.warn(`Finviz ${ticker}: HTTP ${res.status}, skipping`);
      return null;
    }
    const html = await res.text();
    const closePrice = parseSnapshotValue(html, prevCloseRe);
    const atr = parseSnapshotValue(html, atrRe);
    // One bad ticker must never fail the whole batch.
    if (closePrice === null || atr === null) {
      console.warn(
        `Finviz ${ticker}: failed to parse prev close/atr, skipping`,
      );
      return null;
    }
    return { ticker, closePrice, atr };
  } catch (e) {
    console.error(`Finviz ${ticker} fetch error`, e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── JWT validation ───────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Input validation ─────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    let tickers: unknown = body?.tickers;
    if (tickers === undefined) tickers = DEFAULT_TICKERS;

    if (!Array.isArray(tickers)) {
      return new Response(
        JSON.stringify({ success: false, error: "tickers must be an array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (tickers.length > MAX_TICKERS) {
      return new Response(
        JSON.stringify({ success: false, error: `max ${MAX_TICKERS} tickers per request` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const valid = Array.from(
      new Set(
        tickers
          .map((t) => (typeof t === "string" ? t.trim().toUpperCase() : ""))
          .filter((t) => TICKER_REGEX.test(t)),
      ),
    );
    if (valid.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "no valid tickers" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Sequential scrape with throttle ──────────────────────────────────────
    const dataDate = todayInUsEastern();
    const admin = createClient(supabaseUrl, serviceKey);
    const results: StockData[] = [];

    for (let i = 0; i < valid.length; i++) {
      const t = valid[i];
      const result = await fetchFinviz(t);
      if (result) {
        results.push(result);
        const { error: upsertErr } = await admin.from("stock_atr_data").upsert(
          {
            ticker: result.ticker,
            data_date: dataDate,
            close_price: result.closePrice,
            atr: result.atr,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "ticker,data_date" },
        );
        if (upsertErr) console.error(`upsert ${t}`, upsertErr);
      }
      if (i < valid.length - 1) await sleep(500);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `fetched ${results.length}/${valid.length} tickers`,
        data: results,
        date: dataDate,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("fetch-finviz-data error", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
