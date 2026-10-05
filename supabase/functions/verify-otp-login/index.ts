// Verifies an OTP and mints a Supabase session for that phone's account in a single,
// atomic server-side step. This is the ONLY place a session gets created for phone-based
// login: nothing about the account's Supabase Auth password is derivable from public
// data, and it is rotated to a fresh random value on every call here, so a session can
// only ever be obtained by actually passing OTP verification (real MSG91 check, or the
// test-account bypass below for QA phones).
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isRegistrationEnabled } from "../_shared/registrationSettings.ts";

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

/**
 * Best-effort platform label for a request. Newer app builds send `platform`
 * explicitly; older installed builds don't, so we fall back to the User-Agent,
 * which still distinguishes iPhone from Android reliably enough for triage.
 */
const detectPlatform = (req: Request, claimed?: unknown): string => {
  const ua = req.headers.get("user-agent") || "";
  let derived = "unknown";
  if (/iphone|ipad|ipod/i.test(ua)) derived = "ios";
  else if (/android/i.test(ua)) derived = "android";
  else if (/mozilla|chrome|safari/i.test(ua)) derived = "web";
  const claimedStr = typeof claimed === "string" && claimed.trim() ? claimed.trim().slice(0, 40) : "";
  return claimedStr ? `${claimedStr}/${derived}` : derived;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Registration-OFF invites: link a brand-new customer to whoever invited them.
 * The inviter's referral bonus and the invitee's welcome bonus are paid by the
 * on_order_invite_reward trigger on the invitee's first paid order. Best-effort
 * — a bad or missing code never blocks the login.
 */
const linkInvite = async (admin: SupabaseClient, userId: string, rawCode: unknown) => {
  if (typeof rawCode !== "string" || rawCode.trim().length < 3) return;
  try {
    const { data: codeRow } = await admin
      .from("referral_codes")
      .select("id, user_id")
      .eq("code", rawCode.trim().toUpperCase())
      .eq("is_active", true)
      .maybeSingle();
    if (!codeRow?.user_id || codeRow.user_id === userId) return;
    await admin.from("profiles").update({ referred_by: codeRow.user_id }).eq("id", userId).is("referred_by", null);
    await admin.from("referrals").upsert(
      {
        referrer_id: codeRow.user_id,
        referred_id: userId,
        referral_code_id: codeRow.id,
        incentive_paid: false,
        reward_on_first_order: true,
      },
      { onConflict: "referred_id", ignoreDuplicates: true },
    );
  } catch (e) {
    console.error("[verify-otp-login] invite link failed:", e);
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  let logClient: SupabaseClient | null = null;
  try {
    logClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  } catch (_) {
    logClient = null;
  }

  let loggedPhone = "unknown";
  let platform = detectPlatform(req);

  /**
   * Records the outcome of this session attempt so a failure names its own
   * cause instead of surfacing only the client's catch-all message.
   * `outcome` carries the branch code, `provider_request_id` the platform,
   * `error` the detail — no schema change needed.
   */
  const logAttempt = async (code: string, detail?: unknown) => {
    if (!logClient) return;
    try {
      const { error: logError } = await logClient.from("otp_send_log").insert({
        phone: loggedPhone,
        outcome: `session:${code}`,
        provider_request_id: platform,
        error: detail === undefined || detail === null
          ? null
          : (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 2000),
      });
      if (logError) console.error("[verify-otp-login] log insert error:", JSON.stringify(logError));
    } catch (e) {
      console.error("[verify-otp-login] log write failed:", e);
    }
  };

  try {
    const body = await req.json();
    const { phone, otp } = body ?? {};
    platform = detectPlatform(req, body?.platform);
    if (!phone || typeof phone !== "string" || !otp || typeof otp !== "string") {
      await logAttempt("BAD_REQUEST");
      return json(400, { success: false, code: "BAD_REQUEST", error: "Phone and OTP are required" });
    }
    loggedPhone = phone;

    // 1. Verify the OTP server-side. This is the only gate — nothing downstream
    // trusts anything the client claims about verification having happened.
    if (isTestPhone(phone)) {
      if (otp !== TEST_OTP) {
        await logAttempt("OTP_REJECTED", "test phone: wrong test OTP");
        return json(400, { success: false, code: "OTP_REJECTED", error: "Invalid OTP" });
      }
    } else {
      const authKey = sanitizeSecret(Deno.env.get("MSG91_AUTH_TOKEN"));
      if (!authKey) {
        await logAttempt("PROVIDER_NOT_CONFIGURED");
        return json(500, { success: false, code: "PROVIDER_NOT_CONFIGURED", error: "SMS provider is not configured. Please contact support." });
      }

      let mobile = phone.replace(/^\+/, "").replace(/\s+/g, "");
      if (mobile.length === 10) mobile = "91" + mobile;

      const verifyUrl = `https://control.msg91.com/api/v5/otp/verify?mobile=${mobile}&otp=${otp}`;
      let responseText = "";
      try {
        const response = await fetch(verifyUrl, { method: "GET", headers: { authkey: authKey } });
        responseText = await response.text();
      } catch (netErr) {
        await logAttempt("PROVIDER_UNREACHABLE", netErr instanceof Error ? netErr.message : String(netErr));
        return json(502, { success: false, code: "PROVIDER_UNREACHABLE", error: "Could not reach the SMS provider. Please try again." });
      }

      let data: { type?: string; message?: string } = {};
      try {
        data = JSON.parse(responseText);
      } catch {
        await logAttempt("PROVIDER_BAD_RESPONSE", responseText);
        return json(502, { success: false, code: "PROVIDER_BAD_RESPONSE", error: "Invalid response from SMS provider" });
      }

      const msg = (data.message || "").toString().toLowerCase();
      // Installed builds still pre-verify the code before calling us, so a
      // second check legitimately comes back "already verified" — accept it.
      const alreadyVerified = msg.includes("already verified");
      if (data.type !== "success" && !alreadyVerified) {
        await logAttempt("OTP_REJECTED", data);
        return json(400, {
          success: false,
          code: "OTP_REJECTED",
          error: data.message || data.type || "OTP verification failed",
        });
      }
    }

    // 2. Mint a session for the phone's account. The password is rotated to a
    // fresh random value on every login, so it is never guessable and never
    // needs to be shared with — or computed by — the client.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const cleanPhone = phone.replace(/\+/g, "");
    const mockEmail = `${cleanPhone}@elabazar.local`;

    // Looks up the auth user for the phone email. Must be "recovery", never
    // "magiclink": for an unknown email Supabase turns a magiclink into a
    // signup and creates an unconfirmed user (who can never sign in), whereas
    // recovery just reports "not found". For an existing user both do the same.
    const findAuthUser = () => admin.auth.admin.generateLink({ type: "recovery", email: mockEmail });

    let { data: linkData, error: linkError } = await findAuthUser();

    // A transient Auth Admin API error here (not "account doesn't exist")
    // previously surfaced to an existing, correctly-matched account as a
    // permanent "Account not found" with no retry at all — retry once before
    // falling through to the phone-based repair/lookup below.
    if (linkError || !linkData?.user) {
      await sleep(300);
      ({ data: linkData, error: linkError } = await findAuthUser());
    }

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
          if (userRes?.user) {
            if (userRes.user.email !== mockEmail) {
              const { error: repairError } = await admin.auth.admin.updateUserById(profile.id, {
                email: mockEmail,
                email_confirm: true,
              });
              if (!repairError) {
                await admin.from("profiles").update({ email: mockEmail, phone: `+91${last10}` }).eq("id", profile.id);
              } else {
                console.error("[verify-otp-login] guest-account repair failed:", repairError);
                await logAttempt("REPAIR_FAILED", repairError.message);
              }
            }
            // The auth user genuinely exists for this phone (repaired just now,
            // or already correctly linked and the earlier failures were
            // transient) — retry the link generation once more before
            // reporting "not found" for an account that clearly exists.
            ({ data: linkData, error: linkError } = await findAuthUser());
          }
        }
      }
    }

    // Registration switched off by super admin: a new number simply logs in.
    // The OTP has already been verified above, so create a plain customer
    // account (no referrer, no member role, no fee) — name and delivery
    // address are taken at checkout.
    let isNewUser = false;
    if ((linkError || !linkData?.user) && !(await isRegistrationEnabled(admin))) {
      const last10 = cleanPhone.replace(/\D/g, "").slice(-10);
      if (last10.length === 10) {
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: mockEmail,
          password: crypto.randomUUID() + crypto.randomUUID(),
          email_confirm: true,
          phone_confirm: true,
          user_metadata: { phone: `91${last10}` },
        });
        if (created?.user) {
          isNewUser = true;
          await admin.from("profiles").upsert(
            { id: created.user.id, email: mockEmail, phone: `+91${last10}` },
            { onConflict: "id" },
          );
          await linkInvite(admin, created.user.id, body?.referral_code);
        } else if (createErr && !createErr.message?.toLowerCase().includes("already")) {
          console.error("[verify-otp-login] customer account creation failed:", createErr);
        }
        // Created now, or by a concurrent request a moment ago — either way
        // the account exists under the phone email.
        ({ data: linkData, error: linkError } = await findAuthUser());
      }
    }

    // An unconfirmed account under the phone email was left behind by the old
    // magiclink lookup (every real creation path confirms the email, and an
    // unconfirmed account can never sign in). The OTP above proves the phone,
    // so finish it as the new customer it should have been — same account, no
    // duplicate — instead of failing every login with "Email not confirmed".
    if (!linkError && linkData?.user && !linkData.user.email_confirmed_at && linkData.user.email === mockEmail) {
      const last10 = cleanPhone.replace(/\D/g, "").slice(-10);
      const strayId = linkData.user.id;
      const { error: confirmErr } = await admin.auth.admin.updateUserById(strayId, {
        email_confirm: true,
        ...(last10.length === 10 ? { user_metadata: { ...linkData.user.user_metadata, phone: `91${last10}` } } : {}),
      });
      if (confirmErr) {
        console.error("[verify-otp-login] confirming unconfirmed account failed:", confirmErr);
        await logAttempt("CONFIRM_FAILED", confirmErr.message);
      } else {
        isNewUser = true;
        if (last10.length === 10) {
          await admin.from("profiles").update({ phone: `+91${last10}` }).eq("id", strayId).is("phone", null);
        }
        if (!(await isRegistrationEnabled(admin))) {
          await linkInvite(admin, strayId, body?.referral_code);
        }
      }
    }

    if (linkError || !linkData?.user) {
      await logAttempt("NO_AUTH_USER", linkError?.message || "generateLink returned no user");
      return json(404, {
        success: false,
        code: "NO_AUTH_USER",
        error: "Account not found. Please contact admin to be added.",
      });
    }

    const authUserId = linkData.user.id;

    // Rotate + sign in, retried once: a transient failure here previously
    // surfaced to the user as a permanent "account not found".
    let lastError: string | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const rotatedSecret = crypto.randomUUID() + crypto.randomUUID();
      const { error: pwError } = await admin.auth.admin.updateUserById(authUserId, { password: rotatedSecret });
      if (pwError) {
        lastError = `ROTATION_FAILED: ${pwError.message}`;
        console.error("[verify-otp-login] password rotation failed:", pwError);
        if (attempt === 1) { await sleep(400); continue; }
        await logAttempt("ROTATION_FAILED", pwError.message);
        return json(500, { success: false, code: "ROTATION_FAILED", error: "Could not complete sign-in (security step failed). Please try again." });
      }

      const anon = createClient(supabaseUrl, anonKey);
      const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({
        email: mockEmail,
        password: rotatedSecret,
      });

      if (signInError || !signInData.session) {
        lastError = `SIGNIN_FAILED: ${signInError?.message || "no session returned"}`;
        console.error("[verify-otp-login] sign-in after rotation failed:", signInError);
        // Last line of defence for an unconfirmed account the check above
        // didn't catch: the OTP has proven the phone, so confirm it and retry.
        if (attempt === 1 && signInError?.message?.toLowerCase().includes("not confirmed")) {
          const { error: confirmErr } = await admin.auth.admin.updateUserById(authUserId, { email_confirm: true });
          if (confirmErr) console.error("[verify-otp-login] confirm on sign-in retry failed:", confirmErr);
          else isNewUser = true;
        }
        if (attempt === 1) { await sleep(400); continue; }
        await logAttempt("SIGNIN_FAILED", lastError);
        return json(500, { success: false, code: "SIGNIN_FAILED", error: "Could not sign in. Please try again." });
      }

      await logAttempt(attempt === 1 ? "SUCCESS" : "SUCCESS_AFTER_RETRY", attempt === 1 ? null : lastError);
      return json(200, {
        success: true,
        is_new_user: isNewUser,
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
      });
    }

    await logAttempt("SIGNIN_FAILED", lastError);
    return json(500, { success: false, code: "SIGNIN_FAILED", error: "Could not sign in. Please try again." });
  } catch (err) {
    console.error("[verify-otp-login] error:", err);
    await logAttempt("UNEXPECTED", err instanceof Error ? err.message : String(err));
    return json(500, { success: false, code: "UNEXPECTED", error: err instanceof Error ? err.message : "Internal server error" });
  }
});
