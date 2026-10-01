  -- Delivery-day rules for checkout.
  --
  -- categories.delivery_weekdays: the weekdays a category can be delivered on
  -- (0 = Sunday ... 6 = Saturday). NULL means every day, which keeps every
  -- existing category behaving exactly as before.
  --
  -- delivery_date_overrides: one-off exceptions managed by admins.
  --   category_id NULL      -> applies to the whole store (e.g. a holiday)
  --   is_available = false  -> no delivery on that date
  --   is_available = true   -> extra delivery date (e.g. fish on Monday when
  --                            Sunday is a holiday)
  -- A category-specific override wins over a store-wide one.
  --
  -- Additive only: no existing table, trigger or function is changed.

  ALTER TABLE public.categories
    ADD COLUMN IF NOT EXISTS delivery_weekdays smallint[];

  ALTER TABLE public.categories
    DROP CONSTRAINT IF EXISTS categories_delivery_weekdays_valid;
  ALTER TABLE public.categories
    ADD CONSTRAINT categories_delivery_weekdays_valid
    CHECK (delivery_weekdays IS NULL OR delivery_weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[]);

  CREATE TABLE IF NOT EXISTS public.delivery_date_overrides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    override_date date NOT NULL,
    category_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
    is_available boolean NOT NULL DEFAULT false,
    reason text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamptz NOT NULL DEFAULT now()
  );

  -- One override per date per scope (store-wide counts as its own scope).
  CREATE UNIQUE INDEX IF NOT EXISTS delivery_date_overrides_date_scope_key
    ON public.delivery_date_overrides (
      override_date,
      coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

  ALTER TABLE public.delivery_date_overrides ENABLE ROW LEVEL SECURITY;

  -- Checkout (including guests) needs to read the calendar.
  DROP POLICY IF EXISTS "Anyone can view delivery date overrides" ON public.delivery_date_overrides;
  CREATE POLICY "Anyone can view delivery date overrides"
  ON public.delivery_date_overrides
  FOR SELECT
  USING (true);

  -- Admin and super admin only (is_admin covers both roles).
  DROP POLICY IF EXISTS "Admins can manage delivery date overrides" ON public.delivery_date_overrides;
  CREATE POLICY "Admins can manage delivery date overrides"
  ON public.delivery_date_overrides
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
