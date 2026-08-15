# Wallet fixes + admin wallet & withdrawal controls

## What's actually wrong (verified in the database)

- **Satheesh Kumar Shabari** — his profile shows `registration fee paid = 0`, level `associate`, wallet ₹0, and there is no founder payment log for him. Because the system only pays out bonuses when the fee is recorded as paid, nothing was ever credited to him or to his referrer. His Razorpay payment succeeded but was never written back to his profile.
- **Shyju (his referrer)** — did receive ₹600 on 13 Aug (₹500 referral bonus + ₹100 level-1 commission). So the ₹600 exists, but ₹500 of it landed in the **Purchase-only** bucket, not Withdrawable, because the current MLM settings mark the referral bonus as non-withdrawable. His Withdrawable balance also shows ₹0 because his one ₹100 withdrawal request is still pending (held).
- **Welcome bonus** is currently configured as ₹0, so new paid members get nothing on activation.

## What will be built

### 1. Admin: mark registration fee as paid manually
On the Users / Founders admin screens, a "Record payment" action that lets an admin enter the amount, payment reference (Razorpay payment ID), and a note. Recording it:
- sets the profile's registration fee and activates the member level,
- writes a founder payment log entry marked as offline/manual with the reference,
- fires the existing activation path so the welcome bonus and referral/upline commissions are credited exactly once (no double payment if it already happened).

This will be used to fix Satheesh's account, which also pays Shyju correctly.

### 2. Admin: manual wallet credit / debit
A "Adjust wallet" action on any member (admin + MLM admin only) where the admin picks:
- amount,
- bucket: Withdrawable or Purchase-only,
- credit or debit,
- a mandatory reason.

It updates the wallet balances, writes a wallet transaction so the member sees it in their history, and notifies the member. All adjustments are attributed to the admin who made them.

### 3. Withdrawals: offline processing with proper statuses
The existing Withdrawal Requests admin screen gets a full lifecycle:
`pending → approved → processing → paid (withdrawn)` or `rejected` (auto-refunds the held amount, already works).

When marking as paid, the admin enters transfer reference (UTR/UPI ref), payment date and optional note. The member gets a notification and sees the reference in their wallet history. A filter by status and a CSV export of pending payouts (name, amount, bank, IFSC) is added so the admin can bulk-pay from their bank portal and then mark them paid.

### 4. Bonus configuration correction
Set the referral bonus and welcome bonus buckets to match intent (referral bonus withdrawable, welcome bonus amount confirmed) — I'll apply this once you confirm the amounts you want, since ₹500 referral currently pays into Purchase-only and welcome bonus is ₹0.

## Automated bank transfers (answer to "how do we do that?")

Money can only move to a bank account through a payout provider. Razorpay's standard Payments account cannot send money out; that requires **RazorpayX Payouts** (separate activation, business KYC, funds pre-loaded into an X account). If you activate it, I can add a "Pay now" button that triggers a real IMPS/NEFT/UPI transfer to the member's saved bank details and auto-updates the status from the payout webhook.

Until then, this plan gives you the offline route: export/see the bank details, pay from your bank, mark as withdrawn with reference. Tell me if you want the RazorpayX integration added and I'll extend the plan.

## Technical notes

- New DB function `admin_adjust_wallet(user_id, amount, bucket, direction, reason, admin_id)` — security definer, restricted to `is_admin`/`is_super_admin`/`is_mlm_admin`, writes to `wallets` + `wallet_transactions` + `notifications`.
- New DB function `admin_record_registration_payment(user_id, amount, reference, method, admin_id)` — updates `profiles.registration_fee_paid`, `user_level`, `founder_status`, inserts into `founder_payment_logs`, then relies on the existing `trg_profiles_activation_referral` trigger + `credit_pending_referral_for_user` (already idempotent via the `wallet_transactions` source-user check).
- `withdrawal_requests`: add `paid_at`, `payment_reference`, `payment_method`, and allow `processing`/`paid` in status handling; extend `process_withdrawal` with a `paid` branch that only stamps the reference (funds were already deducted at request time).
- UI: extend `src/pages/admin/Withdrawals.tsx` (status filter, mark-as-paid dialog, CSV export), add wallet-adjust and record-payment dialogs reachable from `src/pages/admin/Users.tsx` and `src/pages/admin/Founders.tsx`, plus show payout reference in `src/components/dashboard/WithdrawalSection.tsx` and the member wallet pages.
