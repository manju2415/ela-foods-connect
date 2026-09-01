-- Close the gap that let a client insert an order claiming wallet_amount_used
-- without any corresponding wallet debit (wallets has no client-facing UPDATE
-- policy, so only place_order_atomic / trusted server code can actually debit
-- a wallet). Legitimate order creation goes through place_order_atomic
-- (SECURITY DEFINER, runs as table owner and so is unaffected by this policy)
-- or edge functions using the service role key (also bypasses RLS). Only
-- direct client inserts via the anon/authenticated key are constrained here.
DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
CREATE POLICY "Users can create their own orders" ON public.orders
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND COALESCE(wallet_amount_used, 0) = 0);