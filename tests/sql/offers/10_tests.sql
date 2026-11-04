-- Offers Stage A tests. Each block prints "Tn ok" or stops with an error.
\set ON_ERROR_STOP 1

-- expect_error(sql, pattern): the statement must fail with a message matching pattern.
CREATE FUNCTION public.expect_error(p_sql text, p_pattern text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN others THEN
    IF SQLERRM !~* p_pattern THEN
      RAISE EXCEPTION 'expected error like "%", got "%" for: %', p_pattern, SQLERRM, p_sql;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'expected an error like "%" but it succeeded: %', p_pattern, p_sql;
END $$;

-- T1: master switch created off; a re-run of the migration must not flip it.
DO $$ BEGIN
  IF (SELECT value FROM platform_settings WHERE key = 'offers_settings') <> '{"enabled": false}'::jsonb THEN
    RAISE EXCEPTION 'offers_settings not created off';
  END IF;
  RAISE NOTICE 'T1 ok';
END $$;

-- T2: kind/limit/window constraints (as the table owner, so RLS is not involved).
DO $$ BEGIN
  PERFORM expect_error($q$INSERT INTO offers(kind, name, starts_at, ends_at) VALUES ('flash', 'x', now(), now() + interval '1 day')$q$, 'offers_kind_check');
  PERFORM expect_error($q$INSERT INTO offers(kind, name, starts_at) VALUES ('festival', 'Diwali', now())$q$, 'offers_end_required');
  PERFORM expect_error($q$INSERT INTO offers(kind, name, starts_at, ends_at) VALUES ('deal_of_day', 'Deal', now(), now() - interval '1 hour')$q$, 'offers_window_valid');
  PERFORM expect_error($q$INSERT INTO offers(kind, name, starts_at, ends_at) VALUES ('deal_of_day', 'Deal', now(), now())$q$, 'offers_window_valid');
  PERFORM expect_error($q$INSERT INTO offers(kind, name, starts_at) VALUES ('cart_unlock', 'Rs 9', now())$q$, 'offers_min_cart_value');
  PERFORM expect_error($q$INSERT INTO offers(kind, name, starts_at, min_cart_value) VALUES ('cart_unlock', 'Rs 9', now(), 0)$q$, 'offers_min_cart_value');
  PERFORM expect_error($q$INSERT INTO offers(kind, name, starts_at, ends_at, min_cart_value) VALUES ('festival', 'D', now(), now() + interval '1 day', 250)$q$, 'offers_min_cart_value');
  PERFORM expect_error($q$INSERT INTO offers(kind, name, starts_at, min_cart_value, max_units_per_order) VALUES ('cart_unlock', 'x', now(), 250, 0)$q$, 'max_units_per_order');
  PERFORM expect_error($q$INSERT INTO offers(kind, name, starts_at, min_cart_value, max_units_per_customer) VALUES ('cart_unlock', 'x', now(), 250, 0)$q$, 'max_units_per_customer');
  PERFORM expect_error($q$INSERT INTO offers(kind, name, starts_at, min_cart_value, total_units_cap) VALUES ('cart_unlock', 'x', now(), 250, -1)$q$, 'total_units_cap');
  PERFORM expect_error($q$INSERT INTO offers(kind, name, starts_at, min_cart_value, customer_limit_period) VALUES ('cart_unlock', 'x', now(), 250, 'week')$q$, 'customer_limit_period');
  PERFORM expect_error($q$INSERT INTO offers(kind, name, starts_at, min_cart_value) VALUES ('cart_unlock', '   ', now(), 250)$q$, 'name_check');
  PERFORM expect_error($q$INSERT INTO offers(kind, name, starts_at, min_cart_value, audience) VALUES ('cart_unlock', 'x', now(), 250, 'vip')$q$, 'audience_check');
  RAISE NOTICE 'T2 ok';
END $$;

-- T3: defaults: OFF, 1 per order, no limits; a ₹9 offer may be open-ended.
DO $$ DECLARE r offers%ROWTYPE; BEGIN
  INSERT INTO offers(id, kind, name, starts_at, min_cart_value)
  VALUES ('30000000-0000-0000-0000-000000000001', 'cart_unlock', '  Rs 9 deals  ', now() - interval '1 hour', 250) RETURNING * INTO r;
  IF r.is_active OR r.max_units_per_order <> 1 OR r.max_units_per_customer IS NOT NULL OR r.total_units_cap IS NOT NULL
     OR r.customer_limit_period <> 'offer' OR r.audience <> 'all' OR r.name <> 'Rs 9 deals' THEN
    RAISE EXCEPTION 'unexpected defaults: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'T3 ok';
END $$;

-- T4: offer items: price > 0, variant must belong to product, product with options needs one, no duplicates.
DO $$ BEGIN
  PERFORM expect_error($q$INSERT INTO offer_items(offer_id, product_id, offer_price) VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 0)$q$, 'offer_price_check');
  PERFORM expect_error($q$INSERT INTO offer_items(offer_id, product_id, offer_price) VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', -9)$q$, 'offer_price_check');
  PERFORM expect_error($q$INSERT INTO offer_items(offer_id, product_id, offer_price) VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 9)$q$, 'sold in options');
  PERFORM expect_error($q$INSERT INTO offer_items(offer_id, product_id, variant_id, offer_price) VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 9)$q$, 'does not belong');
  INSERT INTO offer_items(offer_id, product_id, offer_price) VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 9);
  INSERT INTO offer_items(offer_id, product_id, variant_id, offer_price) VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 9);
  INSERT INTO offer_items(offer_id, product_id, variant_id, offer_price) VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 99);
  PERFORM expect_error($q$INSERT INTO offer_items(offer_id, product_id, offer_price) VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 8)$q$, 'offer_items_once');
  PERFORM expect_error($q$INSERT INTO offer_items(offer_id, product_id, variant_id, offer_price) VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 8)$q$, 'offer_items_once');
  -- editing just the price of an existing row is fine
  UPDATE offer_items SET offer_price = 10 WHERE product_id = '10000000-0000-0000-0000-000000000001';
  RAISE NOTICE 'T4 ok';
