## Goal

Wipe every account currently in Ela Bazar and re-seed with a clean set: one super admin plus four founding members. Each founder gets a fresh account with the number/email you provided; they complete their own profile after first login via OTP.

## Accounts to create

**Super Admin**
- 8050000300 — full access (super_admin + mlm_admin, keep as-is per earlier decision)

**Founding Members**
| Name | Phone | Email |
|---|---|---|
| Shyju V M | 9448493280 | shyjuvm@gmail.com |
| Sudevan P M | 9845121558 | info@addblr.com |
| Manoj Kumar | 9611485193 | mnrmanoj02@gmail.com |
| Vinod M S | 9845482617 | indexgr@rediffmail.com |

Note: this replaces Shyju's previous number 8050090300 with 9448493280.

## Steps

1. **Full reset via existing `reset-test-data` edge function**
   - Deletes every auth user and cleans dependent tables (wallets, referrals, orders, addresses, cart, wishlist, withdrawals, notifications, reviews, testimonials, etc.).
   - Recreates the 6 default test accounts (`9999000001`–`9999000006`, OTP `000000`) so QA logins keep working.
   - Super admin `8050000300` is auto-assigned super_admin + mlm_admin on first login via the existing `handle_new_user` trigger — no seeding needed.

2. **Re-run `seed-founding-members` edge function with updated list**
   - Update the `USERS` array so Shyju's number becomes `9448493280` (was `8050090300`).
   - Function creates each auth user with synthetic login email `91<phone>@elabazar.local`, assigns `founding_member` role, sets `user_level=founder`, generates a referral code, and ensures a wallet exists.
   - Real emails are stored on the profile for records/notifications.

3. **Login flow for founders** (no code change needed — works today)
   - Founder opens the app, enters their 10-digit mobile → OTP via MSG91 → lands in dashboard.
   - They can then fill out any remaining profile details (address, bank info for withdrawals, etc.) from the profile page.

## Notes / confirmations needed

- Super admin number `8050000300` — no seeding action required; role auto-assigned on first OTP login. Confirm you don't also want it pre-created.
- Test accounts `9999000001`–`06` will be recreated as part of reset. Say the word if you want them removed instead.
- Reset is destructive and irreversible — all current orders, wallets, referral trees, and testimonials will be gone.
