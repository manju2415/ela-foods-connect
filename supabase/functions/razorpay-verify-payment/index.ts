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

    // For an existing order, the actual amount paid must match what the order
    // really costs (fetched fresh from the DB — never trust the client's `amount`).
    if (order_id && purpose !== "registration" && purpose !== "wallet_topup") {
      const { data: orderRow } = await supabase.from("orders").select("total_amount").eq("id", order_id).maybeSingle();
      const expectedPaise = Math.round(Number(orderRow?.total_amount ?? 0) * 100);
      if (!orderRow || capturedAmountPaise < expectedPaise) {
        console.error("Underpayment detected for order:", { order_id, capturedAmountPaise, expectedPaise });
        return new Response(JSON.stringify({ verified: false, error: "Paid amount does not match order total" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // The real captured amount (in rupees) — authoritative for wallet credit and
    // for the record kept below, never the client-claimed `amount`.
    const capturedAmount = capturedAmountPaise / 100;

    // Record the payment BEFORE any order is created, so a failure further down
    // the line can never leave a paid customer without a traceable record.
    const attemptRow = {
      payment_id: razorpay_payment_id,
      razorpay_order_id,
      purpose: purpose || (order_id ? "order" : "unknown"),
      user_id: attempt?.user_id ?? (purpose === "registration" ? order_id : null),
      guest_details: attempt?.guest_details ?? null,
      customer_name: attempt?.customer_name ?? null,
      customer_phone: attempt?.customer_phone ?? null,
      customer_email: attempt?.customer_email ?? null,
      amount: capturedAmount,
      items: attempt?.items ?? [],
      coupon_code: attempt?.coupon_code ?? null,
      discount_amount: Number(attempt?.discount_amount ?? 0),
      status: purpose === "registration" || purpose === "wallet_topup" || !!order_id ? "converted" : "pending",
      order_id: purpose === "registration" ? null : order_id ?? null,
    };

    const { error: attemptErr } = await supabase
      .from("payment_attempts")
      .upsert(attemptRow, { onConflict: "payment_id" });

    if (attemptErr) {
      console.error("Failed to record payment attempt:", attemptErr);
    }

    if (purpose === "registration" && order_id) {
      // order_id here is user_id for registration payments
      // Already handled client-side after verification
    } else if (purpose === "wallet_topup" && attempt?.user_id) {
      const topupAmount = capturedAmount;
      if (topupAmount > 0) {
        const { data: walletRow, error: walletFetchErr } = await supabase
          .from("wallets")
          .select("id, balance, withdrawable_balance")
          .eq("user_id", attempt.user_id)
          .maybeSingle();

        if (walletFetchErr) {
          console.error("Wallet lookup error:", walletFetchErr);
        } else if (walletRow) {
          const newBalance = Number(walletRow.balance || 0) + topupAmount;
          const newWithdrawable = Number(walletRow.withdrawable_balance || 0) + topupAmount;

          // Insert the ledger row FIRST — a unique constraint on
          // (reference_id) for type='add_money' rejects a second insert for
          // the same payment outright, so a retried/duplicate verify call
          // can never credit the wallet twice. Only proceed to update the
          // balance if this call actually won that race.
          const { error: txnErr } = await supabase.from("wallet_transactions").insert({
            wallet_id: walletRow.id,
            amount: topupAmount,
            type: "add_money",
            description: "Added money to wallet",
            is_withdrawable: true,
            reference_id: razorpay_payment_id,
            balance_after: newBalance,
          });

          if (txnErr) {
            if (txnErr.code !== "23505") {
              console.error("Wallet transaction insert error:", txnErr);
            }
            // 23505 = already credited by a concurrent/earlier call — nothing more to do.
          } else {
            const { error: walletUpdateErr } = await supabase
              .from("wallets")
              .update({
                balance: newBalance,
                withdrawable_balance: newWithdrawable,
                updated_at: new Date().toISOString(),
              })
              .eq("id", walletRow.id);

            if (walletUpdateErr) console.error("Wallet credit error:", walletUpdateErr);
          }
        } else {
          console.error("Wallet top-up: no wallet row for user", attempt.user_id);
        }
      }
    } else if (order_id) {
      // Update order payment status
      const { error } = await supabase
        .from("orders")
        .update({ payment_status: "completed", is_cod: false })
        .eq("id", order_id);

      if (error) {
        console.error("Order update error:", error);
      }
    }


    return new Response(
      JSON.stringify({ verified: true, payment_id: razorpay_payment_id }),
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
