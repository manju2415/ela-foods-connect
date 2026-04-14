import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify the caller is authenticated
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

    // Validate inputs
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

    // Determine the actual referrer: the member who added the user (caller),
    // not necessarily the referral code owner
    const actualReferrerId = added_by_user_id || caller.id;

    // Check if user already exists with this phone (using mock email pattern)
    const cleanPhone = `91${phone}`;
    const mockEmail = `${cleanPhone}@elabazar.local`;
    const tempPassword = `elabazar_${cleanPhone}_temp_2026`;

    // Try to create the user via admin API
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

    // Wait for the handle_new_user trigger to fire
    await new Promise((r) => setTimeout(r, 1000));

    // Update profile with name and phone
    await supabase
      .from("profiles")
      .update({ full_name: full_name.trim(), phone: `+91${phone}` })
      .eq("id", newUserId);

    // Process MLM referral (links user to referrer, credits bonuses, generates referral code)
    try {
      await supabase.rpc("process_mlm_referral", {
        p_referral_code: referral_code.toUpperCase(),
        p_referred_user_id: newUserId,
        p_registration_fee: 0,
      });
    } catch (err) {
      console.error("MLM referral processing error:", err);
    }

    // Override referred_by to point to the actual adder (caller), not the code owner
    // This ensures commissions flow to the member who added the user
    if (actualReferrerId && actualReferrerId !== codeData.user_id) {
      await supabase
        .from("profiles")
        .update({ referred_by: actualReferrerId })
        .eq("id", newUserId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `User ${full_name} has been added successfully. They can login with phone number ${phone}.`,
        user_id: newUserId,
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
