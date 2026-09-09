// Razorpay calls this directly the moment a payment is captured or fails —
// independent of the customer's phone/browser ever handing control back to
// the app. This is the reliable half of "never lose a payment": Razorpay
// retries this call until it gets a 2xx, so a payment can only go unnoticed
// here if the webhook itself is misconfigured (the hourly sweep covers
// that case).
//
// Public endpoint (verify_jwt = false in config.toml) — Razorpay does not
// send a Supabase JWT. Authenticity is instead verified via the
// X-Razorpay-Signature header, an HMAC-SHA256 of the raw request body keyed
// with RAZORPAY_WEBHOOK_SECRET (set to whatever secret you configure in the
// Razorpay dashboard for this webhook).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { settlePayment, markAttemptFailed } from "../_shared/settlePayment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-razorpay-signature",
};

const toHex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature") || "";
    const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");

    if (!webhookSecret) {
      console.error("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET not configured");
      return new Response(JSON.stringify({ error: "Webhook not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const expectedSignature = toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody)));

    if (!signature || !timingSafeEqual(expectedSignature, signature)) {
      console.error("[razorpay-webhook] Signature mismatch — rejecting");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = JSON.parse(rawBody);
    const event = body?.event as string | undefined;
    const payment = body?.payload?.payment?.entity as
      | { id?: string; order_id?: string; amount?: number; status?: string }
      | undefined;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Always acknowledge with 200 once the signature checks out and we've
    // handled (or logged) the event — returning a non-2xx for anything past
    // this point would just make Razorpay retry a request that will fail the
    // same way every time; the hourly sweep is the real backstop for that.
    if (event === "payment.captured" && payment?.id) {
      const result = await settlePayment(supabase, {
        razorpayPaymentId: payment.id,
        razorpayOrderId: payment.order_id ?? null,
        capturedAmountPaise: Number(payment.amount || 0),
      });
      if (!result.success) {
        console.error("[razorpay-webhook] settlePayment failed for", payment.id, result.error);
      }
    } else if (event === "payment.failed" && payment?.order_id) {
      await markAttemptFailed(supabase, payment.order_id, "Razorpay reported payment.failed");
    } else {
      console.log("[razorpay-webhook] Ignoring event:", event);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[razorpay-webhook] error:", err);
    // Still 200 — a malformed-but-signed payload will fail the same way on
    // retry, and we've already logged it for investigation.
    return new Response(JSON.stringify({ received: true, error: "Internal error, logged" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
