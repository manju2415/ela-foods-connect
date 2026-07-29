import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sanitizeSecret = (raw: string | undefined): string => {
  if (!raw) return "";
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx > -1 && /^[A-Z_][A-Z0-9_]*$/i.test(trimmed.slice(0, eqIdx))) {
    return trimmed.slice(eqIdx + 1).trim();
  }
  return trimmed;
};

async function sendInviteSMS(phone: string, referrerName: string) {
  const authKey = sanitizeSecret(Deno.env.get("MSG91_AUTH_TOKEN"));
  const flowId = sanitizeSecret(Deno.env.get("MSG91_INVITE_TEMPLATE_ID"));
  if (!authKey || !flowId) {
    console.log("[add-network-user] Invite SMS skipped — MSG91_INVITE_TEMPLATE_ID not configured");
    return { sent: false, reason: "template_not_configured" };
  }

  let mobile = phone.replace(/^\+/, "").replace(/\s+/g, "");
  if (mobile.length === 10) mobile = "91" + mobile;

  try {
    const resp = await fetch("https://control.msg91.com/api/v5/flow/", {
      method: "POST",
      headers: { authkey: authKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: flowId,
        recipients: [{ mobiles: mobile, name: referrerName, VAR1: referrerName }],
      }),
    });
    const text = await resp.text();
    console.log("[add-network-user] MSG91 flow response:", resp.status, text);
    return { sent: resp.ok, providerStatus: resp.status, providerResponse: text };
  } catch (err) {
    console.error("[add-network-user] Invite SMS error:", err);
    return { sent: false, error: String(err) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller }, error: authError } = await anonClient.auth.getUser();

    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { phone, full_name, referral_code, added_by_user_id } = body;

    if (!phone || !/^\d{10}$/.test(phone)) {
      return new Response(JSON.stringify({ error: "Invalid phone number" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!full_name || full_name.trim().length < 2) {
      return new Response(JSON.stringify({ error: "Name is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!referral_code) {
      return new Response(JSON.stringify({ error: "Referral code is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate referral code
    const { data: codeData } = await supabase
      .from("referral_codes")
      .select("id, user_id")
      .eq("code", referral_code.toUpperCase())
      .eq("is_active", true)
      .maybeSingle();

    if (!codeData) {
      return new Response(JSON.stringify({ error: "Invalid or inactive referral code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const actualReferrerId = added_by_user_id || caller.id;

    const cleanPhone = `91${phone}`;
    const mockEmail = `${cleanPhone}@elabazar.local`;
    const tempPassword = `elabazar_${cleanPhone}_temp_2026`;

    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: mockEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: full_name.trim(),
        phone: `+91${phone}`,
      },
    });

    if (createError) {
      if (createError.message.includes("already been registered") || createError.message.includes("already exists")) {
        return new Response(JSON.stringify({ error: "A user with this phone number already exists" }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("Create user error:", createError);
      return new Response(JSON.stringify({ error: "Failed to create user" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!newUser?.user) {
      return new Response(JSON.stringify({ error: "User creation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = newUser.user.id;

    // Wait for handle_new_user trigger to create profile
    await new Promise((r) => setTimeout(r, 1000));

    // Update profile with name, phone, and set referred_by directly to the adder.
    // DO NOT call process_mlm_referral here — bonuses are credited ONLY after
    // the new user completes registration payment.
    await supabase
      .from("profiles")
      .update({
        full_name: full_name.trim(),
        phone: `+91${phone}`,
        referred_by: actualReferrerId,
      })
      .eq("id", newUserId);

    // Track the pending referral (not yet paid)
    await supabase.from("referrals").insert({
      referrer_id: actualReferrerId,
      referred_id: newUserId,
      referral_code_id: codeData.id,
      incentive_amount: 0,
      incentive_paid: false,
    });

    // Generate the new user's own referral code so their downlink is trackable
    try {
      await supabase.rpc("generate_user_referral_code", { p_user_id: newUserId });
    } catch (err) {
      console.error("Referral code generation error:", err);
    }

    // Fetch referrer's name for the invite SMS + notification
    const { data: referrerProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", actualReferrerId)
      .single();
    const referrerName = referrerProfile?.full_name || "an Ela Bazar member";

    // In-app notification (visible once the invitee logs in)
    await supabase.from("notifications").insert({
      user_id: newUserId,
      title: "Welcome to Ela Bazar!",
      message: `You've been invited by ${referrerName}. Complete your registration and payment to join the community.`,
      type: "info",
    });

    // Send invite SMS (best-effort; silently skipped if template not configured)
    const smsResult = await sendInviteSMS(phone, referrerName);

    return new Response(
      JSON.stringify({
        success: true,
        message: `User ${full_name} has been added. They can login with ${phone} to complete registration and payment.`,
        user_id: newUserId,
        invite_sms: smsResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Add network user error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
