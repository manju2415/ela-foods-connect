# Checkout/payment audit — why an unpaid order exists (findings + proposed fix)

Read-only audit. Nothing has been changed, cancelled, refunded or deployed.

## 1. Files / functions involved
- `src/pages/Checkout.tsx` → `handlePlaceOrder` (order placement, payment start, failure handling)
- Database function `place_order_atomic` (creates order, deducts wallet, reserves stock)
- `src/utils/razorpay.ts` → `initiateRazorpayPayment` / `openRazorpayCheckout` (web) and payment-bridge path (app)
- Server functions `razorpay-create-order`, `razorpay-verify-payment`, `razorpay-webhook`, `sweep-pending-payments`, shared `_shared/settlePayment.ts`
- Database trigger `restore_cancelled_order_stock` (runs when an order becomes cancelled)
- Order screens showing "Paid from wallet / Charged online": `OrderDetailPage.tsx` (app), `Dashboard.tsx` (web), `admin/Orders.tsx`

## 2. Current checkout sequence
```text
Tap "Place order"
 └─ place_order_atomic (one database step)
     - checks stock, coupon, shipping
     - DEDUCTS wallet immediately (₹500), writes "Wallet payment for order …"
     - INSERTS the order: status=pending, payment_status=pending (₹635 left)
     - reserves stock
 └─ browser opens Razorpay for ₹635 (razorpay-create-order)
     ├─ paid → razorpay-verify-payment / webhook → payment_status=completed
     │        → confirmation email, cart cleared
     ├─ closed / failed (browser still open) → browser sets order cancelled
     │        → stock returned by trigger; WALLET NOT RETURNED
     └─ browser closed, app killed, network lost → nothing happens;
              order stays pending forever, wallet stays deducted
```

## 3. Why Murali's order exists while unpaid
The order row is created **before** Razorpay is even opened — by design, so stock and wallet are held during payment. For ELA20261003-15369, the Razorpay step never completed and no "payment started" record was saved, so the payment screen probably never opened or was dropped. The clean-up only runs inside the customer's browser, so nothing cancelled the order. It remains pending/pending, with ₹500 of wallet money still deducted.

## 4. Expected or bug?
Creating the order first is intentional. Three things are real bugs:
- An unpaid order looks like a normal order to admins and customers. New-order alerts fire when it is created, not when it is paid.
- Cancelling an unpaid order returns stock but **never returns the wallet money**. Customers lose wallet balance on every failed or abandoned payment.
- Nothing on the server tidies up abandoned unpaid orders. That depends only on the customer's browser.

## 5. Is the wording misleading?
Yes. "Charged online ₹635" only shows the amount still to be paid. It never checks whether a payment went through. Same problem on all 3 screens.

## 6. Safest fix (proposed, not applied)
1. **Wording only (no risk):** show "Charged online" only when the payment is complete. Otherwise show "Awaiting online payment ₹635" or "Payment not completed". Mark these orders "Payment pending" on admin and customer lists.
2. **Hide unpaid orders from fulfilment:** admin order list, delivery assignment and new-order alerts treat orders as real only once fully paid (or fully paid by wallet). Unpaid ones go under a separate "Awaiting payment" filter.
3. **Return wallet money on cancel:** when an order that used wallet money is cancelled before it is paid, the server automatically returns the wallet money to the same balances it came from. This happens once only, with a refund line in wallet history.
4. **Server-side tidy-up:** the existing hourly sweep also cancels orders left unpaid for more than ~30 minutes. Before cancelling, it asks Razorpay whether a payment was actually captured. If yes, it marks the order paid instead. Cancelling then returns stock and wallet money (step 3).
5. Stays the same: prices, coupons, stock rules, paid orders, fully-wallet orders, guest checkout, registration payments, the webhook and verification.

Murali's order is not touched automatically. Once fixes 3–4 are live, the tidy-up would cancel it and return his ₹500. If you'd rather handle it by hand, I can leave it out.

## 7. What it touches
- UI wording/filters: yes (steps 1–2)
- Wallet handling: yes — new automatic return on cancel (step 3)
- Order creation: **no change**
- Razorpay verification/webhook: **no change**; only the sweep is extended (step 4)

You can approve every step, or only some — for example step 1 by itself as a zero-risk first change.
