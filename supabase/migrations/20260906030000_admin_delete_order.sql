-- Hide individual orders from the admin list without breaking invoice links
-- or deleting customer/payment history. This is not order cancellation.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS admin_deleted_at timestamptz;

-- Existing driver policies allow order updates; keep this field admin-only
-- even when a caller bypasses the RPC and writes directly to the table.
CREATE OR REPLACE FUNCTION public.guard_admin_order_deletion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.admin_deleted_at IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.admin_deleted_at IS DISTINCT FROM OLD.admin_deleted_at) THEN
    IF auth.uid() IS NULL OR NOT COALESCE(public.is_admin(auth.uid()), false) THEN
      RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_admin_order_deletion
BEFORE INSERT OR UPDATE OF admin_deleted_at ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_admin_order_deletion();

CREATE OR REPLACE FUNCTION public.admin_delete_order(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(public.is_admin(auth.uid()), false) THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.orders SET admin_deleted_at = now()
  WHERE id = p_order_id AND admin_deleted_at IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_order(uuid) TO authenticated;
