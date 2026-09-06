# Stop the recurring breakages — fix what's real, remove what causes regressions

I checked every open issue against the live site and database instead of trusting the reports. Of the 9 flagged problems, 5 are already fixed or cannot happen on the live site, and 4 are real. I also found the underlying reason new problems keep appearing after each change.

## Why one fix keeps breaking something else

There are leftover change-scripts in the project that were written but never applied to the live database. The live database and the project's own record of changes no longer match. When a later change is made, it can silently re-apply or undo one of these leftovers, and something unrelated breaks.

The clearest example: a leftover script changes stock so it is only reduced once an order is paid. It was never applied, and a later change restored the old behaviour. If anyone applies that leftover now, every paid order would reduce stock twice and products would falsely show "Out of Stock". This is exactly the "fix one thing, break another" pattern.

Cleaning this up is the most important item here.

## What is actually broken (verified)

1. **Three customers cannot log in.** Sneha (9217736571), samar roy (9708313145) and vvg b (8652159781) first ordered as guests. Their accounts were created under a temporary internal identity, and the current login only looks for the standard one. They enter the correct code and are told "Account not found. Please contact admin to be added." A repair routine for this exists in the project but is no longer being called.

2. **Order confirmation emails are not reaching customers.** The email service is rejecting the requests with "API key is invalid". Worse, the app records "Email sent successfully" anyway, so nobody noticed. A valid key is needed from you.

3. **The leftover change-scripts described above.**

4. **"Send OTP" occasionally fails before it starts.** Intermittent server errors on the login and phone-check services. Cause is not yet confirmed, so the first step is recording each attempt so we can see the pattern rather than guessing.

## What was reported but is not a live problem

Checked directly against the live database — no work needed, these will be closed:

- Product listings failing on a missing "fast selling" field — the field now exists; 104 products load fine.
- Stock subtracted twice per paid order — the payment-time stock step does not exist on the live database; stock is reduced exactly once.
- Cash-on-delivery orders not reducing stock — cash on delivery has been removed entirely.
- Paid orders staying unpaid because stock was released — that mechanism is not live.
- Empty homepage sections — live counts are 16 featured, 55 best sellers, 22 new arrivals.

## What I'll do

1. Restore the guest-account repair inside the login step so any customer whose account was created at guest checkout is matched by phone number and signed in normally. Repair the three affected accounts directly so they work immediately.
2. Delete the leftover change-scripts that were never applied and are now contradicted by the live database, so they can never be applied by accident.
3. Make the order-confirmation email report failure honestly instead of reporting success, and show the real reason in the admin logs. Once you provide a valid email-service key, confirmations start going out again.
4. Add a record of every login-code attempt (number, time, outcome) so the intermittent failures can be traced instead of guessed at, and retry once automatically when the service hiccups.
5. Add a small safety net on the homepage so it always shows products even if every section is empty.
6. Add a short pre-publish checklist covering the flows that keep regressing — login by phone, place and pay for an order, stock count after the sale, wallet credit, invoice — so a change is checked against all of them before it goes live.

## Technical notes

- `supabase/functions/verify-otp-login/index.ts`: after `generateLink` fails for `{cleanPhone}@elabazar.local`, look up `profiles` by last-10-digit phone match, and if a profile exists, re-point that auth user's email to the deterministic address with `email_confirm: true` (the logic already in `link-phone-login`), then continue with password rotation and sign-in. Fold `link-phone-login` in rather than calling it, so there is one code path.
- Repair the three mismatched accounts with a direct admin update.
- Remove `supabase/migrations/20260902000000_deduct_stock_on_payment.sql` (never applied; contradicted by the live `place_order_atomic`, which deducts inline) and audit `20260901000000`, `20260902010000`, `20260902020000`, `20260904000000`, `20260905000000`–`20260905070000` against `supabase_migrations.schema_migrations`; keep only files whose effect is present live, delete the rest.
- `supabase/functions/send-order-confirmation/index.ts`: check the Resend response for `error` and return a non-2xx with the provider status/body instead of logging "Email sent successfully". Requires a new `RESEND_API_KEY`.
- New `otp_send_log` table (phone, created_at, outcome, provider request id, error) written from `msg91-send-otp`, admin-read only, with RLS and grants.
- `HomepageProductSections.tsx`: fall back to newest active products when all enabled sections resolve empty.
- No schema changes to `orders`, `products` or stock handling — deliberately leaving the working path alone.

## What I need from you

A valid key for the order-confirmation email service. Everything else I can do without you.
