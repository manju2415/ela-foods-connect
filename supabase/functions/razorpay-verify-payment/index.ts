import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { settlePayment } from "../_shared/settlePayment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id, purpose, attempt } =
      await req.json();


    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(JSON.stringify({ error: "Missing payment details" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;

    // Verify signature using HMAC SHA256
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(keySecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureData = `${razorpay_order_id}|${razorpay_payment_id}`;
    const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(signatureData));
    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (expectedSignature !== razorpay_signature) {
      console.error("Signature mismatch");
      return new Response(JSON.stringify({ verified: false, error: "Payment verification failed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // The signature only proves this payment_id/order_id pair is authentic — it
    // says nothing about the amount actually paid. Pull the real captured amount
    // straight from Razorpay so nothing downstream has to trust a client-supplied
    // number.
    const keyId = "rzp_live_T2arUsQZHfGFov";
    const paymentLookup = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
      headers: { Authorization: "Basic " + btoa(`${keyId}:${keySecret}`) },
    });
    const paymentData = await paymentLookup.json().catch(() => null);

    if (!paymentLookup.ok || !paymentData) {
      console.error("Failed to fetch payment from Razorpay:", paymentData);
      return new Response(JSON.stringify({ verified: false, error: "Could not confirm payment with Razorpay" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const capturedAmountPaise = Number(paymentData.amount || 0);
    const isCaptured = paymentData.status === "captured" || paymentData.status === "authorized";
    const orderMatches = paymentData.order_id === razorpay_order_id;

    if (!isCaptured || !orderMatches) {
      console.error("Payment not captured or order mismatch:", { status: paymentData.status, paymentOrderId: paymentData.order_id, razorpay_order_id });
      return new Response(JSON.stringify({ verified: false, error: "Payment not captured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Payment verified - update records
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const settleResult = await settlePayment(supabase, {
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      capturedAmountPaise,
      purpose,
      orderId: order_id ?? null,
      attempt: attempt ?? null,
    });

    if (!settleResult.success) {
      return new Response(JSON.stringify({ verified: false, needs_refund: !!settleResult.needs_refund, error: settleResult.error || "Could not complete payment" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    return new Response(
      JSON.stringify({ verified: true, payment_id: razorpay_payment_id, order_id: settleResult.order_id ?? null, order_number: settleResult.order_number ?? null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Verification error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
