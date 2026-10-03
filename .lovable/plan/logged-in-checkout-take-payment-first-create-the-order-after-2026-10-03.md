# Logged-in checkout: take payment first, create the order after

## Goal
A logged-in customer's order is only written once Razorpay money is verified on the server. If they cancel, close, or the payment fails: no order, no wallet deduction, no stock change, no staff alert.

```text
Before:  Place order -> order + wallet + stock written -> Razorpay -> cancel if it fails
After:   Server price check -> Razorpay -> server verifies payment -> order + wallet + stock written in one step
```

## What changes for the customer
- Button reads "Pay ₹X & place order"; note under it: "Payment is required to place your order."
- No order number or "Order placed" until the order really exists.
- Cancel/fail: existing message, cart kept, can retry.
- Fully wallet-paid orders (₹0 online) work as today — no Razorpay step needed.

## How it works
1. **Price check (server).** A new read-only check works out items, prices, stock, coupon, delivery fee, wallet portion and online amount from the database — nothing trusted from the phone/browser. Nothing is written to orders, wallet or stock.
2. **Start payment.** The existing "create Razorpay order" step saves a "payment started" record holding the full checkout (items, address, delivery date/slot, pickup store, coupon, use-wallet, user) and the server-computed online amount. Razorpay opens for that amount.
3. **Verify + create order (server, one step).** When the payment is confirmed — by the app callback, the Razorpay webhook, or the hourly sweep, whichever arrives first — the shared settlement code:
   - confirms the captured amount with Razorpay,
   - calls the existing order-creation routine once (re-checks stock and prices, deducts wallet, reduces stock, writes items) and marks it paid in the same database transaction,
   - links the payment record to the new order.
   All-or-nothing: either the order, wallet deduction, stock and paid status all happen, or none do.
4. **Staff alert + email** fire only then (the new-order alert already only fires on paid orders).
5. App shows the existing success screen with the real order number.

## Safety nets
- **Duplicates:** the Razorpay payment ID is unique; order creation is keyed to it, so double taps, repeat callbacks, repeat webhooks, or webhook + callback together all return the same single order.
- **Browser/app closed after paying:** webhook (or hourly sweep) finds the paid "payment started" record with no order and creates it.
- **Paid but can't fulfil** (item sold out in the seconds of paying, or wallet spent elsewhere meanwhile): no order is forced; the payment is flagged in Admin → Payment Recovery as "needs refund" with the reason, and the customer sees "Payment received — we'll contact you / refund".
- **Underpayment** vs the server amount: rejected, flagged for recovery.

## Kept exactly as is
- Guest checkout, registration payments, wallet top-ups.
- Existing pending/unpaid orders, the unpaid-order sweep, wallet refund on unpaid cancel, Payment Recovery — all stay for old orders.
- Old installed app versions: they still call the old route; it keeps working (order-first) until they update. The server accepts both.
- Pricing, coupons, delivery fees, member prices, GST, invoices, commissions.

## Technical details
- New DB function `quote_checkout(...)` — read-only; shares pricing logic with `place_order_atomic` (extract common pricing into an internal helper so both stay identical).
- New DB function `place_paid_order(p_payment_id, ...)` — security definer, service role only: locks on payment_id, returns existing order if already created, else calls `place_order_atomic` then sets `payment_status='completed'`, all in one transaction. Raises on stock/wallet failure so nothing is written.
- `payment_attempts`: add nullable `checkout_payload jsonb` and `expected_amount numeric`; new purpose `member_order`. Additive migration only.
- `razorpay-create-order`: for `purpose='member_order'`, ignore client amount, run `quote_checkout`, store payload + expected amount.
- `_shared/settlePayment.ts`: new `member_order` branch calling `place_paid_order`; used by verify, webhook, sweep, reconcile. Failure sets attempt status `needs_refund`.
- `razorpay-verify-payment`: return `order_id` / `order_number` for member orders.
- `sweep-pending-payments`: also settle stale `member_order` attempts with captured payments.
- `src/pages/Checkout.tsx`: replace order-then-pay with quote -> pay -> success using returned order; wallet-only path calls `place_order_atomic` directly as today. Remove the client-side cancel-on-failure for the new path.
- Payment Recovery page: show `needs_refund` member orders.
- Deploy razorpay-create-order, razorpay-verify-payment, razorpay-webhook, sweep-pending-payments, reconcile-payment-attempt.

## Testing
Run against the live backend with a test account and small live amounts where needed:
- Success: one order, wallet and stock correct, marked paid, alert sent.
- Cancel and fail: no order, wallet and stock unchanged, no alert.
- Closed before callback: the webhook path, simulated by calling settlement without the client, creates the order once.
- Duplicate callback, duplicate webhook, or both together: one order.
- Split ₹1,000 = ₹500 wallet + ₹500 online: check the totals add up.
- Not enough wallet balance, and stock that went stale: rejected correctly.
- Guest checkout still works the same (regression check).

A short report of the results comes at the end. Only a real phone can confirm the closed-app case completely.
