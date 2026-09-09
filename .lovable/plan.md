# Never lose a payment again (payment callback failures)

## What is actually going wrong

Right now a payment is only recorded **after the customer's phone or browser successfully calls back to our server**. Razorpay collects the money first; our system only learns about it when the app reports back.

So if the payment tab closes, the network drops, or the app doesn't hand control back (common on phones), the result is:

- Razorpay has the money
- Our database has **no record at all** — not even a failed one
- The customer sees a failure, and you have to fix it by hand

The database confirms this: there are no payment records at all for the last few days, including the one you adjusted manually. There is nothing for the existing "Payment Recovery" screen to find, because the record was never created.

## The fix

**1. Record the payment intent before the customer pays**
The moment a payment is started, save a "payment started" record (who, what for, amount, cart/registration details). Every payment then leaves a trail, even if the customer never gets back to the app.

**2. Let Razorpay tell us directly (the real fix)**
Add a Razorpay webhook — Razorpay calls our server directly when money is captured, and keeps retrying until we confirm. This does not depend on the customer's phone or browser at all. Registration completion, order payment status, and wallet top-ups all finish automatically from this call.

**3. Automatic hourly sweep**
Any "payment started" record older than 15 minutes that is still unfinished is checked against Razorpay automatically and completed if the money was actually taken. Belt and braces, in case the webhook is ever misconfigured.

**4. Admin: fix any payment by ID**
In Payment Recovery, add "Look up Razorpay payment ID" — paste the ID from Razorpay, see what it was for, and complete it with one click. No more manual database edits.

## Making sure nothing that works today breaks

The current success path stays exactly as it is. The completion logic (registration, welcome bonus, referral credit, order payment status, wallet top-up) is moved into one shared piece of code, unchanged, so the webhook, the sweep, and the existing app callback all do exactly the same thing.

Everything runs **once and only once**, whichever path arrives first:

- Registration: already guarded, and re-checked before crediting
- Wallet top-up: protected by an existing one-record-per-payment rule
- Orders: payment status set to completed is a no-op if already completed
- Referral / founder credit and welcome bonus: unchanged, still one-time

Not touched: pricing, stock, shipping, coupons, invoices, order placement, guest checkout, logins, roles, existing accounts, wallets and past transactions. No existing records are edited by this change.

## Something you need to do

The webhook needs to be switched on in your Razorpay dashboard (one URL + a secret you choose). I'll give you the exact URL and ask you for the secret when we get there. Until then, steps 1, 3 and 4 already stop payments from being lost.

## Technical notes

- Migration: allow `payment_attempts.payment_id` to be null for "initiated" rows, add a unique index on `razorpay_order_id`, extend the status check with `initiated`/`failed`.
- New shared module `supabase/functions/_shared/settlePayment.ts`: signature/amount checks, attempt upsert, and the registration / wallet-topup / order branches lifted verbatim from `razorpay-verify-payment`.
- `razorpay-create-order`: accepts and stores attempt context, inserts the `initiated` row keyed by `razorpay_order_id`.
- New `razorpay-webhook` (public, `verify_jwt = false`, HMAC-SHA256 against `RAZORPAY_WEBHOOK_SECRET`, handles `payment.captured` and `payment.failed`, always returns 200 after processing).
- New `sweep-pending-payments`: fetches Razorpay status for `initiated` rows older than 15 minutes, settles captured ones, marks the rest failed; scheduled hourly with pg_cron + pg_net.
- `razorpay-verify-payment` keeps its current request shape so installed app builds keep working; it just calls the shared module.
- `PaymentRecovery.tsx`: new `settle_by_payment_id` action in `reconcile-payment-attempt`, admin-only as today.
