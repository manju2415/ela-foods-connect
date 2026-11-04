-- Minimal stand-in for the production objects the offers migration depends on.
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'founding_member', 'member', 'delivery_partner', 'mlm_admin');
CREATE TABLE public.user_roles (user_id uuid, role app_role);
CREATE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE TABLE public.platform_settings (id uuid DEFAULT gen_random_uuid(), key text UNIQUE NOT NULL, value jsonb NOT NULL,
  description text, updated_by uuid, updated_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now());
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view settings" ON public.platform_settings FOR SELECT USING (true);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL,
  price numeric NOT NULL, member_price numeric, images text[], is_active boolean DEFAULT true, stock_quantity integer DEFAULT 10);
CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  label text NOT NULL, price numeric NOT NULL, member_price numeric, is_active boolean NOT NULL DEFAULT true);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read products" ON public.products FOR SELECT USING (true);
CREATE POLICY "read variants" ON public.product_variants FOR SELECT USING (true);

-- Supabase defaults: new tables/functions are granted to the API roles.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER ROLE service_role BYPASSRLS;

-- Fixtures
INSERT INTO user_roles VALUES ('00000000-0000-0000-0000-00000000000a', 'super_admin'),
                              ('00000000-0000-0000-0000-00000000000b', 'admin'),
                              ('00000000-0000-0000-0000-00000000000c', 'member');
INSERT INTO products (id, name, slug, price, member_price, images) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Salt 1kg', 'salt', 30, 28, ARRAY['salt.jpg']),
  ('10000000-0000-0000-0000-000000000002', 'Rice', 'rice', 0, NULL, NULL),
  ('10000000-0000-0000-0000-000000000003', 'Old Item', 'old', 50, NULL, NULL),
  ('10000000-0000-0000-0000-000000000004', 'Sugar 1kg', 'sugar', 50, NULL, NULL);
UPDATE products SET is_active = false WHERE id = '10000000-0000-0000-0000-000000000003';
INSERT INTO product_variants (id, product_id, label, price, member_price) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '1 kg', 70, 65),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '5 kg', 320, 300);