END $$;

-- T5: the kind can't be changed; deactivated_at follows the switch; created_* is fixed.
DO $$ DECLARE r offers%ROWTYPE; v_created timestamptz; BEGIN
  SELECT created_at INTO v_created FROM offers WHERE id = '30000000-0000-0000-0000-000000000001';
  UPDATE offers SET kind = 'festival', is_active = true, created_at = now() - interval '9 days'
  WHERE id = '30000000-0000-0000-0000-000000000001' RETURNING * INTO r;
  IF r.kind <> 'cart_unlock' OR r.deactivated_at IS NOT NULL OR NOT r.is_active OR r.created_at <> v_created THEN
    RAISE EXCEPTION 'update rules broken: %', row_to_json(r);
  END IF;
  UPDATE offers SET is_active = false WHERE id = r.id RETURNING * INTO r;
  IF r.deactivated_at IS NULL THEN RAISE EXCEPTION 'deactivated_at not set'; END IF;
  RAISE NOTICE 'T5 ok';
END $$;

-- T6: permissions. Super admin can create/edit/delete; admin, member and anon can't read or write.
SET ROLE authenticated;
SELECT set_config('test.uid', '00000000-0000-0000-0000-00000000000a', false);
DO $$ DECLARE v_id uuid; r offers%ROWTYPE; BEGIN
  INSERT INTO offers(kind, name, starts_at, ends_at) VALUES ('festival', 'Diwali', now() + interval '1 day', now() + interval '3 days')
  RETURNING * INTO r;
  IF r.created_by <> '00000000-0000-0000-0000-00000000000a' OR r.updated_by <> r.created_by THEN RAISE EXCEPTION 'created_by not stamped'; END IF;
  INSERT INTO offer_items(offer_id, product_id, offer_price) VALUES (r.id, '10000000-0000-0000-0000-000000000004', 40);
  UPDATE offers SET name = 'Diwali Specials' WHERE id = r.id;
  IF (SELECT count(*) FROM offers) < 2 THEN RAISE EXCEPTION 'super admin cannot read offers'; END IF;
  INSERT INTO offers(id, kind, name, starts_at, ends_at) VALUES ('30000000-0000-0000-0000-000000000009', 'deal_of_day', 'Temp', now(), now() + interval '1 day');
  DELETE FROM offers WHERE id = '30000000-0000-0000-0000-000000000009';
  RAISE NOTICE 'T6a ok (super admin)';
END $$;

