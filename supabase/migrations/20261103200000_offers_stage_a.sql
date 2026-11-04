-- Offers & Promotions, Stage A: data model + admin management. OFF BY DEFAULT.
--
-- Design: PHASE2_OFFERS_PROMOTIONS_PLAN.md §2.1. One model for the three kinds:
--   cart_unlock  "₹9 offers": fixed price once the cart reaches min_cart_value
--   festival     occasion campaign with discounted prices and a date window
--   deal_of_day  short-lived deals shown on the homepage
--
-- Stage A only stores campaigns. NOTHING here prices an order: checkout,
-- place_order_atomic, quote_checkout, place_paid_order, Razorpay, coupons,
-- wallets, referrals, Express Delivery and order notifications are untouched.
-- Customers can't read the tables; get_active_offers() returns [] until the
-- master switch platform_settings.offers_settings.enabled is true (it is
-- created false here, and a missing row also means off).
--
-- Times are timestamptz; the admin enters IST and expiry needs no cron job
-- (every reader compares with now()).

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.products') IS NULL OR to_regclass('public.product_variants') IS NULL
     OR to_regclass('public.platform_settings') IS NULL THEN
    RAISE EXCEPTION 'products / product_variants / platform_settings missing; not installing offers';
  END IF;
  IF to_regprocedure('public.has_role(uuid, app_role)') IS NULL THEN
    RAISE EXCEPTION 'has_role(uuid, app_role) missing; not installing offers';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('cart_unlock', 'festival', 'deal_of_day')),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  description text CHECK (description IS NULL OR length(description) <= 300),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT false,
  deactivated_at timestamptz,
  min_cart_value numeric(10, 2),
  max_units_per_order integer NOT NULL DEFAULT 1 CHECK (max_units_per_order BETWEEN 1 AND 100),
  max_units_per_customer integer CHECK (max_units_per_customer IS NULL OR max_units_per_customer BETWEEN 1 AND 1000),
  customer_limit_period text NOT NULL DEFAULT 'offer' CHECK (customer_limit_period IN ('offer', 'day')),
  total_units_cap integer CHECK (total_units_cap IS NULL OR total_units_cap BETWEEN 1 AND 1000000),
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'members', 'non_members')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offers_window_valid CHECK (ends_at IS NULL OR ends_at > starts_at),
  -- Festival offers and deals always end; a ₹9 offer may run until switched off.
  CONSTRAINT offers_end_required CHECK (kind = 'cart_unlock' OR ends_at IS NOT NULL),
  -- Minimum cart value: required for ₹9 offers, not used by the other kinds.
  CONSTRAINT offers_min_cart_value CHECK (
    (kind = 'cart_unlock' AND min_cart_value IS NOT NULL AND min_cart_value > 0 AND min_cart_value <= 1000000)
    OR (kind <> 'cart_unlock' AND min_cart_value IS NULL))
);
CREATE INDEX IF NOT EXISTS offers_live_idx ON public.offers (kind, starts_at, ends_at) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.offer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  offer_price numeric(10, 2) NOT NULL CHECK (offer_price > 0 AND offer_price <= 1000000),
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One price per product/variant per offer (NULL variant = the product itself).
CREATE UNIQUE INDEX IF NOT EXISTS offer_items_once
  ON public.offer_items (offer_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS offer_items_product_idx ON public.offer_items (product_id);

-- ---------------------------------------------------------------------------
-- Write rules
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.offers_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.description := nullif(btrim(coalesce(NEW.description, '')), '');
  NEW.updated_at := now();
  NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.created_by := coalesce(auth.uid(), NEW.created_by);
    NEW.deactivated_at := CASE WHEN NEW.is_active THEN NULL ELSE NEW.deactivated_at END;
  ELSE
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
    NEW.kind := OLD.kind;  -- a campaign keeps its kind; create a new one instead
    IF NEW.is_active AND NOT OLD.is_active THEN
      NEW.deactivated_at := NULL;
    ELSIF OLD.is_active AND NOT NEW.is_active THEN
      NEW.deactivated_at := now();
    ELSE
      NEW.deactivated_at := OLD.deactivated_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS offers_before_write_trg ON public.offers;
CREATE TRIGGER offers_before_write_trg
BEFORE INSERT OR UPDATE ON public.offers
FOR EACH ROW EXECUTE FUNCTION public.offers_before_write();

-- The variant must belong to the product, and a product sold in options
-- needs an option chosen (its price lives on the variant).
CREATE OR REPLACE FUNCTION public.offer_items_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.variant_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM product_variants WHERE id = NEW.variant_id AND product_id = NEW.product_id) THEN
      RAISE EXCEPTION 'The selected option does not belong to this product';
    END IF;
  ELSIF (TG_OP = 'INSERT' OR NEW.product_id IS DISTINCT FROM OLD.product_id OR OLD.variant_id IS NOT NULL)
        AND EXISTS (SELECT 1 FROM product_variants WHERE product_id = NEW.product_id AND is_active) THEN
    RAISE EXCEPTION 'This product is sold in options; choose the option (for example the pack size)';
  END IF;
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN NEW.created_at := now(); ELSE NEW.created_at := OLD.created_at; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.offer_items_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS offer_items_before_write_trg ON public.offer_items;
CREATE TRIGGER offer_items_before_write_trg
BEFORE INSERT OR UPDATE ON public.offer_items
FOR EACH ROW EXECUTE FUNCTION public.offer_items_before_write();

