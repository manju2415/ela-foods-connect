// Shared payment settlement.
//
// Runs the exact same idempotent completion logic — record the attempt,
// complete registration / credit a wallet top-up / mark an order paid —
// regardless of which path noticed the payment first:
//  - razorpay-verify-payment (client callback, right after Razorpay's modal closes)
//  - razorpay-webhook (Razorpay calling us directly — the reliable path)
//  - sweep-pending-payments (hourly backstop for anything still "initiated")
//
// Safe to call more than once for the same payment: an already-converted
// attempt short-circuits before anything downstream runs again, and the
// registration/wallet-topup/order branches are each independently guarded
// too (completeRegistration internally, a unique reference_id for wallet
// credits, and a plain no-op UPDATE for an order already marked paid).

// deno-lint-ignore-file no-explicit-any
import { completeRegistration } from "./completeRegistration.ts";
type Client = any;

const RAZORPAY_KEY_ID = "rzp_live_T2arUsQZHfGFov";

export interface SettlePaymentAttemptContext {
  user_id?: string | null;
  guest_details?: unknown;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  items?: unknown;
  coupon_code?: string | null;
  discount_amount?: number;
}

export interface SettlePaymentParams {
  razorpayPaymentId: string;
  razorpayOrderId: string | null;
  capturedAmountPaise: number;
  purpose?: string | null;
  orderId?: string | null; // for purpose "registration" this carries the user_id, same convention used throughout
  attempt?: SettlePaymentAttemptContext | null;
}

export interface SettlePaymentResult {
  success: boolean;
  already_settled?: boolean;
  error?: string;
}