SELECT set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM offers) <> 0 OR (SELECT count(*) FROM offer_items) <> 0 THEN RAISE EXCEPTION 'admin can read offers'; END IF;
  PERFORM expect_error($q$INSERT INTO offers(kind, name, starts_at, ends_at) VALUES ('festival', 'x', now(), now() + interval '1 day')$q$, 'row-level security');
  PERFORM expect_error($q$INSERT INTO offer_items(offer_id, product_id, offer_price) VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 1)$q$, 'row-level security');
  UPDATE offers SET is_active = true;   -- silently matches no rows under RLS
  DELETE FROM offer_items;
  RAISE NOTICE 'T6b ok (admin blocked)';
END $$;

SELECT set_config('test.uid', '00000000-0000-0000-0000-00000000000c', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM offers) <> 0 THEN RAISE EXCEPTION 'member can read offers'; END IF;
  PERFORM expect_error($q$INSERT INTO offers(kind, name, starts_at, ends_at) VALUES ('festival', 'x', now(), now() + interval '1 day')$q$, 'row-level security');
  RAISE NOTICE 'T6c ok (member blocked)';
END $$;
RESET ROLE;

SET ROLE anon;
SELECT set_config('test.uid', '', false);
DO $$ BEGIN
  PERFORM expect_error('SELECT count(*) FROM offers', 'permission denied');
  PERFORM expect_error('SELECT count(*) FROM offer_items', 'permission denied');
  PERFORM expect_error($q$INSERT INTO offers(kind, name, starts_at, ends_at) VALUES ('festival', 'x', now(), now() + interval '1 day')$q$, 'permission denied');
  RAISE NOTICE 'T6d ok (anon blocked)';
END $$;
RESET ROLE;

DO $$ BEGIN
  IF (SELECT count(*) FROM offer_items) <> 4 OR NOT EXISTS (SELECT 1 FROM offers WHERE name = 'Diwali Specials') THEN
    RAISE EXCEPTION 'non-super-admin writes changed data';
  END IF;
  IF EXISTS (SELECT 1 FROM offers WHERE is_active) THEN RAISE EXCEPTION 'admin activated an offer'; END IF;
  RAISE NOTICE 'T6e ok (data unchanged by blocked users)';
END $$;

-- T7: get_active_offers is [] while the master switch is off, even with a live, active offer.
UPDATE offers SET is_active = true WHERE id = '30000000-0000-0000-0000-000000000001';
DO $$ BEGIN
  IF public.get_active_offers() <> '[]'::jsonb THEN RAISE EXCEPTION 'offers visible while switched off'; END IF;
  RAISE NOTICE 'T7 ok';
END $$;
SET ROLE anon;
DO $$ BEGIN
  IF public.get_active_offers() <> '[]'::jsonb THEN RAISE EXCEPTION 'anon sees offers while off'; END IF;
  RAISE NOTICE 'T7b ok (anon, off)';
END $$;
RESET ROLE;

-- T8: with the switch on (test only), only live offers with live items appear:
-- scheduled, ended, inactive offers and inactive products/variants are excluded.
UPDATE platform_settings SET value = '{"enabled": true}' WHERE key = 'offers_settings';
INSERT INTO offers(id, kind, name, starts_at, ends_at, is_active) VALUES
  ('30000000-0000-0000-0000-000000000002', 'deal_of_day', 'Ended deal', now() - interval '2 days', now() - interval '1 day', true),
  ('30000000-0000-0000-0000-000000000003', 'deal_of_day', 'Live deal', now() - interval '1 hour', now() + interval '1 hour', true),
  ('30000000-0000-0000-0000-000000000004', 'deal_of_day', 'Off deal', now() - interval '1 hour', now() + interval '1 hour', false),
  ('30000000-0000-0000-0000-000000000005', 'deal_of_day', 'Only inactive product', now() - interval '1 hour', now() + interval '1 hour', true);
