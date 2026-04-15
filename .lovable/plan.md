

## Plan: Fix 3 Issues (Member Redirect, Order Amount, Assignment Notifications)

### Issue 1: Phone 9999000006 redirects to Admin instead of Member App

**Root cause**: The user created with phone `9999000006` likely has a stale `admin` or `super_admin` role in `user_roles` from before the trigger cleanup. The `resolveRoleRedirect` function checks `is_admin()` (which returns true for `admin` or `super_admin`) before checking for `member` role, so admin takes priority.

**Fix**:
- Database migration: Delete any `admin`/`super_admin`/`mlm_admin` roles for the user with phone `9999000006`, keeping only the `member` role.
- Query: `DELETE FROM user_roles WHERE user_id = (SELECT id FROM profiles WHERE phone LIKE '%9999000006') AND role NOT IN ('member');`

### Issue 2: Order amount not displayed in Delivery App

**Root cause**: The `orders` table RLS only allows SELECT for the order's own `user_id` or admins. Delivery partners are neither, so when the dashboard queries `orders` for assigned order details, the rows are filtered out by RLS — returning empty results, causing `total_amount` to show as 0 or "N/A".

**Fix**:
- Database migration: Add a new RLS policy on `orders` table allowing delivery partners to SELECT orders that are assigned to them:
```sql
CREATE POLICY "Delivery partners can view their assigned orders"
ON public.orders FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM order_assignments oa
    JOIN delivery_partners dp ON dp.id = oa.delivery_partner_id
    WHERE oa.order_id = orders.id AND dp.user_id = auth.uid()
  )
);
```

### Issue 3: Delivery partner notification on order assignment

**Status**: Already implemented. The `OrderAssignments.tsx` (line 193) calls `supabase.rpc("create_notification", ...)` with title "New Order Assigned" when an order is assigned. The `NotificationBell` component subscribes to real-time inserts on the `notifications` table. The `DeliveryDashboard` (lines 160-180) also subscribes to real-time changes on `order_assignments` and shows a toast.

**Verification needed**: The notification system works for in-app notifications. Push notifications (FCM) require the `FCM_SERVER_KEY` secret which is not currently configured — push will only work once that's set up. But in-app notifications and real-time toasts should work now.

No code changes needed for Issue 3.

---

### Files to change

| Change | Type |
|--------|------|
| Clean up stale roles for phone `9999000006` | Database migration |
| Add RLS policy on `orders` for delivery partners | Database migration |

Both fixes are a single database migration.

