# Fixes: Variants, Deferred Wallet Credit, Founder Payment, Invite Notification

## 1) Multiple weight variants per product (already built — verify/expose)

Variants (`product_variants` table + `VariantsEditor`) are already integrated into `src/pages/admin/Products.tsx`, cart, and checkout. I'll:
- Confirm the "Variants" section in the Add/Edit Product dialog is visible and saves (label like "1 KG", unit value, price, member price, stock, SKU, default flag).
- Ensure `ProductDetail` shows the variant selector and price/stock switch per variant.
- No new schema needed.

If the user reports it's missing in the current UI, we'll surface/tidy the section; no rebuild required.

## 2) Do NOT credit referrer wallet on "Add User" — only after registration payment

Current behavior: `add-network-user` edge function calls `process_mlm_referral` immediately, which credits the referrer's wallet (₹500 first-10 / ₹200 beyond, per settings — the ₹600 seen was cumulative from multiple triggers). This is wrong.

Change:
- `supabase/functions/add-network-user/index.ts`: stop calling `process_mlm_referral`. Only:
  - create the auth user,
  - set `profiles.referred_by = actualReferrerId`,
  - generate the new user's own referral code (so link is trackable),
  - insert a lightweight `referrals` row (pending, not paid) for tracking.
- `supabase/functions/process-registration-payment/index.ts`: this already calls `process_mlm_referral` after payment. Keep it — it becomes the single place where referrer bonuses, welcome bonus, and multi-level founder commissions are credited.
- Guard `process_mlm_referral` DB function to be idempotent: if a `wallet_transactions` row of type `referral_bonus` with `source_user_id = new user` already exists, skip. Prevents double-credit if invoked twice.

## 3) Founders must also pay the registration fee

Onboarding gate: `useOnboardingStatus` already forces founders/members to complete profile + `registration_fee_paid > 0`. Good.

However, `RoleBasedRedirect` / `Auth` need to route founders to `/registration-payment` before `/member-app` on first login when `isPaymentComplete === false`. Verify and fix if needed. The 4 founders' profiles were already reset (from earlier turn), so first login will land them on registration.

No exemption for `founding_member` role anywhere — grep-remove any remaining bypass in `Auth.tsx` / redirect logic.

## 4) Push/SMS notification when a user is added to the network

When `add-network-user` succeeds:
- Send an SMS to the new user via MSG91 (reuse `msg91-send-otp` infrastructure with a transactional template) with text:
  > "You have been invited by {referrer_name} to join Ela Bazar. Login with your mobile {phone} and OTP 000000 (or real OTP) to complete registration and payment. https://elabazar.com/auth"
- Create an in-app notification row (`notifications` table) for the new user so the bell shows it once they log in.
- Push notification (FCM) is only useful once the user has installed the app and registered a token — not applicable at invite time. SMS is the correct channel for pre-registration invites.

Needs a new MSG91 transactional template ID (a separate secret, e.g. `MSG91_INVITE_TEMPLATE_ID`). I'll add the secret request; user pastes the DLT-approved template ID.

## Technical summary

- Edit `supabase/functions/add-network-user/index.ts`: remove `process_mlm_referral` call, add `referrals` insert (pending), add MSG91 invite SMS send, insert `notifications` row.
- Edit `supabase/functions/process-registration-payment/index.ts`: no logic change; verify it's the sole path that credits referrer.
- Migration: add idempotency guard inside `process_mlm_referral` (check for existing `referral_bonus` transaction for the same referred user before crediting).
- Migration: refund/reset any wallet balances that were incorrectly credited for users who haven't paid yet (manual reversal of pending bonuses).
- Verify `Auth.tsx` and `RoleBasedRedirect.tsx` don't skip payment gate for `founding_member`.
- Add secret `MSG91_INVITE_TEMPLATE_ID` for the invite SMS.

## Open question
Do you have a DLT-approved MSG91 template ready for the invite SMS? If not, we'll draft the copy and you'll register it with MSG91, then paste the template ID.
