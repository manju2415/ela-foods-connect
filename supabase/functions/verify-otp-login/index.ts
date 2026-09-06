// Verifies an OTP and mints a Supabase session for that phone's account in a single,
// atomic server-side step. This is the ONLY place a session gets created for phone-based
// login: nothing about the account's Supabase Auth password is derivable from public
// data, and it is rotated to a fresh random value on every call here, so a session can
// only ever be obtained by actually passing OTP verification (real MSG91 check, or the
// test-account bypass below for QA phones).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Kept in sync with the TEST_PHONES lists in src/pages/Auth.tsx, Signup.tsx and
// MLMLogin.tsx — these numbers bypass real SMS for QA. Real users always go through MSG91.
const TEST_PHONES = ["9999000001", "9999000002", "9999000003", "9999000004", "9999000005", "9999000006", "8888888888"];
const TEST_OTP = "000000";
const isTestPhone = (phone: string) => TEST_PHONES.some((p) => phone.endsWith(p));

const sanitizeSecret = (raw: string | undefined): string => {
  if (!raw) return "";
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx > -1 && /^[A-Z_][A-Z0-9_]*$/i.test(trimmed.slice(0, eqIdx))) {
    return trimmed.slice(eqIdx + 1).trim();
  }
  return trimmed;
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phone, otp } = await req.json();
    if (!phone || typeof phone !== "string" || !otp || typeof otp !== "string") {
      return json(400, { success: false, error: "Phone and OTP are required" });
    }

    // 1. Verify the OTP server-side. This is the only gate — nothing downstream
    // trusts anything the client claims about verification having happened.
    if (isTestPhone(phone)) {
      if (otp !== TEST_OTP) {
        return json(400, { success: false, error: "Invalid OTP" });
      }
    } else {
      const authKey = sanitizeSecret(Deno.env.get("MSG91_AUTH_TOKEN"));
      if (!authKey) {
        return json(500, { success: false, error: "MSG91 not configured" });
      }

      let mobile = phone.replace(/^\+/, "").replace(/\s+/g, "");
      if (mobile.length === 10) mobile = "91" + mobile;

      const verifyUrl = `https://control.msg91.com/api/v5/otp/verify?mobile=${mobile}&otp=${otp}`;
      const response = await fetch(verifyUrl, { method: "GET", headers: { authkey: authKey } });
      const responseText = await response.text();

      let data: { type?: string; message?: string } = {};
      try {
        data = JSON.parse(responseText);
      } catch {
        return json(502, { success: false, error: "Invalid response from SMS provider" });
      }

      const msg = (data.message || "").toString().toLowerCase();
      const alreadyVerified = msg.includes("already verified");
      if (data.type !== "success" && !alreadyVerified) {
        return json(400, { success: false, error: data.message || data.type || "OTP verification failed" });
      }
    }

    // 2. Mint a session for the phone's account. The password is rotated to a
    // fresh random value on every login, so it is never guessable and never
    // needs to be shared with — or computed by — the client.
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const cleanPhone = phone.replace(/\+/g, "");
    const mockEmail = `${cleanPhone}@elabazar.local`;

    let { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: mockEmail,
    });

    if (linkError || !linkData?.user) {
      // The account may exist but not under the deterministic phone email —
      // e.g. it was created during guest checkout with a random guest_*
      // address. Find it by phone on `profiles` and re-point it, the same
      // repair link-phone-login performs, folded in here so there is one
      // code path instead of a second function callers can forget to call.
      const last10 = cleanPhone.replace(/\D/g, "").slice(-10);
      if (last10.length === 10) {
        const { data: profile } = await admin
          .from("profiles")
          .select("id, phone")
          .or(`phone.eq.+91${last10},phone.eq.91${last10},phone.eq.${last10}`)
          .limit(1)
          .maybeSingle();

        if (profile) {
          const { data: userRes } = await admin.auth.admin.getUserById(profile.id);
          if (userRes?.user && userRes.user.email !== mockEmail) {
            const { error: repairError } = await admin.auth.admin.updateUserById(profile.id, {
              email: mockEmail,
              email_confirm: true,
            });
            if (!repairError) {
              await admin.from("profiles").update({ email: mockEmail, phone: `+91${last10}` }).eq("id", profile.id);
              ({ data: linkData, error: linkError } = await admin.auth.admin.generateLink({
                type: "magiclink",
                email: mockEmail,
              }));
            } else {
              console.error("[verify-otp-login] guest-account repair failed:", repairError);
            }
          }
        }
      }
    }

    if (linkError || !linkData?.user) {
      return json(404, { success: false, error: "Account not found. Please contact admin to be added." });
    }

    const rotatedSecret = crypto.randomUUID() + crypto.randomUUID();
    const { error: pwError } = await admin.auth.admin.updateUserById(linkData.user.id, { password: rotatedSecret });
    if (pwError) {
      console.error("[verify-otp-login] password rotation failed:", pwError);
      return json(500, { success: false, error: "Could not sign in. Please try again." });
    }

    const anon = createClient(supabaseUrl, anonKey);
    const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({
      email: mockEmail,
      password: rotatedSecret,
    });
    if (signInError || !signInData.session) {
      console.error("[verify-otp-login] sign-in after rotation failed:", signInError);
      return json(500, { success: false, error: "Could not sign in. Please try again." });
    }

    return json(200, {
      success: true,
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
    });
  } catch (err) {
    console.error("[verify-otp-login] error:", err);
    return json(500, { success: false, error: err instanceof Error ? err.message : "Internal server error" });
  }
});
