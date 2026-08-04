import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Validate the user from the JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { razorpay_payment_id, referral_code } = await req.json();

    if (!razorpay_payment_id) {
      return new Response(JSON.stringify({ error: "Missing payment ID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load profile first (needed to decide founder vs regular fee)
    const { data: profile } = await supabase
      .from("profiles")
      .select("registration_fee_paid, user_level, is_designated_founder")
      .eq("id", user.id)
      .single();

    const isFounder = profile?.user_level === "founder" || profile?.is_designated_founder === true;

    // Get registration fee settings (founders pay their own, higher fee)
    const { data: settingsData } = await supabase
      .from("mlm_settings")
      .select("value")
      .eq("key", isFounder ? "founder_registration_fee" : "registration_fee")
      .maybeSingle();

    const settingsValue = settingsData?.value as { total?: number; amount?: number; wallet_credit?: number } | null;
    const registrationAmount = settingsValue?.total || settingsValue?.amount || (isFounder ? 4999 : 2499);
    const walletCredit = settingsValue?.wallet_credit || (isFounder ? 3001 : 1000);

    // Check if already paid
    if (profile?.registration_fee_paid && profile.registration_fee_paid > 0) {

      return new Response(JSON.stringify({ success: true, already_paid: true, wallet_credit: walletCredit, registration_amount: registrationAmount }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update profile with registration fee paid
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ registration_fee_paid: registrationAmount })
      .eq("id", user.id);

    if (profileError) {
      console.error("Profile update error:", profileError);
      return new Response(JSON.stringify({ error: "Failed to update profile" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure wallet exists
    await supabase.from("wallets").upsert(
      { user_id: user.id, balance: 0, purchase_only_balance: 0, withdrawable_balance: 0 },
      { onConflict: "user_id" }
    );

    // Credit wallet with welcome bonus (increment, never overwrite existing balances)
    const { data: existingWallet } = await supabase
      .from("wallets")
      .select("id, balance, purchase_only_balance")
      .eq("user_id", user.id)
      .single();

    const { error: walletError } = await supabase
      .from("wallets")
      .update({
        balance: Number(existingWallet?.balance || 0) + walletCredit,
        purchase_only_balance: Number(existingWallet?.purchase_only_balance || 0) + walletCredit,
      })
      .eq("user_id", user.id);

    if (walletError) {
      console.error("Wallet update error:", walletError);
    }

    // Add wallet transaction record
    const { data: wallet } = await supabase
      .from("wallets")
      .select("id, balance")
      .eq("user_id", user.id)
      .single();

    if (wallet) {
      await supabase.from("wallet_transactions").insert({
        wallet_id: wallet.id,
        type: "credit",
        amount: walletCredit,
        balance_after: wallet.balance,
        description: "Registration welcome bonus",
        is_withdrawable: false,
      });
    }

    // Create notification
    await supabase.from("notifications").insert({
      user_id: user.id,
      title: "Registration Complete!",
      message: `Welcome to Ela Bazar! ₹${walletCredit} has been credited to your wallet.`,
      type: "success",
    });

    // Process MLM referral commissions if user was referred
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("referred_by")
      .eq("id", user.id)
      .single();

    // A referral code entered on the payment page is used only when the user
    // has no referrer yet. Otherwise the existing referrer's code wins.
    let referralCodeToUse: string | null = null;

    if (userProfile?.referred_by) {
      const { data: referralData } = await supabase
        .from("referral_codes")
        .select("code")
        .eq("user_id", userProfile.referred_by)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      referralCodeToUse = referralData?.code ?? null;
    } else if (typeof referral_code === "string" && referral_code.trim().length >= 3) {
      const { data: enteredCode } = await supabase
        .from("referral_codes")
        .select("code, user_id")
        .eq("code", referral_code.trim().toUpperCase())
        .eq("is_active", true)
        .maybeSingle();
      if (enteredCode && enteredCode.user_id !== user.id) {
        referralCodeToUse = enteredCode.code;
      }
    }

    if (referralCodeToUse) {
      // Call process_mlm_referral which handles:
      // - Referral bonus to direct referrer
      // - Multi-level upward commissions (credit_founder_commission)
      // - Welcome bonus for new user
      // - Auto-generate referral code for new user
      const { error: mlmError } = await supabase.rpc("process_mlm_referral", {
        p_referral_code: referralCodeToUse,
        p_referred_user_id: user.id,
        p_registration_fee: registrationAmount,
      });

      if (mlmError) {
        console.error("MLM referral processing error:", mlmError);
      } else {
        console.log("MLM referral processed successfully for user:", user.id);
      }
    } else {
      // Even without referrer, generate a referral code for the new member
      const { error: codeError } = await supabase.rpc("generate_user_referral_code", {
        p_user_id: user.id,
      });
      if (codeError) {
        console.error("Referral code generation error:", codeError);
      }
    }

    // Assign member role
    await supabase.from("user_roles").upsert(
      { user_id: user.id, role: "member" },
      { onConflict: "user_id,role" }
    );

    return new Response(
      JSON.stringify({
        success: true,
        wallet_credit: walletCredit,
        registration_amount: registrationAmount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Registration payment error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
