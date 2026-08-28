# Fix: Ramesh PK's ₹3,999 payment landed on the wrong account

## What the records show

The payment did go through today (28 Aug, 11:34 UTC, ₹3,999, reference `659827726504`, invoice `REG20260828-000012`) — so the money is collected.

The problem is which account it was attached to. Phone `9845041460` has two accounts in the system:

| Account | Login email | Status |
|---|---|---|
| Real login account (created 17 Aug, last signed in 20 Aug) | `919845041460@elabazar.local` | Registration fee ₹0, level associate, agreement accepted, referred by Manoj Kumar |
| Guest account auto-created during the 24 Aug guest order | `guest_1787572001887_...@elabazar.local` | Registration fee ₹3,999 paid, level master, no referrer, no agreement |

Because the ₹3,999 was recorded on the guest account:
- When Ramesh signs in with his phone, he lands on the real account and still sees "Complete Your Registration / pay ₹4,999".
- No welcome bonus was credited to him and no referral commission was credited to Manoj Kumar (his referrer) — the wallet transaction log for the last 2 days contains nothing for either account.

## Fix

1. **Move the payment to the real account.** Re-point the registration payment log and its invoice from the guest account to `919845041460@elabazar.local`, and set that profile's registration fee to ₹3,999 with the paid/active founder-member status, so the payment gate stops appearing at login.
2. **Run the activation that was skipped.** Trigger the standard member-activation path for the real account so the welcome bonus is credited to Ramesh's wallet and the referral/upline commission is credited to Manoj Kumar, using the current MLM settings — same amounts any other paid member would get.
3. **Retire the duplicate guest account.** Keep its 24 Aug order history intact by re-assigning that order to the real account, then mark the guest profile inactive so the phone number resolves to a single account going forward.
4. **Prevent recurrence.** In the guest-order path, when the phone number already belongs to a registered account, attach the guest order to that existing account instead of creating a new `guest_*` user. Also make the registration-payment screen refuse to record a payment against a guest-type account.

## Verification

- Sign-in as `9845041460` no longer shows the registration payment screen.
- Ramesh's wallet shows the welcome bonus; Manoj Kumar's wallet shows the referral commission.
- Both the 24 Aug order and the registration invoice appear under the single account.
- A fresh guest checkout with an already-registered phone reuses that account rather than creating a duplicate.

## Technical notes

- Data repair via migration: update `founder_payment_logs.user_id`, `invoices.user_id`, `orders.user_id`, and `profiles` fields; then invoke the existing activation functions (`ensure_user_wallet`, `credit_pending_referral_for_user` / `credit_founder_commission`) for the target user.
- Code changes limited to `supabase/functions/place-guest-order/index.ts` (lookup existing profile by phone before creating a guest user) and the registration payment recording path.
