# Fix: paid registrations not completing (wallet bonus missing)

## What is actually happening

Razorpay itself is fine. Both of today's payments (₹3,999 each — Akshay p k at 10:12 and Satheesh T C at 14:55 IST) were taken and verified successfully; both are recorded as verified in the payment records.

What broke is the step *after* payment. In the mobile app, payment opens in a separate browser tab, and the app only finishes the registration (welcome credit of ₹3,000, activation, referral payouts) when that tab hands control back to the app. For both of today's payments the hand-back did not happen, so:

- money was collected and verified,
- the ₹3,000 welcome credit was never added (admin added it by hand),
- the account was only activated because an admin recorded the payment manually.

Yesterday's payment (Prijo, 5 Sep) completed normally, which is why this looks intermittent — it depends on the phone returning to the app.

## The fix

Make registration complete on the server at the moment the payment is verified, so it no longer depends on the phone coming back to the app.

1. When a payment is verified and marked as a registration payment, the server itself performs the whole registration completion: mark the fee as paid, activate the account, add the ₹3,000 welcome credit, record the wallet entry, send the notification, and run the referral payouts.
2. Make this safe to run twice — if the app *does* come back and asks again, nothing is duplicated (no double credit, no double referral bonus).
3. Add a small recovery action on the existing Payment Recovery admin page: list verified registration payments where the welcome credit was never added, with a one-click "Complete registration" button, so this never needs manual wallet edits again.
4. Leave today's two accounts as they are — an admin already corrected them by hand.

## Technical notes

- Move the body of `supabase/functions/process-registration-payment/index.ts` into a shared module under `supabase/functions/_shared/` that takes a service-role client, a user id and a verified payment id.
- Call it from `supabase/functions/razorpay-verify-payment/index.ts` in the `purpose === "registration"` branch (currently a no-op comment), using `attempt.user_id` / the `order_id` field that carries the user id.
- Keep `process-registration-payment` as the client-facing entry point, now delegating to the same shared module, so the existing web flow is unchanged.
- Idempotency: skip the welcome credit when a `wallet_transactions` row of type `credit` with description `Registration welcome bonus` already exists for that wallet, and skip the profile/referral work when `registration_fee_paid > 0`.
- Recovery listing: registration rows in `payment_attempts` whose user has no `Registration welcome bonus` wallet transaction.
- No schema change.
