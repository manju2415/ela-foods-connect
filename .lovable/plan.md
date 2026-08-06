# Fix "Failed to place order" at checkout

## What's wrong

Two database access-rule problems, both confirmed by inspecting the live policies:

1. **Circular rule between orders and deliveries.** The "orders" table has a rule that looks up delivery assignments, and the delivery assignments table has a rule that looks back up at orders. The database detects this loop and rejects the request with "infinite recursion detected in policy for relation orders". Checkout reads the order back right after creating it, so the whole order placement fails. The same error is already visible on the admin dashboard (order totals and counts return 500).

2. **Customers cannot save order line items.** The order_items table only allows admins to insert. Even if the order row is created, its items would be rejected.

## The fix

- Add two helper database functions that bypass the recursion (security-definer): one that answers "is this order assigned to this delivery partner?" and one that answers "does this order belong to this user?".
- Rewrite the two looping policies to call those helpers instead of querying each other directly.
- Add an insert rule on order_items so a customer can add items to an order they own (admins keep full access).

## Technical details

```sql
create or replace function public.is_order_assigned_to_partner(_order_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from order_assignments oa
    join delivery_partners dp on dp.id = oa.delivery_partner_id
    where oa.order_id = _order_id and dp.user_id = _user_id)
$$;

create or replace function public.owns_order(_order_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from orders o where o.id = _order_id and o.user_id = _user_id)
$$;
```

- Replace `orders` policy "Delivery partners can view their assigned orders" with `is_order_assigned_to_partner(id, auth.uid())`.
- Replace `order_assignments` policy "Users can view their order assignments" with `owns_order(order_id, auth.uid())`.
- Also switch the `order_items` select policy to `owns_order(order_id, auth.uid())` for consistency, and add:
  `create policy "Users can create their own order items" on public.order_items for insert to authenticated with check (public.owns_order(order_id, auth.uid()));`
- Confirm grants exist for `authenticated` on both tables.

## Verification

Re-run the failing admin queries (orders totals/count) and confirm they return data instead of a 500, then place a test checkout end to end.
