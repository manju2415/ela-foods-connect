// Hourly backstop (see the pg_cron job in the 20260909000000 migration):
// any payment_attempts row still "initiated" (payment started, never
// confirmed by the client callback or the webhook) more than 15 minutes
// after it was created is checked against Razorpay directly and settled or
// marked failed. Belt-and-braces alongside the webhook — covers a
// misconfigured/disabled webhook, not just a customer whose app never
// regained control.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { settlePayment, markAttemptFailed, fetchRazorpayOrderPayments } from "../_shared/settlePayment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: staleRows, error } = await supabase
      .from("payment_attempts")
      .select("id, razorpay_order_id")
      .eq("status", "initiated")
      .is("payment_id", null)
      .lt("created_at", cutoff)
      .limit(200);

    if (error) {
      console.error("[sweep-pending-payments] Failed to fetch stale attempts:", error);
      return new Response(JSON.stringify({ error: "Failed to fetch stale attempts" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let settled = 0;
    let failed = 0;
    let stillPending = 0;

    for (const row of staleRows || []) {
      if (!row.razorpay_order_id) continue;

      const { ok, items } = await fetchRazorpayOrderPayments(row.razorpay_order_id);
      if (!ok) {
        console.error("[sweep-pending-payments] Could not fetch Razorpay order payments for", row.razorpay_order_id);
        continue;
      }

      const captured = items.find((p) => p.status === "captured" || p.status === "authorized");
      if (captured) {
        const result = await settlePayment(supabase, {
          razorpayPaymentId: captured.id,
          razorpayOrderId: row.razorpay_order_id,
          capturedAmountPaise: Number(captured.amount || 0),
        });
        if (result.success) settled++;
        else console.error("[sweep-pending-payments] settlePayment failed for", captured.id, result.error);
        continue;
      }

      // No captured/authorized payment for this order. If Razorpay explicitly
      // reports a failed attempt (declined card, etc.), or no attempt exists
      // at all (the customer closed the sheet before paying), mark it failed
      // so it stops showing as "initiated" forever. A payment still in an
      // in-between state (e.g. "created") is left for the next sweep.
      const explicitlyFailed = items.some((p) => p.status === "failed");
      const inProgress = items.some((p) => p.status !== "failed");
      if (explicitlyFailed || items.length === 0) {
        await markAttemptFailed(supabase, row.razorpay_order_id, "No captured payment found after 15 minutes");
        failed++;
      } else if (inProgress) {
        stillPending++;
      }
    }

    // Abandoned unpaid orders: still pending/pending 30+ minutes after being
    // placed. Ask Razorpay first — if money was captured, settle instead of
    // cancelling. Cancelling returns stock and wallet money via DB triggers.
    const orderCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: unpaidOrders } = await supabase
      .from("orders")
      .select("id, order_number")
      .eq("status", "pending")
      .eq("payment_status", "pending")
      .gt("total_amount", 0)
      .is("admin_deleted_at", null)
      .lt("created_at", orderCutoff)
      .limit(100);

    let ordersCancelled = 0;
    let ordersSettled = 0;
    for (const order of unpaidOrders || []) {
      const { data: attempts } = await supabase
        .from("payment_attempts")
        .select("razorpay_order_id")
        .eq("order_id", order.id)
        .not("razorpay_order_id", "is", null);

      let paid = false;
      let lookupFailed = false;
      let inProgress = false;
      for (const a of attempts || []) {
        const { ok, items } = await fetchRazorpayOrderPayments(a.razorpay_order_id);
        if (!ok) { lookupFailed = true; continue; }
        const captured = items.find((p) => p.status === "captured" || p.status === "authorized");
        if (captured) {
          const r = await settlePayment(supabase, {
            razorpayPaymentId: captured.id,
            razorpayOrderId: a.razorpay_order_id,
            capturedAmountPaise: Number(captured.amount || 0),
            orderId: order.id,
            purpose: "order",
          });
          if (r.success) { paid = true; ordersSettled++; }
          else lookupFailed = true;
          break;
        }
        if (items.some((p) => p.status === "created")) inProgress = true;
      }
      if (paid || lookupFailed || inProgress) continue;

      const { error: cancelErr } = await supabase
        .from("orders")
        .update({ status: "cancelled", payment_status: "failed" })
        .eq("id", order.id)
        .eq("payment_status", "pending");
      if (cancelErr) console.error("[sweep-pending-payments] cancel failed for", order.order_number, cancelErr);
      else ordersCancelled++;
    }

    return new Response(
      JSON.stringify({ checked: staleRows?.length || 0, settled, failed, still_pending: stillPending, orders_settled: ordersSettled, orders_cancelled: ordersCancelled }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[sweep-pending-payments] error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
