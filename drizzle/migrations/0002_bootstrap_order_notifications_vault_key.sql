CREATE OR REPLACE FUNCTION public.bootstrap_order_notifications_key(p_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_key IS NULL OR length(p_key) < 20 THEN
    RAISE EXCEPTION 'invalid key';
  END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'order_notifications_service_key';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_key, 'order_notifications_service_key', 'Order notification cron worker key');
  ELSE
    PERFORM vault.update_secret(v_id, p_key);
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.bootstrap_order_notifications_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_order_notifications_key(text) TO service_role;