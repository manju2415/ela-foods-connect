import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Unauthorized" });

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) return json(401, { error: "Unauthorized" });

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Rate limit: this endpoint lets a caller check whether arbitrary phone
    // numbers are registered, which is a PII-enumeration vector if abused —
    // cap how often any one user can call it.
    const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
    const RATE_LIMIT_MAX_CALLS = 10;
    const { count: recentCalls } = await admin
      .from("phone_batch_check_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString());
    if ((recentCalls || 0) >= RATE_LIMIT_MAX_CALLS) {
      return json(429, { error: "Too many requests. Please try again in a few minutes." });
    }
    await admin.from("phone_batch_check_log").insert({ user_id: user.id });

    const { phones } = await req.json().catch(() => ({ phones: [] }));
    if (!Array.isArray(phones)) return json(400, { error: "phones must be an array" });

    // Normalise to last-10 digits, unique, capped
    const last10s = Array.from(
      new Set(
        phones
          .filter((p: unknown) => typeof p === "string")
          .map((p: string) => p.replace(/\D/g, "").slice(-10))
          .filter((p: string) => p.length === 10)
      )
    ).slice(0, 500);

    if (last10s.length === 0) return json(200, { registered: {} });

    // The registered name is only included for a single-number lookup (the
    // "is this phone already registered?" check while filling in a form) —
    // never for a bulk/contact-list scan, which would let anyone harvest
    // real names for phone numbers they don't actually own as a contact.
    const includeName = last10s.length === 1;
    const registered: Record<string, { name?: string | null; is_self: boolean }> = {};

    // Query in chunks to keep the URL length sane
    const CHUNK = 200;
    for (let i = 0; i < last10s.length; i += CHUNK) {
      const chunk = last10s.slice(i, i + CHUNK);
      const variants = chunk.flatMap((p) => [`+91${p}`, `91${p}`, p]);
      const { data, error } = await admin
        .from("profiles")
        .select("id, phone, full_name")
        .in("phone", variants);

      if (error) {
        console.error("[check-phones-batch] query error:", error);
        continue;
      }

      for (const row of data ?? []) {
        const key = (row.phone ?? "").replace(/\D/g, "").slice(-10);
        if (key.length === 10) {
          registered[key] = {
            ...(includeName ? { name: row.full_name ?? null } : {}),
            is_self: row.id === user.id,
          };
        }
      }
    }

    return json(200, { registered });
  } catch (err) {
    console.error("[check-phones-batch] Error:", err);
    return json(500, { error: "Internal error" });
  }
});
