// supabase/functions/holidays/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/*
  IMPORTANT:
  Supabase forbids env names starting with SUPABASE_.
  So we use custom names instead.
*/
const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

const supabase = createClient(PROJECT_URL, SERVICE_ROLE_KEY);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

serve(async (req) => {
  try {
    const url = new URL(req.url);

    const country = (url.searchParams.get("country") || "NO").toUpperCase();
    const year = Number(
      url.searchParams.get("year") || new Date().getUTCFullYear()
    );

    // =====================================================
    // 1) Check cache first
    // =====================================================
    const { data: cached, error: cacheErr } = await supabase
      .from("holiday_cache")
      .select("fetched_at, payload")
      .eq("country", country)
      .eq("year", year)
      .maybeSingle();

    if (cacheErr) return json({ error: cacheErr.message }, 500);

    if (cached?.payload && cached?.fetched_at) {
      const fetchedAt = new Date(cached.fetched_at);
      const ageDays = Math.abs(daysBetween(new Date(), fetchedAt));

      // use cache for 7 days
      if (ageDays <= 7) {
        return json({
          country,
          year,
          source: "cache",
          holidays: cached.payload,
        });
      }
    }

    // =====================================================
    // 2) Fetch from FREE public API (Nager.Date)
    // =====================================================
    const apiUrl = `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`;

    const resp = await fetch(apiUrl);
    if (!resp.ok) {
      return json({ error: "Holiday API failed" }, 502);
    }

    const raw = await resp.json();

    // keep only tiny + stable fields
    const normalized = (raw || []).map((h: any) => ({
      date: h.date, // YYYY-MM-DD
      name: h.localName || h.name || "Holiday",
    }));

    // =====================================================
    // 3) Save cache
    // =====================================================
    const { error: upErr } = await supabase
      .from("holiday_cache")
      .upsert(
        {
          country,
          year,
          payload: normalized,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "country,year" }
      );

    if (upErr) return json({ error: upErr.message }, 500);

    return json({
      country,
      year,
      source: "api",
      holidays: normalized,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
