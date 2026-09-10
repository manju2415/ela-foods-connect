# Razorpay webhook: finish payments without depending on the app

Your webhook secret is saved on our side. What's missing is the endpoint Razorpay calls — it doesn't exist yet, so the secret is currently unused.

## Why this matters

Today a payment is only recorded after the customer's phone or browser calls back to us. If that tab closes or the network drops, Razorpay has the money and we have no record — which is exactly the failed callback you fixed by hand.

With the webhook, Razorpay tells our server directly and keeps retrying until we confirm, so the payment always lands even if the customer never returns to the app.

## What gets built

1. **A webhook endpoint** that Razorpay calls on every captured payment. It checks Razorpay's signature with the secret you saved, then finishes the payment exactly the way the app does today:
   - Registration: activates membership, welcome bonus, referral/founder credit, invoice
   - Order: marks the order paid
   - Wallet top-up: credits the wallet
2. **Runs once, never twice.** Whichever arrives first — the app's callback or the webhook — the other one becomes a no-op. Existing one-time guards on registration, wallet credits and order status are reused, not replaced.
3. **Failed payments** are recorded as failed instead of vanishing, so Payment Recovery can show them.

## Nothing that works today changes

The current app callback path stays exactly as it is; the completion steps are moved into one shared piece of code that both paths call, unchanged. Untouched: pricing, stock, coupons, shipping, invoices, order placement, guest checkout, logins, roles, existing accounts, wallets and past transactions. No existing records are edited.

## What you'll need to do

After this is live I'll give you the webhook URL to paste into your Razorpay dashboard (Settings → Webhooks), with the same secret you already saved, and events `payment.captured` and `payment.failed`. Until that's set in Razorpay, nothing changes for customers.

## Technical notes

- New `supabase/functions/_shared/settlePayment.ts`: the registration / wallet-topup / order branches lifted verbatim out of `razorpay-verify-payment`, plus the Razorpay payment lookup and `payment_attempts` upsert (`onConflict: payment_id`, which is already unique).
- New `supabase/functions/razorpay-webhook/index.ts`: `verify_jwt = false`, raw-body HMAC-SHA256 against `RAZORPAY_WEBHOOK_SECRET`, handles `payment.captured` and `payment.failed`, always returns 200 once processed so Razorpay stops retrying.
- Payment context (purpose, user_id, internal order_id) is read from the Razorpay order `notes`, so `razorpay-create-order` is extended to put `purpose` / `user_id` / `order_id` into `notes` for every payment; the webhook skips any payment whose notes it cannot resolve and records it as an unresolved attempt for admin review.
- `razorpay-verify-payment` keeps its exact current request/response shape so installed app builds keep working.
