
-- 1. Create stores table
CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  phone text,
  email text,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  state text NOT NULL,
  postal_code text NOT NULL,
  latitude numeric,
  longitude numeric,
  is_active boolean DEFAULT true,
  opening_time time,
  closing_time time,
  manager_name text,
  manager_phone text,
  display_order integer DEFAULT 0,
  image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Create store_inventory table
CREATE TABLE public.store_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  stock_quantity integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(store_id, product_id)
);

-- 3. Create store_staff table
CREATE TABLE public.store_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text DEFAULT 'staff',
  created_at timestamptz DEFAULT now(),
  UNIQUE(store_id, user_id)
);

-- 4. Add fulfillment columns to orders
ALTER TABLE public.orders
  ADD COLUMN fulfillment_type text NOT NULL DEFAULT 'delivery',
  ADD COLUMN pickup_store_id uuid REFERENCES public.stores(id);

-- 5. Enable RLS
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_staff ENABLE ROW LEVEL SECURITY;

-- 6. RLS for stores
CREATE POLICY "Anyone can view active stores" ON public.stores
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage stores" ON public.stores
  FOR ALL USING (is_admin(auth.uid()));

-- 7. RLS for store_inventory
CREATE POLICY "Anyone can view store inventory" ON public.store_inventory
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage store inventory" ON public.store_inventory
  FOR ALL USING (is_admin(auth.uid()));

-- 8. RLS for store_staff
CREATE POLICY "Admins can manage store staff" ON public.store_staff
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Staff can view own record" ON public.store_staff
  FOR SELECT USING (auth.uid() = user_id);

-- 9. Updated_at triggers
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_store_inventory_updated_at BEFORE UPDATE ON public.store_inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
