// Economic calendar scraper — pulls Investing.com weekly calendar via Firecrawl
// and returns structured events for the native UI.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const FIRECRAWL_API = "https://api.firecrawl.dev/v2/scrape";

interface EconomicEvent {
  id: string;
  date: string;          // YYYY-MM-DD
  time: string;          // HH:MM (24h, source TZ)
  country: string;       // ISO-ish name e.g. "United States"
  countryCode: string;   // 2-letter
  currency: string;      // USD, EUR ...
  importance: 1 | 2 | 3; // bull count
  event: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
}

// Map country name (from flag <span title="...">) → code/name
const COUNTRY_NAME_TO_CODE: Record<string, { code: string; name: string }> = {
  "United States": { code: "US", name: "United States" },
  "USA": { code: "US", name: "United States" },
  "Euro Zone": { code: "EU", name: "Euro Zone" },
  "European Union": { code: "EU", name: "Euro Zone" },
  "Germany": { code: "DE", name: "Germany" },
  "France": { code: "FR", name: "France" },
  "Italy": { code: "IT", name: "Italy" },
  "Spain": { code: "ES", name: "Spain" },
  "Netherlands": { code: "NL", name: "Netherlands" },
  "United Kingdom": { code: "GB", name: "United Kingdom" },
  "U.K.": { code: "GB", name: "United Kingdom" },
  "Britain": { code: "GB", name: "United Kingdom" },
  "Japan": { code: "JP", name: "Japan" },
  "China": { code: "CN", name: "China" },
  "Canada": { code: "CA", name: "Canada" },
  "Australia": { code: "AU", name: "Australia" },
  "New Zealand": { code: "NZ", name: "New Zealand" },
  "Switzerland": { code: "CH", name: "Switzerland" },
  "Israel": { code: "IL", name: "Israel" },
  "India": { code: "IN", name: "India" },
  "Brazil": { code: "BR", name: "Brazil" },
  "Mexico": { code: "MX", name: "Mexico" },
  "South Korea": { code: "KR", name: "South Korea" },
  "South Africa": { code: "ZA", name: "South Africa" },
  "Turkey": { code: "TR", name: "Turkey" },
  "Sweden": { code: "SE", name: "Sweden" },
  "Norway": { code: "NO", name: "Norway" },
  "Denmark": { code: "DK", name: "Denmark" },
  "Hong Kong": { code: "HK", name: "Hong Kong" },
  "Singapore": { code: "SG", name: "Singapore" },
  "Russia": { code: "RU", name: "Russia" },
};

// Fallback: currency → country (used only if title mapping fails)
const CURRENCY_TO_COUNTRY: Record<string, { code: string; name: string }> = {
  USD: { code: "US", name: "United States" },
  EUR: { code: "EU", name: "Euro Zone" },
  GBP: { code: "GB", name: "United Kingdom" },
  JPY: { code: "JP", name: "Japan" },
  CNY: { code: "CN", name: "China" },
  CAD: { code: "CA", name: "Canada" },
  AUD: { code: "AU", name: "Australia" },
  NZD: { code: "NZ", name: "New Zealand" },
  CHF: { code: "CH", name: "Switzerland" },
  ILS: { code: "IL", name: "Israel" },
  INR: { code: "IN", name: "India" },
  BRL: { code: "BR", name: "Brazil" },
  MXN: { code: "MX", name: "Mexico" },
  KRW: { code: "KR", name: "South Korea" },
  ZAR: { code: "ZA", name: "South Africa" },
  TRY: { code: "TR", name: "Turkey" },
  SEK: { code: "SE", name: "Sweden" },
  NOK: { code: "NO", name: "Norway" },
  DKK: { code: "DK", name: "Denmark" },
  HKD: { code: "HK", name: "Hong Kong" },
  SGD: { code: "SG", name: "Singapore" },
  RUB: { code: "RU", name: "Russia" },
};

