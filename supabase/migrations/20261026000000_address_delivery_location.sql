-- Optional customer-confirmed delivery pin on saved addresses.
--
-- Additive only: three nullable columns. Every existing address keeps NULL
-- ("no pin") — nothing is backfilled, so no existing address or order changes.
-- Checkout already sends the whole address row as the order's
-- shipping_address (jsonb), so a pin reaches the order without any change to
-- quote_checkout / place_paid_order / place_order_atomic or the orders table.
-- RLS is unchanged: the existing "Users can manage their own addresses" and
-- "Admins can view all addresses" policies cover the new columns.

ALTER TABLE public.addresses
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS location_confirmed_at timestamptz;

-- Both or neither, and within range. All existing rows are NULL/NULL, so this
-- validates instantly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'addresses_location_valid' AND conrelid = 'public.addresses'::regclass
  ) THEN
    ALTER TABLE public.addresses ADD CONSTRAINT addresses_location_valid CHECK (
      (latitude IS NULL AND longitude IS NULL)
      OR (latitude IS NOT NULL AND longitude IS NOT NULL
          AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
    );
  END IF;
END $$;

-- A pin belongs to the address text it was confirmed for. If the customer
-- later edits the street / city / state / pincode (Address Manager, profile
-- completion) without re-pinning, drop the old pin so a wrong location is
-- never shared with a delivery partner. Updates that set the pin themselves,
-- and edits to name / phone / label / default flag, keep it.
CREATE OR REPLACE FUNCTION public.addresses_clear_stale_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.latitude IS NOT NULL
     AND NEW.latitude IS NOT DISTINCT FROM OLD.latitude
     AND NEW.longitude IS NOT DISTINCT FROM OLD.longitude
     AND (NEW.address_line1 IS DISTINCT FROM OLD.address_line1
          OR NEW.address_line2 IS DISTINCT FROM OLD.address_line2
          OR NEW.city IS DISTINCT FROM OLD.city
          OR NEW.state IS DISTINCT FROM OLD.state
          OR NEW.postal_code IS DISTINCT FROM OLD.postal_code) THEN
    NEW.latitude := NULL;
    NEW.longitude := NULL;
    NEW.location_confirmed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS addresses_clear_stale_location ON public.addresses;
CREATE TRIGGER addresses_clear_stale_location
  BEFORE UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.addresses_clear_stale_location();
