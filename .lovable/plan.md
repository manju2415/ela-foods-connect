
## Plan: Add 4 Founding Members (fresh)

### What you asked for
1. Delete the existing Manoj Kumar account (`+919611485193`) from the database.
2. Create fresh accounts for all 4 users with the details you gave.
3. Mark all 4 as Founding Members so they appear in `/admin/founding-members`, `/mlm-admin/founding-members`, and `/admin/founders` / `/mlm-admin/founders`.

### The 4 users

| Name | Phone | Email |
|------|-------|-------|
| Shyju V M | 8050090300 | shyjuvm@gmail.com |
| Sudevan P M | 9845121558 | info@addblr.com |
| Manoj Kumar | 9611485193 | mnrmanoj02@gmail.com |
| Vinod M S | 9845482617 | indexgr@rediffmail.com |

### Approach

**1. New edge function `seed-founding-members`** (service-role)
For each of the 4 users:
- Look up any existing auth user by phone (variants `+91XXXXXXXXXX`, `91XXXXXXXXXX`, `XXXXXXXXXX`).
- If found (e.g. existing Manoj Kumar), delete it via `auth.admin.deleteUser` so the cascade clears `profiles`, `wallets`, `referral_codes`, etc.
- Create a fresh auth user via `auth.admin.createUser` using the standard pattern already used in the app:
  - login email: `<digits>@elabazar.local` (so MSG91 OTP login keeps working)
  - phone: `+91XXXXXXXXXX`, `phone_confirm: true`
  - `user_metadata.full_name`: real name
- The existing `handle_new_user` trigger creates the `profiles` row + wallet automatically.
- Update `profiles` with the **real email** (e.g. `shyjuvm@gmail.com`), `full_name`, `user_level = 'founder'`, `is_designated_founder = true`.
- Insert `('user_id','founding_member')` into `user_roles` (idempotent).
- Call `generate_user_referral_code(user_id)` so each gets an `ELA…` referral code.
- Return a per-user status report.

**2. Invoke once** via the edge-function test tool, then verify all 4 show up in the database.

### How they'll log in
On `/auth`, each user enters their 10-digit phone, gets an MSG91 OTP, and `createSessionForPhone` signs them into the `<phone>@elabazar.local` account we created. The "real" email shown in admin lists is the one stored on `profiles.email`.

### Files
| File | Change |
|------|--------|
| `supabase/functions/seed-founding-members/index.ts` | New one-shot edge function |
| (deploy + invoke once) | Run, then confirm 4 founding members exist |

### Notes
- Manoj Kumar's old data (wallet balance, referrals, etc.) will be wiped, since you asked for a fresh account.
- The function is idempotent: if run again it will delete + recreate cleanly, so we can safely re-run if any user fails.
- No frontend changes needed — both `/admin/founding-members` and `/mlm-admin/founding-members` already render from the same data, so all 4 will appear automatically.
