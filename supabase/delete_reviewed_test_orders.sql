-- One-time permanent cleanup of the 21 orders in the reviewed CSV export.
-- Run in Supabase SQL Editor. Preserves accounts, wallets and inventory.
-- Removes the matched orders, their invoices and cascading dependent rows.
-- Aborts rather than deleting if any order differs from the reviewed export.
BEGIN;

CREATE TEMP TABLE reviewed_test_orders (
  id uuid PRIMARY KEY, order_number text, account_phone text, shipping_phone text,
  status text, payment_status text, total_amount numeric, wallet_amount_used numeric
) ON COMMIT DROP;
INSERT INTO reviewed_test_orders VALUES
  ('53b75b02-5044-4091-8554-7341537de317', 'ELA20260905-51537', '9999000005', '9999000005', 'pending', 'pending', '155.00', '0.00'),
  ('b20c576b-22b7-4f29-a7f4-71ccf2757281', 'ELA20260902-25868', '9999000005', '9999000005', 'pending', 'pending', '164.00', '0.00'),
  ('321e68ed-5b12-413b-bc99-ddc877d77429', 'ELA20260902-25828', '9999000005', '9999000005', 'pending', 'pending', '160.00', '0.00'),
  ('e13e3304-0808-4357-9a4d-3c6871a72c88', 'ELA20260902-64696', '9999000005', '9999000005', 'pending', 'pending', '160.00', '0.00'),
  ('b40d4fd9-dd62-400b-b2b0-d234ab5f9c4d', 'ELA20260901-639', '9999000005', '9999000005', 'pending', 'pending', '160.00', '0.00'),
  ('fe80c50b-8b81-4127-b0f4-7045a8dfa4b0', 'ELA20260901-22385', '9999000005', '9999000005', 'pending', 'pending', '420.00', '0.00'),
  ('f2267792-b7db-427b-963e-64dd370423ea', 'ELA20260901-49516', '9999000005', '9999000005', 'pending', 'pending', '420.00', '0.00'),
  ('98efbc99-d213-4b34-8fd5-cfec666f438d', 'ELA20260901-80178', '9999000005', '9999000005', 'pending', 'pending', '420.00', '0.00'),
  ('74677931-5e61-4336-a18d-47b58d162d38', 'ELA20260901-50271', '9999000005', '9999000005', 'pending', 'pending', '420.00', '0.00'),
  ('67a27c0c-39b7-46d2-a56c-a97ec8187bed', 'ELA20260901-76649', '9999000005', '9999000005', 'pending', 'pending', '335.00', '0.00'),
  ('031c22fe-4f6d-4112-b2be-5c7ebaefcdd8', 'ELA20260901-56330', '9999000005', '9999000005', 'pending', 'pending', '335.00', '0.00'),
  ('56d9d49a-589d-45ea-b9c3-cbeb401ed842', 'ELA20260901-86234', '9999000005', '9999000005', 'pending', 'pending', '164.00', '0.00'),
  ('2aa91cc5-870c-4d4d-b4b5-a55e718901f8', 'ELA20260901-54195', '9999000005', '9999000005', 'pending', 'pending', '164.00', '0.00'),
  ('25422d17-b5bb-4372-a76f-319a3aae5b16', 'ELA20260901-35192', '9999000005', '9999000005', 'pending', 'pending', '164.00', '0.00'),
  ('a0d061a4-96fe-474f-8386-7db59f0fc088', 'ELA20260901-81745', '9999000005', '9999000005', 'pending', 'pending', '171.00', '0.00'),
  ('d4109670-08ae-4c67-b0bb-91210da15203', 'ELA20260901-24404', '9999000005', '9999000005', 'pending', 'pending', '171.00', '0.00'),
  ('fb2c6de4-587a-425b-973c-011a7919f9c9', 'ELA20260831-66516', '9999000005', '9999000005', 'pending', 'pending', '295.00', '0.00'),
  ('c2cace89-3977-4a3c-8e29-157ba8135d25', 'ELA20260831-79326', '9999000005', '9999000005', 'pending', 'pending', '145.00', '0.00'),
  ('235aec11-d3bf-45fe-ab45-7f8f8124782a', 'ELA74240185', '9999000002', '9108289912', 'cancelled', 'failed', '195.00', '0.00'),
  ('e160b520-aab2-4185-9838-ee0effb73af8', 'ELA19952488', '9999000002', '9108289912', 'pending', 'pending', '51.00', '0.00'),
  ('b39b60f0-f5ed-4adf-94bc-47975d70df23', 'ELA98782335', '9999000001', '9108289912', 'pending', 'pending', '52.00', '0.00');

DO $$
DECLARE v_count integer;
BEGIN
  -- Prevent payment/order changes during validation and deletion.
  PERFORM o.id FROM public.orders o
  JOIN reviewed_test_orders t ON t.id = o.id
  ORDER BY o.id FOR UPDATE OF o;

  SELECT count(*) INTO v_count FROM public.orders o
  JOIN reviewed_test_orders t ON t.id = o.id
  JOIN public.profiles p ON p.id = o.user_id
  WHERE o.order_number = t.order_number
    AND right(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), 10) = t.account_phone
    AND t.account_phone IN ('9999000001','9999000002','9999000003','9999000004','9999000005')
    AND right(regexp_replace(coalesce(o.shipping_address->>'phone', ''), '[^0-9]', '', 'g'), 10) = t.shipping_phone
    AND o.status::text = t.status
    AND o.payment_status::text = t.payment_status
    AND o.total_amount = t.total_amount
    AND coalesce(o.wallet_amount_used, 0) = t.wallet_amount_used
    AND coalesce(o.wallet_amount_used, 0) = 0;
  IF v_count <> 21 THEN
    RAISE EXCEPTION 'Cleanup stopped: orders changed or are missing. Run the preview again.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payment_attempts a JOIN reviewed_test_orders t ON t.id = a.order_id
  ) OR EXISTS (
    SELECT 1 FROM public.wallet_transactions w JOIN reviewed_test_orders t ON w.reference_id::text = t.id::text
  ) THEN
    RAISE EXCEPTION 'Cleanup stopped: a linked payment or wallet transaction exists.';
  END IF;
END;
$$;

-- Invoices restrict parent deletion, so remove only invoices of these exact orders.
DELETE FROM public.invoices i USING reviewed_test_orders t
WHERE i.order_id = t.id AND i.invoice_type = 'order';

-- Items, assignments, return requests and delivery logs follow their existing
-- ON DELETE CASCADE relationships. No status change or stock restoration occurs.
DELETE FROM public.orders o USING reviewed_test_orders t WHERE o.id = t.id;

SELECT t.order_number AS deleted_order, t.account_phone
FROM reviewed_test_orders t
WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = t.id)
ORDER BY t.order_number;

COMMIT;