INSERT INTO offer_items(offer_id, product_id, offer_price) VALUES
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000004', 20),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004', 35),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 20),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000003', 20);
UPDATE product_variants SET is_active = false WHERE id = '20000000-0000-0000-0000-000000000002';
SET ROLE anon;
DO $$ DECLARE j jsonb; v_names text[]; BEGIN
  j := public.get_active_offers();
  SELECT array_agg(x->>'name' ORDER BY x->>'name') INTO v_names FROM jsonb_array_elements(j) x;
  IF v_names IS DISTINCT FROM ARRAY['Live deal', 'Rs 9 deals'] THEN RAISE EXCEPTION 'wrong live set: %', v_names; END IF;
  -- Rs 9 offer: salt (10) + rice 1 kg (9); the 5 kg variant is inactive.
  IF jsonb_array_length((SELECT x->'items' FROM jsonb_array_elements(j) x WHERE x->>'name' = 'Rs 9 deals')) <> 2 THEN
    RAISE EXCEPTION 'inactive variant listed: %', j;
  END IF;
  IF (SELECT x->'items'->0->>'variant_label' FROM jsonb_array_elements(j) x WHERE x->>'name' = 'Live deal') IS NOT NULL
     OR (SELECT (x->'items'->0->>'price')::numeric FROM jsonb_array_elements(j) x WHERE x->>'name' = 'Live deal') <> 50 THEN
    RAISE EXCEPTION 'item fields wrong: %', j;
  END IF;
  IF j::text ~ '(total_units_cap|max_units_per_customer|created_by)' THEN RAISE EXCEPTION 'admin fields exposed'; END IF;
  RAISE NOTICE 'T8 ok';
END $$;
RESET ROLE;

-- T9: expiry needs no job: a deal whose end has just passed disappears.
UPDATE offers SET ends_at = now() - interval '1 second', starts_at = now() - interval '1 hour'
WHERE id = '30000000-0000-0000-0000-000000000003';
DO $$ BEGIN
  IF public.get_active_offers()::text LIKE '%Live deal%' THEN RAISE EXCEPTION 'expired deal still listed'; END IF;
  RAISE NOTICE 'T9 ok';
END $$;

-- T10: deleting an offer removes its items; deleting a product removes its offer items.
DO $$ BEGIN
  DELETE FROM offers WHERE id = '30000000-0000-0000-0000-000000000002';
  IF EXISTS (SELECT 1 FROM offer_items WHERE offer_id = '30000000-0000-0000-0000-000000000002') THEN RAISE EXCEPTION 'items left behind'; END IF;
  DELETE FROM products WHERE id = '10000000-0000-0000-0000-000000000003';
  IF EXISTS (SELECT 1 FROM offer_items WHERE product_id = '10000000-0000-0000-0000-000000000003') THEN RAISE EXCEPTION 'product delete blocked/left items'; END IF;
  RAISE NOTICE 'T10 ok';
END $$;

-- T11: the master switch row is left alone by a re-run (checked by the runner after re-applying).
UPDATE platform_settings SET value = '{"enabled": false}' WHERE key = 'offers_settings';
DO $$ BEGIN RAISE NOTICE 'T11 setup ok'; END $$;

