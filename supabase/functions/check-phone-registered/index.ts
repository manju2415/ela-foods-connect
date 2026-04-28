import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Always-allowed phones (QA + super admin) — never blocked even if they don't exist yet.
const WHITELIST_LAST10 = new Set([
  "9999000001", "9999000002", "9999000003",
  "9999000004", "9999000005", "9999000006",
  "8050000300",
]);

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
    const { phone, source } = await req.json().catch(() => ({}));
    if (typeof phone !== "string") {
      return json(200, { ok: false, registered: false, error: "Phone is required" });
    }

    // Invite-only restriction applies ONLY to mobile app callers.
    // Web/desktop callers (no source flag) bypass the check and are treated as registered.
    if (source !== "app") {
      return json(200, { ok: true, registered: true, skipped: true });
    }

    // Normalize: strip +, spaces, leading country code → keep last 10 digits
    const digits = phone.replace(/\D/g, "");
    const last10 = digits.slice(-10);
    if (last10.length !== 10) {
      return json(200, { ok: false, registered: false, error: "Invalid phone number" });
    }

    // Whitelist (QA + super admin)
    if (WHITELIST_LAST10.has(last10)) {
      return json(200, { ok: true, registered: true, whitelisted: true });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Check profiles table to see if the user exists in our system
    const { data: profileMatch } = await supabase
      .from("profiles")
      .select("id, phone")
      .or(`phone.eq.+91${last10},phone.eq.91${last10},phone.eq.${last10}`)
      .limit(1)
      .maybeSingle();

    if (profileMatch) {
      return json(200, { ok: true, registered: true });
    }

    // If not found in profiles, they are not allowed to log in
    return json(200, { 
      ok: false, 
      registered: false, 
      error: "You are not added by any member." 
    });

  } catch (err) {
    console.error("[check-phone-registered] Error:", err);
    return json(200, { ok: false, registered: false, error: "Internal error" });
  }
});
