# Fix checkout failure and order query errors

## Confirmed causes

1. **Circular access rules (infinite recursion)** — verified in the database:
   - The `orders` read rule checks the delivery-assignments table.
   - The delivery-assignments read rule checks the `orders` table.
   Each one triggers the other, so Postgres aborts with "infinite recursion detected in policy for relation orders". This is why `/orders?select=*` returns 500 in the console and why admin order stats fail.

2. **Customers cannot save order lines** — the order items table has no insert rule for signed-in users (only admins). After the order row is created, saving its items is rejected, so checkout reports "Failed to place order".

## Changes

Single database migration:

- Add two security-definer helper functions:
  - `is_order_assigned_to_partner(order_id, user_id)` — checks assignments without re-triggering the orders rule.
  - `owns_order(order_id, user_id)` — checks ownership without re-triggering the assignments rule.
- Replace the delivery-partner read rule on `orders` to use `is_order_assigned_to_partner`.
- Replace the customer read rule on delivery-assignments to use `owns_order`.
- Add an insert rule on order items so a signed-in user can add items only to an order they own (uses `owns_order`).

No frontend changes; checkout code stays as is.

## Verification

- Re-run the failing order queries and confirm no recursion error.
- Place a test order end-to-end and confirm items are stored and the order appears in order history.
- Run the security linter after the migration.
