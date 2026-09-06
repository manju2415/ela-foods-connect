// Manual admin repair tool for accounts that exist (e.g. created during guest
// checkout) but whose auth email is not the deterministic phone email used by
// OTP login. Given a phone, it finds the matching profile and re-points the
// auth user to `{91xxxxxxxxxx}@elabazar.local`.
//
// verify-otp-login now performs this same repair automatically, behind a real
// OTP check, so this endpoint is only needed for one-off manual fixes and is
// restricted to admins — it used to have no caller check at all, so anyone
// who knew a phone number could re-point that account's login email.
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json(401, { ok: false, error: "Unauthorized" });

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );
    const { data: callerData } = await callerClient.auth.getUser();
    if (!callerData?.user) return json(401, { ok: false, error: "Unauthorized" });

    const { data: isAdmin } = await supabase.rpc("is_any_admin", { _user_id: callerData.user.id });
    if (!isAdmin) return json(403, { ok: false, error: "Admin access required" });

    const { phone } = await req.json().catch(() => ({}));
    const last10 = String(phone ?? "").replace(/\D/g, "").slice(-10);
    if (last10.length !== 10) return json(200, { ok: false, error: "Invalid phone" });

    const email = `91${last10}@elabazar.local`;
    // Random, never reused across accounts or calls — verify-otp-login is the
    // only place a session is actually minted for phone login (it rotates
    // this again right before signing in), so this value only needs to be
    // unguessable, never memorable. A fixed formula here let anyone with a
    // phone number sign in directly against Supabase's own auth API,
    // bypassing OTP entirely.
    const password = crypto.randomUUID() + crypto.randomUUID();

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
