CREATE OR REPLACE FUNCTION public.is_order_assigned_to_partner(_order_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM order_assignments oa
    JOIN delivery_partners dp ON dp.id = oa.delivery_partner_id
    WHERE oa.order_id = _order_id AND dp.user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.owns_order(_order_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM orders o WHERE o.id = _order_id AND o.user_id = _user_id
  )
$$;

DROP POLICY IF EXISTS "Delivery partners can view their assigned orders" ON public.orders;
CREATE POLICY "Delivery partners can view their assigned orders"
ON public.orders FOR SELECT TO authenticated
USING (public.is_order_assigned_to_partner(id, auth.uid()));

DROP POLICY IF EXISTS "Users can view their order assignments" ON public.order_assignments;
CREATE POLICY "Users can view their order assignments"
ON public.order_assignments FOR SELECT TO authenticated
USING (public.owns_order(order_id, auth.uid()));

DROP POLICY IF EXISTS "Users can create their own order items" ON public.order_items;
CREATE POLICY "Users can create their own order items"
ON public.order_items FOR INSERT TO authenticated
WITH CHECK (public.owns_order(order_id, auth.uid()));

GRANT SELECT, INSERT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;