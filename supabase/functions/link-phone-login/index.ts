// Repairs accounts that exist (e.g. created during guest checkout) but whose
// auth email is not the deterministic phone email used by OTP login.
// Given a phone, it finds the matching profile and re-points the auth user to
// `{91xxxxxxxxxx}@elabazar.local` with the standard login password.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { phone } = await req.json().catch(() => ({}));
    const last10 = String(phone ?? "").replace(/\D/g, "").slice(-10);
    if (last10.length !== 10) return json(200, { ok: false, error: "Invalid phone" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const email = `91${last10}@elabazar.local`;
    const password = `elabazar_91${last10}_temp_2026`;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, phone")
      .or(`phone.eq.+91${last10},phone.eq.91${last10},phone.eq.${last10}`)
      .limit(1)
      .maybeSingle();

    if (!profile) return json(200, { ok: false, error: "No account found for this number" });

    const { data: userRes } = await supabase.auth.admin.getUserById(profile.id);
    if (!userRes?.user) return json(200, { ok: false, error: "No account found for this number" });

    if (userRes.user.email === email) {
      // Email already correct — just make sure the standard password works.
      await supabase.auth.admin.updateUserById(profile.id, { password, email_confirm: true });
      return json(200, { ok: true, repaired: false });
    }

    const { error: updErr } = await supabase.auth.admin.updateUserById(profile.id, {
      email,
      password,
      email_confirm: true,
    });
    if (updErr) {
      console.error("[link-phone-login] update failed:", updErr);
      return json(200, { ok: false, error: "Could not repair this account" });
    }

    await supabase
      .from("profiles")
      .update({ email, phone: `+91${last10}` })
      .eq("id", profile.id);

    return json(200, { ok: true, repaired: true });
  } catch (e) {
    console.error("[link-phone-login] error:", e);
    return json(200, { ok: false, error: "Internal error" });
  }
});