export async function settlePayment(supabase: Client, params: SettlePaymentParams): Promise<SettlePaymentResult> {
  const { razorpayPaymentId, razorpayOrderId, capturedAmountPaise } = params;

  const { data: existingByPaymentId } = await supabase
    .from("payment_attempts")
    .select("*")
    .eq("payment_id", razorpayPaymentId)
    .maybeSingle();

  if (existingByPaymentId && existingByPaymentId.status === "converted") {
    return { success: true, already_settled: true };
  }

  // Pull the "initiated" row recorded at razorpay-create-order time, if any —
  // the webhook and the sweep don't know cart items, coupon code, or guest
  // details; that row does.
  let initiatedRow: any = existingByPaymentId ?? null;
  if (!initiatedRow && razorpayOrderId) {
    const { data } = await supabase
      .from("payment_attempts")
      .select("*")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();
    initiatedRow = data ?? null;
  }

  const purpose = params.purpose || initiatedRow?.purpose || (params.orderId ? "order" : "unknown");
  const orderId = params.orderId ?? initiatedRow?.order_id ?? null;
  const userId = params.attempt?.user_id ?? initiatedRow?.user_id ?? (purpose === "registration" ? orderId : null);
  const guestDetails = params.attempt?.guest_details ?? initiatedRow?.guest_details ?? null;
  const customerName = params.attempt?.customer_name ?? initiatedRow?.customer_name ?? null;
  const customerPhone = params.attempt?.customer_phone ?? initiatedRow?.customer_phone ?? null;
  const customerEmail = params.attempt?.customer_email ?? initiatedRow?.customer_email ?? null;
  const items = params.attempt?.items ?? initiatedRow?.items ?? [];
  const couponCode = params.attempt?.coupon_code ?? initiatedRow?.coupon_code ?? null;
  const discountAmount = Number(params.attempt?.discount_amount ?? initiatedRow?.discount_amount ?? 0);

  const capturedAmount = capturedAmountPaise / 100;

  // For an existing order, the amount actually paid must cover what the
  // order really costs — fetched fresh from the DB, never trusted from the
  // caller.
  if (orderId && purpose !== "registration" && purpose !== "wallet_topup") {
    const { data: orderRow } = await supabase.from("orders").select("total_amount").eq("id", orderId).maybeSingle();
    if (orderRow) {
      const expectedPaise = Math.round(Number(orderRow.total_amount ?? 0) * 100);
      if (capturedAmountPaise < expectedPaise) {
        console.error("[settlePayment] Underpayment detected for order:", { orderId, capturedAmountPaise, expectedPaise });
        return { success: false, error: "Paid amount does not match order total" };
      }
    }
  }

  const attemptRow = {
    payment_id: razorpayPaymentId,
    razorpay_order_id: razorpayOrderId,
    purpose,
    user_id: userId,
    guest_details: guestDetails,
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail,
    amount: capturedAmount,
    items,
    coupon_code: couponCode,
    discount_amount: discountAmount,
    status: purpose === "registration" || purpose === "wallet_topup" || !!orderId ? "converted" : "pending",
    order_id: purpose === "registration" ? null : orderId,
  };

  const { error: attemptErr } = await supabase
    .from("payment_attempts")
    .upsert(attemptRow, { onConflict: "payment_id" });
  if (attemptErr) {
    console.error("[settlePayment] Failed to record payment attempt:", attemptErr);
  }

  // The initiated row (keyed by razorpay_order_id, payment_id still null) is
  // now superseded by the row just upserted above (keyed by payment_id) —
  // remove it so the same purchase doesn't show up twice in Payment Recovery.
  if (initiatedRow?.id && initiatedRow.payment_id == null) {
    await supabase.from("payment_attempts").delete().eq("id", initiatedRow.id);
  }

  if (purpose === "registration" && userId) {
    try {
      const regResult = await completeRegistration(supabase, userId, razorpayPaymentId, capturedAmount, null);
      if (!regResult.success) {
        console.error("[settlePayment] Registration completion failed:", regResult.error);
        return { success: false, error: regResult.error };
      }
    } catch (regErr) {
      console.error("[settlePayment] Registration completion threw:", regErr);
      return { success: false, error: "Registration completion failed" };
    }
  } else if (purpose === "wallet_topup" && userId) {
    const topupAmount = capturedAmount;
    if (topupAmount > 0) {
      const { data: walletRow, error: walletFetchErr } = await supabase
        .from("wallets")
        .select("id, balance, withdrawable_balance")
        .eq("user_id", userId)
        .maybeSingle();

      if (walletFetchErr) {
        console.error("[settlePayment] Wallet lookup error:", walletFetchErr);
      } else if (walletRow) {
        const newBalance = Number(walletRow.balance || 0) + topupAmount;
        const newWithdrawable = Number(walletRow.withdrawable_balance || 0) + topupAmount;

        // Ledger row first — a unique constraint on (reference_id) for
        // type='add_money' rejects a second insert for the same payment
        // outright, so this can never credit the wallet twice no matter how
        // many times settlePayment is called for it.
        const { error: txnErr } = await supabase.from("wallet_transactions").insert({
          wallet_id: walletRow.id,
          amount: topupAmount,
          type: "add_money",
          description: "Added money to wallet",
          is_withdrawable: true,
          reference_id: razorpayPaymentId,
          balance_after: newBalance,
        });

        if (txnErr) {
          if (txnErr.code !== "23505") {
            console.error("[settlePayment] Wallet transaction insert error:", txnErr);
          }
          // 23505 = already credited by a concurrent/earlier call — nothing more to do.
        } else {
          const { error: walletUpdateErr } = await supabase
            .from("wallets")
            .update({ balance: newBalance, withdrawable_balance: newWithdrawable, updated_at: new Date().toISOString() })
            .eq("id", walletRow.id);
          if (walletUpdateErr) console.error("[settlePayment] Wallet credit error:", walletUpdateErr);
        }
      } else {
        console.error("[settlePayment] Wallet top-up: no wallet row for user", userId);
      }
    }
  } else if (orderId) {
    const { error } = await supabase
      .from("orders")
      .update({ payment_status: "completed", is_cod: false })
      .eq("id", orderId);
    if (error) console.error("[settlePayment] Order update error:", error);
  }

  return { success: true };
}

/** Marks a still-"initiated" (never settled) row as failed. No-op if it was already settled. */
export async function markAttemptFailed(supabase: Client, razorpayOrderId: string, reason?: string): Promise<void> {
  await supabase
    .from("payment_attempts")
    .update({ status: "failed", notes: reason ?? null })
    .eq("razorpay_order_id", razorpayOrderId)
    .is("payment_id", null);
}

export async function fetchRazorpayPayment(paymentId: string): Promise<{ ok: boolean; data: any }> {
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
    headers: { Authorization: "Basic " + btoa(`${RAZORPAY_KEY_ID}:${keySecret}`) },
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok && !!data, data };
}

export async function fetchRazorpayOrderPayments(razorpayOrderId: string): Promise<{ ok: boolean; items: any[] }> {
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;
  const res = await fetch(`https://api.razorpay.com/v1/orders/${razorpayOrderId}/payments`, {
    headers: { Authorization: "Basic " + btoa(`${RAZORPAY_KEY_ID}:${keySecret}`) },
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok && !!data, items: data?.items || [] };
}