function parseHtmlEvents(html: string): EconomicEvent[] {
  const events: EconomicEvent[] = [];
  // Investing widget uses <tr id="eventRowId_NNN"> rows with class "js-event-item"
  const rowRegex = /<tr[^>]*event_attr_id="(\d+)"[^>]*event_timestamp="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g;

  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(html)) !== null) {
    const id = m[1];
    const timestamp = m[2]; // "YYYY-MM-DD HH:MM:SS"
    const inner = m[3];

    const [datePart, timePart] = timestamp.split(" ");
    const time = timePart ? timePart.slice(0, 5) : "";

    // currency
    const curMatch = inner.match(/<td[^>]*class="[^"]*flagCur[^"]*"[^>]*>\s*<span[^>]*title="([^"]*)"[^>]*><\/span>\s*([A-Z]{3})/);
    const currency = curMatch ? curMatch[2] : (inner.match(/>\s*([A-Z]{3})\s*</)?.[1] ?? "");
    const countryFromTitle = curMatch?.[1] ?? "";

    // importance — count bull1 icons
    const sentimentBlock = inner.match(/class="[^"]*sentiment[^"]*"[\s\S]*?(?=<\/td>)/)?.[0] ?? "";
    const bulls = (sentimentBlock.match(/bull1|grayFullBullishIcon|redFullBullishIcon/g) ?? []).length;
    const importance = (Math.min(3, Math.max(1, bulls)) || 1) as 1 | 2 | 3;

    // event name — anchor inside event cell
    const eventMatch = inner.match(/<td[^>]*class="[^"]*event[^"]*"[^>]*>([\s\S]*?)<\/td>/);
    let eventName = "";
    if (eventMatch) {
      const a = eventMatch[1].match(/<a[^>]*>([\s\S]*?)<\/a>/);
      eventName = (a ? a[1] : eventMatch[1])
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .trim();
    }

    // actual / forecast / previous
    const cellText = (cls: string) => {
      const r = inner.match(new RegExp(`<td[^>]*class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)<\\/td>`));
      if (!r) return null;
      const txt = r[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
      return txt.length ? txt : null;
    };

    const actual = cellText("act");
    const forecast = cellText("fore");
    const previous = cellText("prev");

    const meta = CURRENCY_TO_COUNTRY[currency] ?? { code: "", name: countryFromTitle || currency };

    events.push({
      id,
      date: datePart,
      time,
      country: meta.name,
      countryCode: meta.code,
      currency,
      importance,
      event: eventName,
      actual,
      forecast,
      previous,
    });
  }

  return events;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");

    // Investing widget — week view, importance 1-3, multi country
    const widgetUrl =
      "https://sslecal2.investing.com?columns=exc_flags,exc_currency,exc_importance,exc_actual,exc_forecast,exc_previous&category=_employment,_economicActivity,_inflation,_credit,_centralBanks,_confidenceIndex,_balance,_Bonds&importance=1,2,3&features=datepicker,timezone&countries=5,72,4,17,37,32,12,6,22,11,35,25,178&calType=week&timeZone=15&lang=1";

    const fcRes = await fetch(FIRECRAWL_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: widgetUrl,
        formats: ["rawHtml"],
        onlyMainContent: false,
        waitFor: 2500,
      }),
    });

    const fcJson = await fcRes.json();
    if (!fcRes.ok) {
      throw new Error(`Firecrawl error ${fcRes.status}: ${JSON.stringify(fcJson)}`);
    }

    const html: string =
      fcJson?.data?.rawHtml ??
      fcJson?.rawHtml ??
      fcJson?.data?.html ??
      fcJson?.html ??
      "";

    if (!html) throw new Error("Empty HTML from Firecrawl");

    const events = parseHtmlEvents(html);

    return new Response(
      JSON.stringify({ success: true, events, count: events.length, fetchedAt: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("fetch-economic-calendar error", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
