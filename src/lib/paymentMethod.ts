// Human-readable payment method label, derived the same way
// issue_order_invoice() (supabase/migrations/20260909121906_*.sql) categorizes
// an order for its stored invoices.payment_method: COD wins if set, otherwise
// wallet vs. Razorpay is decided by whether the wallet fully covered the order.
// Kept in one place so the order detail views (admin + customer) and the
// invoice agree on wording.
export interface OrderPaymentInfo {
  is_cod?: boolean | null;
  wallet_amount_used?: number | null;
  total_amount?: number | null;
}

// orders.total_amount is only the amount actually charged online — it's
// already net of wallet_amount_used, so a fully wallet-paid order shows
// total_amount = 0. That reads as "free" in any list/summary that displays
// total_amount directly. This reconstructs the real order value (what the
// customer was actually charged for, before wallet was applied) so it can be
// shown regardless of how the order was paid.
export const orderValue = (order: { total_amount?: number | null; wallet_amount_used?: number | null }): number =>
  Number(order.total_amount || 0) + Number(order.wallet_amount_used || 0);

export const orderPaymentMethodLabel = (order: OrderPaymentInfo): string => {
  if (order.is_cod) return "Cash on Delivery";
  const walletUsed = Number(order.wallet_amount_used || 0);
  const remaining = Number(order.total_amount || 0);
  if (walletUsed > 0 && remaining <= 0) return "Wallet";
  if (walletUsed > 0 && remaining > 0) return "Wallet + Razorpay";
  return "Razorpay";
};

// Maps the short code stored on invoices.payment_method ('cod' | 'wallet' |
// 'online') to the same wording used above. 'online' covers both pure-Razorpay
// and partial-wallet-then-Razorpay orders — if the invoice also recorded a
// wallet_amount, call this out explicitly rather than just saying "Razorpay".
export const invoicePaymentMethodLabel = (
  paymentMethod: string | null | undefined,
  walletAmount?: number | null
): string => {
  const code = (paymentMethod || "").toLowerCase();
  if (code === "cod") return "Cash on Delivery";
  if (code === "wallet") return "Wallet";
  if (code === "online" || code === "razorpay") {
    return Number(walletAmount || 0) > 0 ? "Wallet + Razorpay" : "Razorpay";
  }
  return paymentMethod || "—";
};
