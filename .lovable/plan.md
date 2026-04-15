

## Plan: Fix 7 Platform Issues

### Issue 1: New users getting Super Admin role
**Root cause**: The `handle_new_user` database trigger includes phone `9108682966` in the super_admin pattern. User "charan" already has this role incorrectly.

**Fix**:
- Database migration: Update `handle_new_user` trigger to remove `9108682966` from super_admin patterns.
- Data fix (insert tool): Delete the incorrect `super_admin` role for user "charan" (phone `09108682966`).

### Issue 2: Member Dashboard earnings not updating
**Root cause**: `ReferralSection.tsx` (line 45) calculates earnings from `referrals.incentive_amount`, which defaults to 0. Actual commissions are in `wallet_transactions`.

**Fix**: Update `ReferralSection.tsx` to query `wallet_transactions` (type `referral_bonus`) joined through `wallets` for the user, summing amounts where `source_user_id` matches referred users.

### Issue 3: Super Admin can't create founding members
**Root cause**: Founding Members page exists at `/admin/founding-members` but is missing from `AdminSidebar.tsx`. Also, no user removal feature exists.

**Fix**:
- Add `{ title: "Founding Members", url: "/admin/founding-members", icon: Crown, superAdminOnly: true }` to `AdminSidebar.tsx`.
- Add a "Remove User" button in `Users.tsx` with a new `remove-user` edge function that calls `supabase.auth.admin.deleteUser()`.

### Issue 4: Founding member form asks for email
**Root cause**: `FoundingMembers.tsx` uses email input and searches `profiles.email`.

**Fix**: Change to a 10-digit phone input, search by `profiles.phone` using `+91` prefix, update labels and placeholders.

### Issue 5: Referral bonus & commission on registration
**Status**: Already working — `process_mlm_referral` credits referrer and `credit_founder_commission` handles upline. Will verify flow is intact after trigger fix in Issue 1.

### Issue 6: Delivery app fixed ₹50 charge
**Root cause**: `EarningsSummary.tsx` uses hardcoded `COMMISSION_RATE = 0.05` (5%). The shipping flat rate (₹50) from `useShippingSettings` is separate.

**Fix**: Add a `delivery_commission` setting to `platform_settings` and read it in `EarningsSummary.tsx`. Also add a "Delivery Commission" field in admin Settings page.

### Issue 7: Razorpay "Failed to create order"
**Root cause**: Likely the Razorpay SDK script not loaded, or the preview URL not whitelisted in Razorpay dashboard.

**Fix**:
- Add SDK load check in `razorpay.ts`: if `!window.Razorpay`, dynamically load the script or show a clear error.
- Check edge function logs for `razorpay-create-order` errors.
- The hardcoded `keyId` in the edge function (`rzp_live_SbI9NJkqWwYUvV`) should be moved to a secret for security.

---

### Files to create/edit

| File | Change |
|------|--------|
| Database migration | Update `handle_new_user` trigger (remove `9108682966`) |
| Data fix | Delete charan's `super_admin` role |
| `src/components/admin/AdminSidebar.tsx` | Add "Founding Members" menu item |
| `src/pages/admin/FoundingMembers.tsx` | Change email → phone input and search |
| `src/components/dashboard/ReferralSection.tsx` | Fix earnings to use `wallet_transactions` |
| `src/components/delivery/EarningsSummary.tsx` | Configurable commission from `platform_settings` |
| `src/pages/admin/Settings.tsx` | Add delivery commission setting field |
| `src/utils/razorpay.ts` | Add SDK load guard with dynamic script injection |
| `src/pages/admin/Users.tsx` | Add remove user button |
| `supabase/functions/remove-user/index.ts` | New edge function for user deletion |

