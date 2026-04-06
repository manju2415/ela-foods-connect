CREATE POLICY "Delivery partners can reject their assignments"
ON public.order_assignments
FOR DELETE
TO public
USING (
  status = 'assigned' AND
  EXISTS (
    SELECT 1 FROM delivery_partners dp
    WHERE dp.id = order_assignments.delivery_partner_id
    AND dp.user_id = auth.uid()
  )
);