-- ---------------------------------------------------------------------------
-- Access: super admins only. Customers never read these tables directly.
-- ---------------------------------------------------------------------------
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins manage offers" ON public.offers;
CREATE POLICY "Super admins manage offers" ON public.offers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Super admins manage offer items" ON public.offer_items;
CREATE POLICY "Super admins manage offer items" ON public.offer_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

REVOKE ALL ON public.offers FROM anon;
REVOKE ALL ON public.offer_items FROM anon;
REVOKE TRUNCATE ON public.offers FROM authenticated;
REVOKE TRUNCATE ON public.offer_items FROM authenticated;

-- ---------------------------------------------------------------------------
-- Admin save: the offer and its product list in one transaction.
-- SECURITY INVOKER: the RLS policies above still decide who may write.
--   p_offer: {id?, kind, name, description, starts_at, ends_at, is_active,
--             min_cart_value, max_units_per_order, max_units_per_customer,
--             customer_limit_period, total_units_cap, audience}
--   p_items: [{product_id, variant_id?, offer_price, is_active?}]  (the full list;
--             rows not listed are removed, matching rows keep their id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_save_offer(p_offer jsonb, p_items jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid := nullif(p_offer ->> 'id', '')::uuid;
  v_item jsonb;
  v_pos integer := 0;
  v_keep uuid[] := ARRAY[]::uuid[];
  v_item_id uuid;
  v_product uuid;
  v_variant uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only a super admin can manage offers';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Product list is missing';
  END IF;
  IF jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'An offer can have at most 200 products';
  END IF;
  IF coalesce((p_offer ->> 'is_active')::boolean, false) AND jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Add at least one product before switching the offer on';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO offers (kind, name, description, starts_at, ends_at, is_active, min_cart_value,
                        max_units_per_order, max_units_per_customer, customer_limit_period, total_units_cap, audience)
    VALUES (p_offer ->> 'kind', p_offer ->> 'name', p_offer ->> 'description',
            (p_offer ->> 'starts_at')::timestamptz, nullif(p_offer ->> 'ends_at', '')::timestamptz,
            coalesce((p_offer ->> 'is_active')::boolean, false),
            nullif(p_offer ->> 'min_cart_value', '')::numeric,
            coalesce(nullif(p_offer ->> 'max_units_per_order', '')::integer, 1),
            nullif(p_offer ->> 'max_units_per_customer', '')::integer,
            coalesce(nullif(p_offer ->> 'customer_limit_period', ''), 'offer'),
            nullif(p_offer ->> 'total_units_cap', '')::integer,
            coalesce(nullif(p_offer ->> 'audience', ''), 'all'))
    RETURNING id INTO v_id;
  ELSE
    UPDATE offers SET
      name = p_offer ->> 'name',
      description = p_offer ->> 'description',
      starts_at = (p_offer ->> 'starts_at')::timestamptz,
      ends_at = nullif(p_offer ->> 'ends_at', '')::timestamptz,
      is_active = coalesce((p_offer ->> 'is_active')::boolean, false),
      min_cart_value = nullif(p_offer ->> 'min_cart_value', '')::numeric,
      max_units_per_order = coalesce(nullif(p_offer ->> 'max_units_per_order', '')::integer, 1),
      max_units_per_customer = nullif(p_offer ->> 'max_units_per_customer', '')::integer,
      customer_limit_period = coalesce(nullif(p_offer ->> 'customer_limit_period', ''), 'offer'),
      total_units_cap = nullif(p_offer ->> 'total_units_cap', '')::integer,
      audience = coalesce(nullif(p_offer ->> 'audience', ''), 'all')
    WHERE id = v_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Offer not found';
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_pos := v_pos + 1;
    v_product := (v_item ->> 'product_id')::uuid;
    v_variant := nullif(v_item ->> 'variant_id', '')::uuid;
    SELECT id INTO v_item_id FROM offer_items
    WHERE offer_id = v_id AND product_id = v_product AND variant_id IS NOT DISTINCT FROM v_variant;
    IF v_item_id = ANY (v_keep) THEN
      RAISE EXCEPTION 'The same product option is listed twice';
    END IF;
    IF v_item_id IS NULL THEN
      INSERT INTO offer_items (offer_id, product_id, variant_id, offer_price, is_active, display_order)
      VALUES (v_id, v_product, v_variant, (v_item ->> 'offer_price')::numeric,
              coalesce((v_item ->> 'is_active')::boolean, true), v_pos)
      RETURNING id INTO v_item_id;
    ELSE
      UPDATE offer_items
      SET offer_price = (v_item ->> 'offer_price')::numeric,
          is_active = coalesce((v_item ->> 'is_active')::boolean, true),
          display_order = v_pos
      WHERE id = v_item_id;
    END IF;
    v_keep := v_keep || v_item_id;
  END LOOP;

  DELETE FROM offer_items WHERE offer_id = v_id AND NOT (id = ANY (v_keep));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_save_offer(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_offer(jsonb, jsonb) TO authenticated;

-- Admin on/off switch from the list; an offer with no products can't go on.
CREATE OR REPLACE FUNCTION public.admin_set_offer_active(p_offer_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only a super admin can manage offers';
  END IF;
  IF p_active AND NOT EXISTS (SELECT 1 FROM offer_items WHERE offer_id = p_offer_id) THEN
    RAISE EXCEPTION 'Add at least one product before switching the offer on';
  END IF;
  UPDATE offers SET is_active = coalesce(p_active, false) WHERE id = p_offer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_offer_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_offer_active(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Master switch (off). Stage B/C read it; nothing reads it for pricing yet.
-- ---------------------------------------------------------------------------
INSERT INTO public.platform_settings (key, value, description)
VALUES ('offers_settings', '{"enabled": false}'::jsonb,
        'Offers & Promotions master switch (off until checkout support is released)')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Customer read API (inert until the master switch is on).
-- Live = active, inside its window, with active items on active products.
-- Limits, caps and admin fields are not exposed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_offers()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN coalesce((SELECT (value ->> 'enabled') = 'true' FROM platform_settings WHERE key = 'offers_settings'), false)
    THEN coalesce((
      SELECT jsonb_agg(o.j ORDER BY o.sort_end NULLS LAST, o.name)
      FROM (
        SELECT f.name, f.ends_at AS sort_end,
               jsonb_build_object(
                 'id', f.id, 'kind', f.kind, 'name', f.name, 'description', f.description,
                 'starts_at', f.starts_at, 'ends_at', f.ends_at,
                 'min_cart_value', f.min_cart_value, 'max_units_per_order', f.max_units_per_order,
                 'audience', f.audience,
                 'items', items.list) AS j
        FROM offers f
        CROSS JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object(
                   'offer_item_id', i.id, 'product_id', p.id, 'variant_id', v.id,
                   'offer_price', i.offer_price,
                   'product_name', p.name, 'slug', p.slug, 'image', p.images[1],
                   'variant_label', v.label,
                   'price', coalesce(v.price, p.price),
                   'member_price', CASE WHEN v.id IS NOT NULL THEN v.member_price ELSE p.member_price END)
                 ORDER BY i.display_order, p.name) AS list
          FROM offer_items i
          JOIN products p ON p.id = i.product_id AND p.is_active
          LEFT JOIN product_variants v ON v.id = i.variant_id
          WHERE i.offer_id = f.id AND i.is_active
            AND (i.variant_id IS NULL OR v.is_active)
        ) items
        WHERE f.is_active AND f.starts_at <= now() AND (f.ends_at IS NULL OR f.ends_at > now())
          AND items.list IS NOT NULL
      ) o), '[]'::jsonb)
    ELSE '[]'::jsonb
  END;
$$;
REVOKE ALL ON FUNCTION public.get_active_offers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_offers() TO anon, authenticated, service_role;

COMMIT;
