

## Plan: Fix delivery partner login for 9999000004

### Root Cause
Earlier, all records from the `delivery_partners` table were deleted (`DELETE FROM delivery_partners`). The login redirect logic (`resolveRoleRedirect`) checks for a row in the `delivery_partners` table — not the `user_roles` role. Since no row exists, the partner check returns null, and the user falls through to the next role check (which redirects elsewhere).

### Fix
Re-insert the `delivery_partners` record for the user with phone `9999000004`.

| Change | Type |
|--------|------|
| `INSERT INTO delivery_partners (user_id) SELECT id FROM profiles WHERE phone LIKE '%9999000004'` | Database migration |

This single insert restores the delivery partner record, allowing the redirect to `/driver-app` to work correctly.

