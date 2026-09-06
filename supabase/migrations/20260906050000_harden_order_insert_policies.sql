-- Legitimate order creation always goes through place_order_atomic (runs as
-- table owner, unaffected by RLS) or an edge function using the service role
-- key (also bypasses RLS). This policy only ever constrains a direct client
-- INSERT using the anon/authenticated key, which previously could set
-- payment_status/status to anything at all — a client could insert its own
-- order row claiming payment_status = 'completed' with no payment, or any
-- price/total it liked, entirely bypassing place_order_atomic's pricing and
-- payment checks.
DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
CREATE POLICY "Users can create their own orders" ON public.orders
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND COALESCE(wallet_amount_used, 0) = 0
    AND payment_status = 'pending'
    AND status = 'pending'
  );

-- Order items may only be inserted for an order the caller owns (already
-- enforced), and only while that order is still in its initial, unpaid
-- state — once payment has completed or the order has moved past 'pending',
-- a direct client insert could otherwise append unpriced/unpaid items to an
-- already-paid order with no stock deduction or payment behind them.
DROP POLICY IF EXISTS "Users can create their own order items" ON public.order_items;
CREATE POLICY "Users can create their own order items" ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_id
        AND o.user_id = auth.uid()
        AND o.status = 'pending'
        AND o.payment_status = 'pending'
    )
  );
