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

    const { razorpay_payment_id } = await req.json();

    if (!razorpay_payment_id) {
      return new Response(JSON.stringify({ error: "Missing payment ID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get registration fee settings
    const { data: settingsData } = await supabase
      .from("mlm_settings")
      .select("value")
      .eq("key", "registration_fee")
      .single();

    const settingsValue = settingsData?.value as { total?: number; amount?: number; wallet_credit?: number } | null;
    const registrationAmount = settingsValue?.total || settingsValue?.amount || 2499;
    const walletCredit = settingsValue?.wallet_credit || 1000;

    // Check if already paid
    const { data: profile } = await supabase
      .from("profiles")
      .select("registration_fee_paid")
      .eq("id", user.id)
      .single();

    if (profile?.registration_fee_paid && profile.registration_fee_paid > 0) {
      return new Response(JSON.stringify({ error: "Already registered", already_paid: true }), {
        status: 409,
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
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure wallet exists
    await supabase.from("wallets").upsert(
      { user_id: user.id, balance: 0, purchase_only_balance: 0, withdrawable_balance: 0 },
      { onConflict: "user_id" }
    );

    // Credit wallet with welcome bonus
    const { error: walletError } = await supabase
      .from("wallets")
      .update({
        balance: walletCredit,
        purchase_only_balance: walletCredit,
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

    // Process MLM referral if user was referred
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("referred_by")
      .eq("id", user.id)
      .single();

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
