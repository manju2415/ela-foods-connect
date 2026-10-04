import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isRegistrationEnabled } from "../_shared/registrationSettings.ts";

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

    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Payment-first logged-in checkout: the amount is never taken from the
    // client — it is quoted server-side from the real cart, and the full
    // checkout is stored so the order can be created after payment.
    let chargeAmount = amount;
    let memberUserId: string | null = null;
    let checkoutPayload: Record<string, unknown> | null = null;
    if (purpose === "member_order") {
      const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: userData } = await admin.auth.getUser(token);
      if (!userData?.user) return json({ error: "Please sign in again to pay." }, 401);
      memberUserId = userData.user.id;
      const c = (attemptContext as any)?.checkout;
      if (!c || !Array.isArray(c.items) || c.items.length === 0) return json({ error: "Your cart is empty." }, 400);
      checkoutPayload = {
        items: c.items.map((i: any) => ({ product_id: i.product_id, variant_id: i.variant_id ?? null, quantity: Number(i.quantity) })),
        shipping_address: c.shipping_address ?? {},
        fulfillment_type: c.fulfillment_type === "store_pickup" ? "store_pickup" : "delivery",
        pickup_store_id: c.pickup_store_id ?? null,
        coupon_code: c.coupon_code ?? null,
        use_wallet: !!c.use_wallet,
        preferred_delivery_date: c.preferred_delivery_date ?? null,
        preferred_delivery_slot_id: c.preferred_delivery_slot_id ?? null,
      };
      const { data: quote, error: quoteErr } = await admin.rpc("quote_checkout", {
        p_user_id: memberUserId,
        p_items: checkoutPayload.items,
        p_shipping_address: checkoutPayload.shipping_address,
        p_fulfillment_type: checkoutPayload.fulfillment_type,
        p_pickup_store_id: checkoutPayload.pickup_store_id,
        p_coupon_code: checkoutPayload.coupon_code,
        p_use_wallet: checkoutPayload.use_wallet,
        p_preferred_delivery_date: checkoutPayload.preferred_delivery_date,
        p_preferred_delivery_slot_id: checkoutPayload.preferred_delivery_slot_id,
      });
      if (quoteErr || !quote?.success) return json({ error: quote?.error || "Could not check your cart. Please try again." }, 400);
      chargeAmount = Number(quote.total_amount);
      if (!(chargeAmount > 0)) return json({ error: "Nothing to pay online", code: "NO_ONLINE_AMOUNT" }, 400);
    }

    // Registration switched off by super admin: no new registration fees are
    // taken. Payments already captured still settle via webhook/sweep.
    if (purpose === "registration") {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      if (!(await isRegistrationEnabled(admin))) {
        return json({ error: "New registrations are closed right now. You can still shop as a customer.", code: "REGISTRATION_CLOSED" }, 403);
      }
    }

    if (!chargeAmount || chargeAmount <= 0) {
      return json({ error: "Invalid amount" }, 400);
    }

    const keyId = "rzp_live_T2arUsQZHfGFov";
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;

    const orderPayload = {
      amount: Math.round(chargeAmount * 100), // Razorpay expects amount in paise
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
      const { error: insertErr } = await supabase.from("payment_attempts").insert({
        payment_id: null,
        razorpay_order_id: data.id,
        purpose: resolvedPurpose,
        user_id: memberUserId ?? attemptContext?.user_id ?? (resolvedPurpose === "registration" ? orderId ?? null : null),
        guest_details: attemptContext?.guest_details ?? null,
        customer_name: attemptContext?.customer_name ?? null,
        customer_phone: attemptContext?.customer_phone ?? null,
        customer_email: attemptContext?.customer_email ?? null,
        amount: chargeAmount,
        items: checkoutPayload?.items ?? attemptContext?.items ?? [],
        checkout_payload: checkoutPayload,
        expected_amount: checkoutPayload ? chargeAmount : null,
        coupon_code: attemptContext?.coupon_code ?? null,
        discount_amount: Number(attemptContext?.discount_amount ?? 0),
        status: "initiated",
        order_id: resolvedPurpose === "registration" ? null : orderId ?? null,
      });
      if (insertErr) throw insertErr;
    } catch (intentErr) {
      // A logged-in order can only be created from this saved checkout, so
      // never let the customer pay without it.
      if (purpose === "member_order") return json({ error: "Could not start payment. Please try again." }, 500);
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
