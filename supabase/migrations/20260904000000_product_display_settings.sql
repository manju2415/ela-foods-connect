-- Admin-configurable homepage product sections and idempotent sales totals.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sales_count integer NOT NULL DEFAULT 0
  CHECK (sales_count >= 0);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS sales_counted_at timestamptz;

CREATE TABLE IF NOT EXISTS public.product_display_settings (
  section_key text PRIMARY KEY
    CHECK (section_key IN ('featured', 'bestSellers', 'newArrivals')),
  is_enabled boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  product_limit integer NOT NULL DEFAULT 8 CHECK (product_limit BETWEEN 1 AND 24),
  new_arrival_days integer CHECK (new_arrival_days BETWEEN 1 AND 365),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (section_key = 'newArrivals' AND new_arrival_days IS NOT NULL)
    OR (section_key <> 'newArrivals' AND new_arrival_days IS NULL)
  )
);

INSERT INTO public.product_display_settings
  (section_key, is_enabled, display_order, product_limit, new_arrival_days)
VALUES
  ('featured', true, 0, 8, NULL),
  ('bestSellers', true, 1, 8, NULL),
  ('newArrivals', true, 2, 8, 30)
ON CONFLICT (section_key) DO NOTHING;

ALTER TABLE public.product_display_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view product display settings"
  ON public.product_display_settings;
CREATE POLICY "Anyone can view product display settings"
  ON public.product_display_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Super admins can manage product display settings"
  ON public.product_display_settings;
CREATE POLICY "Super admins can manage product display settings"
  ON public.product_display_settings FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP TRIGGER IF EXISTS update_product_display_settings_updated_at
  ON public.product_display_settings;
CREATE TRIGGER update_product_display_settings_updated_at
BEFORE UPDATE ON public.product_display_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Count each paid order exactly once, including paid orders whose items are
-- inserted after the order (the guest checkout flow).
CREATE OR REPLACE FUNCTION public.count_paid_order_sales(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL
     OR v_order.payment_status <> 'completed'
     OR v_order.status = 'cancelled'
     OR v_order.sales_counted_at IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = p_order_id) THEN
    RETURN false;
  END IF;

  UPDATE products p
  SET sales_count = p.sales_count + sold.quantity
  FROM (
    SELECT product_id, SUM(quantity)::integer AS quantity
    FROM order_items
    WHERE order_id = p_order_id AND product_id IS NOT NULL
    GROUP BY product_id
  ) sold
  WHERE p.id = sold.product_id;

  UPDATE orders SET sales_counted_at = now() WHERE id = p_order_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.count_paid_order_sales(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_paid_order_sales(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_count_paid_order_sales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status = 'completed' AND NEW.status <> 'cancelled' THEN
    PERFORM public.count_paid_order_sales(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS count_paid_order_sales_trg ON public.orders;
CREATE TRIGGER count_paid_order_sales_trg
AFTER INSERT OR UPDATE OF payment_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_count_paid_order_sales();

CREATE OR REPLACE FUNCTION public.trg_count_paid_order_sales_after_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.count_paid_order_sales(NEW.order_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS count_paid_order_sales_after_item_trg ON public.order_items;
CREATE TRIGGER count_paid_order_sales_after_item_trg
AFTER INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.trg_count_paid_order_sales_after_item();

-- Initialise totals from existing successful orders and mark those orders so
-- later payment edits cannot count them a second time.
UPDATE public.products p
SET sales_count = totals.quantity
FROM (
  SELECT oi.product_id, SUM(oi.quantity)::integer AS quantity
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.payment_status = 'completed'
    AND o.status <> 'cancelled'
    AND oi.product_id IS NOT NULL
  GROUP BY oi.product_id
) totals
WHERE p.id = totals.product_id;

UPDATE public.orders
SET sales_counted_at = COALESCE(updated_at, created_at, now())
WHERE payment_status = 'completed'
  AND status <> 'cancelled'
  AND sales_counted_at IS NULL
  AND EXISTS (SELECT 1 FROM order_items WHERE order_id = orders.id);

-- Public API equivalent for GET /api/products/homepage-sections.
CREATE OR REPLACE FUNCTION public.get_homepage_product_sections()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(section_payload ORDER BY display_order), '[]'::jsonb)
  FROM (
    SELECT
      s.display_order,
      jsonb_build_object(
        'sectionKey', s.section_key,
        'title', CASE s.section_key
          WHEN 'featured' THEN 'Featured Products'
          WHEN 'bestSellers' THEN 'Best Sellers'
          ELSE 'New Arrivals'
        END,
        'products', COALESCE((
          SELECT jsonb_agg(to_jsonb(product_row) - 'sort_value' ORDER BY product_row.sort_value DESC)
          FROM (
            SELECT
              p.id, p.name, p.slug, p.price, p.compare_at_price,
              p.member_price, p.images, p.is_featured, p.is_fast_selling,
              p.sales_count, p.stock_quantity, p.unit_type, p.unit_value,
              p.created_at, c.name AS category_name,
              CASE s.section_key
                WHEN 'bestSellers' THEN p.sales_count::numeric
                ELSE EXTRACT(EPOCH FROM p.created_at)
              END AS sort_value
            FROM products p
            LEFT JOIN categories c ON c.id = p.category_id
            WHERE p.is_active = true
              AND (
                (s.section_key = 'featured' AND p.is_featured = true)
                OR (s.section_key = 'bestSellers' AND p.sales_count > 0)
                OR (s.section_key = 'newArrivals'
                    AND p.created_at >= now() - make_interval(days => s.new_arrival_days))
              )
            ORDER BY sort_value DESC
            LIMIT s.product_limit
          ) product_row
        ), '[]'::jsonb)
      ) AS section_payload
    FROM product_display_settings s
    WHERE s.is_enabled = true
  ) enabled_sections;
$$;

GRANT EXECUTE ON FUNCTION public.get_homepage_product_sections() TO anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_products_home_featured
  ON public.products (created_at DESC) WHERE is_active = true AND is_featured = true;
CREATE INDEX IF NOT EXISTS idx_products_home_sales
  ON public.products (sales_count DESC) WHERE is_active = true AND sales_count > 0;
