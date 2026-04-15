

## Plan: Fix "Failed to Place Order" for COD

### Root Cause
The `place-guest-order` Edge Function uses a hardcoded UUID (`00000000-...`) as a fake guest user. The `orders` table has a foreign key (`orders_user_id_fkey`) referencing `auth.users(id)`. After the recent test data reset, no such user exists in `auth.users`, causing the FK violation error:

```
Key (user_id)=(00000000-0000-0000-0000-000000000000) is not present in table "users"
```

This affects **both COD and online payment** for guest checkouts.

### Fix
Update the `place-guest-order` Edge Function to create a real anonymous auth user per guest order instead of using a hardcoded UUID. Each guest order will get a unique, real `auth.users` entry.

| File | Change |
|------|--------|
| `supabase/functions/place-guest-order/index.ts` | Replace hardcoded UUID with `supabase.auth.admin.createUser()` to create a real guest user per order. Use the guest's phone/email to create a deterministic account, or create a disposable one. Ensure profile and wallet are created for the new user. |

### Approach
- Generate a unique email like `guest_{timestamp}@elabazar.local` for each guest order
- Create a real auth user via `admin.createUser()`
- Use the returned user ID for the order insert
- This satisfies the FK constraint and keeps orders traceable

### If the user is authenticated
The authenticated checkout flow (`Checkout.tsx`) should already work for COD. If there's also an issue there, it would be a separate RLS or session problem — but the DB logs only show the guest FK error.

