import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AttemptContext {
  purpose?: string;
  user_id?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  items?: unknown;
  guest_details?: unknown;
  coupon_code?: string | null;
  discount_amount?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      amount,
      currency,
      receipt,
      notes,
      purpose,
      orderId,
      attemptContext,
    }: {
      amount: number;
      currency?: string;
      receipt?: string;
      notes?: Record<string, string>;
      purpose?: string;
      orderId?: string;
      attemptContext?: AttemptContext;
    } = await req.json();

    if (!amount || amount <= 0) {
      return new Response(JSON.stringify({ error: "Invalid amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const keyId = "rzp_live_T2arUsQZHfGFov";
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;

    const orderPayload = {
      amount: Math.round(amount * 100), // Razorpay expects amount in paise
      currency: currency || "INR",
      receipt: receipt || `rcpt_${Date.now()}`,
      notes: notes || {},
    };

    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + btoa(`${keyId}:${keySecret}`),
      },
      body: JSON.stringify(orderPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Razorpay order creation failed:", data);
      return new Response(JSON.stringify({ error: data.error?.description || "Failed to create order" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record a "payment started" row now, before the customer even sees the
    // Razorpay sheet — the moment money actually moves, whoever notices first
    // (client callback, webhook, or the hourly sweep) has a real trail to
    // settle instead of nothing at all. Best-effort: a failure here must
    // never block checkout, since the client callback still works as before.
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const resolvedPurpose = purpose || (orderId ? "order" : "unknown");
      // A plain insert, not an upsert: Razorpay always hands back a brand
      // new order id here, so there is nothing to conflict with — and the
      // uniqueness on razorpay_order_id is a partial index (only rows still
      // awaiting a payment_id), which upsert's ON CONFLICT can't target.
      await supabase.from("payment_attempts").insert({
        payment_id: null,
        razorpay_order_id: data.id,
        purpose: resolvedPurpose,
        user_id: attemptContext?.user_id ?? (resolvedPurpose === "registration" ? orderId ?? null : null),
        guest_details: attemptContext?.guest_details ?? null,
        customer_name: attemptContext?.customer_name ?? null,
        customer_phone: attemptContext?.customer_phone ?? null,
        customer_email: attemptContext?.customer_email ?? null,
        amount,
        items: attemptContext?.items ?? [],
        coupon_code: attemptContext?.coupon_code ?? null,
        discount_amount: Number(attemptContext?.discount_amount ?? 0),
        status: "initiated",
        order_id: resolvedPurpose === "registration" ? null : orderId ?? null,
      });
    } catch (intentErr) {
      console.error("[razorpay-create-order] Failed to record payment intent:", intentErr);
    }

    return new Response(JSON.stringify({ order_id: data.id, amount: data.amount, currency: data.currency, key_id: keyId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
