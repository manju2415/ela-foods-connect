// Open signup: creates a Supabase auth user for a phone-verified signup.
// Idempotent — if the user already exists, returns success so the client can sign in normally.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isRegistrationEnabled } from "../_shared/registrationSettings.ts";
import { createGoodBoxContact } from "../_shared/goodboxContact.ts";
import { isSimpleReferralScheme, recordPendingInvite } from "../_shared/referralScheme.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { phone, fullName, referralCode, founder } = await req.json();

    if (!phone || typeof phone !== "string" || !/^\+?\d{10,15}$/.test(phone)) {
      return new Response(JSON.stringify({ error: "Invalid phone" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!fullName || typeof fullName !== "string" || fullName.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Invalid name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Super admin has switched registration off: shoppers just log in
    // (verify-otp-login creates a plain customer account), so no member
    // signups — including from older installed app builds.
    if (!(await isRegistrationEnabled(supabase))) {
      return new Response(JSON.stringify({
        error: "New registrations are closed right now. Please log in with your mobile number to shop.",
        code: "REGISTRATION_CLOSED",
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanPhone = phone.replace(/\+/g, "");
    const email = `${cleanPhone}@elabazar.local`;
    // Not used for sign-in: verify-otp-login rotates this to a fresh random
    // secret on every login, so nothing derivable from the phone can log in.
    const password = crypto.randomUUID() + crypto.randomUUID();

    const pickWalkInFounder = async (excludeUserId?: string): Promise<string | null> => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "founding_member");
      if (rolesError) throw rolesError;
      const founderIds = (roles || []).map((role) => role.user_id).filter((id) => id !== excludeUserId);
      if (founderIds.length === 0) return null;
      const randomBytes = new Uint32Array(1);
      crypto.getRandomValues(randomBytes);
      return founderIds[randomBytes[0] % founderIds.length];
    };

    // Simple referral scheme: walk-ins are not placed under a founder, and a
    // real invite gets a pending referrals row (that row is what pays the
    // bonuses on the first paid order).
    const simpleScheme = await isSimpleReferralScheme(supabase);
    let inviteCodeId: string | null = null;

    const resolveReferrer = async (userId?: string): Promise<string | null> => {
      if (typeof referralCode === "string" && referralCode.trim().length >= 3) {
        const { data: codeRow } = await supabase
          .from("referral_codes")
          .select("id, user_id")
          .eq("code", referralCode.trim().toUpperCase())
          .eq("is_active", true)
          .maybeSingle();
        if (codeRow?.user_id && codeRow.user_id !== userId) {
          inviteCodeId = codeRow.id;
          return codeRow.user_id;
        }
      }
      if (founder === true || simpleScheme) return null;
      return await pickWalkInFounder(userId);
    };

    // Check if user already exists by looking them up via profiles. Matched on
    // the last 10 digits — the same rule verify-otp-login uses — so a profile
    // stored without the +91 prefix is never mistaken for a new signup.
    const last10 = cleanPhone.replace(/\D/g, "").slice(-10);
    const { data: existingProfiles } = await supabase
      .from("profiles")
      .select("id, referred_by")
      .or(`phone.eq.+91${last10},phone.eq.91${last10},phone.eq.${last10}`)
      .limit(1);
    const existingProfile = existingProfiles?.[0] ?? null;

    if (existingProfile) {
      if (!existingProfile.referred_by && founder !== true) {
        const walkInFounderId = await resolveReferrer(existingProfile.id);
        if (walkInFounderId) {
          await supabase.from("profiles").update({ referred_by: walkInFounderId }).eq("id", existingProfile.id);
          if (simpleScheme && inviteCodeId) {
            await recordPendingInvite(supabase, walkInFounderId, existingProfile.id, inviteCodeId);
          }
        }
      }
      return new Response(JSON.stringify({ success: true, isNewUser: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create auth user via admin API
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      phone_confirm: true,
      user_metadata: { full_name: fullName.trim(), phone: cleanPhone },
    });

    if (createErr) {
      // If the user already exists in auth but profile lookup missed, treat as success
      if (createErr.message?.toLowerCase().includes("already")) {
        return new Response(JSON.stringify({ success: true, isNewUser: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("[signup-create-user] createUser error:", createErr);
      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Valid invitations win; otherwise a walk-in is distributed randomly
    // among the designated founders.
    const referredBy = await resolveReferrer(created.user?.id);

    // Ensure profile row exists and phone is normalized
    if (created?.user) {
      await supabase.from("profiles").upsert({
        id: created.user.id,
        email,
        full_name: fullName.trim(),
        phone: phone.startsWith("+") ? phone : `+${cleanPhone}`,
        ...(referredBy ? { referred_by: referredBy } : {}),
        ...(founder === true ? { user_level: "founder" } : {}),
      }, { onConflict: "id" });

      if (simpleScheme && referredBy && inviteCodeId) {
        await recordPendingInvite(supabase, referredBy, created.user.id, inviteCodeId);
      }

      // New account saved: hand the number to GoodBox for its WhatsApp
      // welcome workflow. Best effort, at most once per user.
      await createGoodBoxContact(supabase, created.user.id);
    }

    return new Response(JSON.stringify({ success: true, isNewUser: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[signup-create-user] error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
