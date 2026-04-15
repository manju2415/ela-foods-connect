CREATE POLICY "Delivery partners can view their assigned orders"
ON public.orders FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM order_assignments oa
    JOIN delivery_partners dp ON dp.id = oa.delivery_partner_id
    WHERE oa.order_id = orders.id AND dp.user_id = auth.uid()
  )
);