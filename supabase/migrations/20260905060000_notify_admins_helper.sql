-- Account-deletion requests were notifying the requesting customer's own
-- notification feed (they already know they asked) instead of any admin,
-- so the request could go unseen by staff indefinitely. Add a small,
-- reusable "notify every admin" helper, mirroring the admin fan-out already
-- used by notify_new_order().
CREATE OR REPLACE FUNCTION public.notify_admins(p_title text, p_message text, p_type text DEFAULT 'info', p_reference_type text DEFAULT NULL, p_reference_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rec record;
BEGIN
  FOR v_rec IN
    SELECT DISTINCT ur.user_id FROM user_roles ur WHERE ur.role IN ('super_admin', 'admin')
  LOOP
    INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (v_rec.user_id, p_title, p_message, p_type, p_reference_type, p_reference_id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_admins(text, text, text, text, uuid) TO authenticated;
