import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { completeRegistration } from "../_shared/completeRegistration.ts";

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

    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, referral_code } = await req.json();

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return new Response(JSON.stringify({ error: "Missing payment details" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the payment ourselves — never trust a bare payment id from the client.
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;
    const encoder = new TextEncoder();
    const hmacKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(keySecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      hmacKey,
      encoder.encode(`${razorpay_order_id}|${razorpay_payment_id}`)
    );
    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (expectedSignature !== razorpay_signature) {
      return new Response(JSON.stringify({ error: "Payment verification failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent the same real payment from being replayed against a different account.
    const { data: priorUse } = await supabase
      .from("founder_payment_logs")
      .select("user_id")
      .eq("payment_id", razorpay_payment_id)
      .maybeSingle();
    if (priorUse && priorUse.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "This payment has already been used" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const keyId = "rzp_live_T2arUsQZHfGFov";
    const paymentLookup = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
      headers: { Authorization: "Basic " + btoa(`${keyId}:${keySecret}`) },
    });
    const paymentData = await paymentLookup.json().catch(() => null);
    if (!paymentLookup.ok || !paymentData) {
      return new Response(JSON.stringify({ error: "Could not confirm payment with Razorpay" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const isCaptured = paymentData.status === "captured" || paymentData.status === "authorized";
    if (!isCaptured || paymentData.order_id !== razorpay_order_id) {
      return new Response(JSON.stringify({ error: "Payment not captured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const capturedAmount = Number(paymentData.amount || 0) / 100;

    const result = await completeRegistration(
      supabase,
      user.id,
      razorpay_payment_id,
      capturedAmount,
      typeof referral_code === "string" ? referral_code : null
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Registration payment error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
