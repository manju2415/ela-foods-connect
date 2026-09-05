-- Delivery partners could view their assigned orders but had no RLS policy
-- allowing them to update them, so status/COD updates from the driver app
-- silently affected zero rows (RLS blocks it, but PostgREST does not treat
-- a zero-row UPDATE as an error) while the UI reported success anyway.

DROP POLICY IF EXISTS "Delivery partners can update their assigned orders" ON public.orders;
CREATE POLICY "Delivery partners can update their assigned orders"
ON public.orders FOR UPDATE TO authenticated
USING (public.is_order_assigned_to_partner(id, auth.uid()))
WITH CHECK (public.is_order_assigned_to_partner(id, auth.uid()));