-- T12: admin_save_offer: create + edit keep item ids, removed items go, all-or-nothing.
SET ROLE authenticated;
SELECT set_config('test.uid', '00000000-0000-0000-0000-00000000000a', false);
DO $$ DECLARE v_id uuid; v_salt uuid; v_count integer; BEGIN
  v_id := public.admin_save_offer(
    jsonb_build_object('kind', 'cart_unlock', 'name', 'Spend 250 get Rs 9', 'starts_at', now(), 'min_cart_value', 250,
                       'max_units_per_customer', 1, 'customer_limit_period', 'day'),
    jsonb_build_array(
      jsonb_build_object('product_id', '10000000-0000-0000-0000-000000000001', 'offer_price', 9),
      jsonb_build_object('product_id', '10000000-0000-0000-0000-000000000004', 'offer_price', 9)));
  SELECT id INTO v_salt FROM offer_items WHERE offer_id = v_id AND product_id = '10000000-0000-0000-0000-000000000001';
  IF (SELECT is_active FROM offers WHERE id = v_id) THEN RAISE EXCEPTION 'new offer is on'; END IF;
  IF (SELECT customer_limit_period FROM offers WHERE id = v_id) <> 'day' THEN RAISE EXCEPTION 'period not saved'; END IF;

  -- edit: change salt price, drop sugar, add rice 1 kg
  PERFORM public.admin_save_offer(
    jsonb_build_object('id', v_id, 'kind', 'festival', 'name', 'Spend 250 get Rs 9 (edited)', 'starts_at', now(), 'min_cart_value', 300, 'is_active', true),
    jsonb_build_array(
      jsonb_build_object('product_id', '10000000-0000-0000-0000-000000000001', 'offer_price', 7),
      jsonb_build_object('product_id', '10000000-0000-0000-0000-000000000002', 'variant_id', '20000000-0000-0000-0000-000000000001', 'offer_price', 9)));
  IF (SELECT id FROM offer_items WHERE offer_id = v_id AND product_id = '10000000-0000-0000-0000-000000000001') <> v_salt THEN RAISE EXCEPTION 'item id not kept'; END IF;
  IF (SELECT offer_price FROM offer_items WHERE id = v_salt) <> 7 THEN RAISE EXCEPTION 'price not updated'; END IF;
  SELECT count(*) INTO v_count FROM offer_items WHERE offer_id = v_id;
  IF v_count <> 2 OR EXISTS (SELECT 1 FROM offer_items WHERE offer_id = v_id AND product_id = '10000000-0000-0000-0000-000000000004') THEN RAISE EXCEPTION 'item sync wrong'; END IF;
  IF (SELECT kind FROM offers WHERE id = v_id) <> 'cart_unlock' OR (SELECT min_cart_value FROM offers WHERE id = v_id) <> 300 THEN RAISE EXCEPTION 'edit wrong'; END IF;

  -- a bad item rolls back the whole save (name unchanged, items unchanged)
  PERFORM expect_error(format($q$SELECT public.admin_save_offer('{"id":"%s","name":"BROKEN","starts_at":"2026-11-03T10:00:00Z","min_cart_value":300}'::jsonb,
     '[{"product_id":"10000000-0000-0000-0000-000000000001","offer_price":0}]'::jsonb)$q$, v_id), 'offer_price_check');
  IF (SELECT name FROM offers WHERE id = v_id) = 'BROKEN' OR (SELECT count(*) FROM offer_items WHERE offer_id = v_id) <> 2 THEN RAISE EXCEPTION 'partial save'; END IF;

  PERFORM expect_error($q$SELECT public.admin_save_offer('{"kind":"cart_unlock","name":"x","starts_at":"2026-11-03T10:00:00Z","min_cart_value":250}'::jsonb,
     '[{"product_id":"10000000-0000-0000-0000-000000000001","offer_price":9},{"product_id":"10000000-0000-0000-0000-000000000001","offer_price":8}]'::jsonb)$q$, 'listed twice');
  PERFORM expect_error($q$SELECT public.admin_save_offer('{"kind":"cart_unlock","name":"x","starts_at":"2026-11-03T10:00:00Z","min_cart_value":250,"is_active":true}'::jsonb, '[]'::jsonb)$q$, 'at least one product');
  PERFORM expect_error($q$SELECT public.admin_save_offer('{"id":"30000000-0000-0000-0000-0000000000ff","name":"x","starts_at":"2026-11-03T10:00:00Z"}'::jsonb, '[]'::jsonb)$q$, 'not found');

  -- list switch
  PERFORM public.admin_set_offer_active(v_id, false);
  IF (SELECT is_active FROM offers WHERE id = v_id) THEN RAISE EXCEPTION 'switch off failed'; END IF;
  INSERT INTO offers(id, kind, name, starts_at, ends_at) VALUES ('30000000-0000-0000-0000-000000000010', 'festival', 'Empty', now(), now() + interval '1 day');
  PERFORM expect_error($q$SELECT public.admin_set_offer_active('30000000-0000-0000-0000-000000000010', true)$q$, 'at least one product');
  RAISE NOTICE 'T12 ok';
END $$;

-- T13: admin (not super admin) and anon can't use the save/switch functions.
SELECT set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
DO $$ BEGIN
  PERFORM expect_error($q$SELECT public.admin_save_offer('{"kind":"festival","name":"x","starts_at":"2026-11-03T10:00:00Z","ends_at":"2026-11-04T10:00:00Z"}'::jsonb, '[]'::jsonb)$q$, 'only a super admin');
  PERFORM expect_error($q$SELECT public.admin_set_offer_active('30000000-0000-0000-0000-000000000001', true)$q$, 'only a super admin');
  RAISE NOTICE 'T13a ok';
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
  PERFORM expect_error($q$SELECT public.admin_save_offer('{}'::jsonb, '[]'::jsonb)$q$, 'permission denied');
  PERFORM expect_error($q$SELECT public.admin_set_offer_active('30000000-0000-0000-0000-000000000001', true)$q$, 'permission denied');
  RAISE NOTICE 'T13b ok';
END $$;
RESET ROLE;
