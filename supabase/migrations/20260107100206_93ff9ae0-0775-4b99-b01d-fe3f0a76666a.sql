-- Add unit fields to products table
ALTER TABLE public.products 
ADD COLUMN unit_type TEXT DEFAULT 'g',
ADD COLUMN unit_value DECIMAL(10,2) DEFAULT NULL;

-- Create banners table for hero/promotional banners
CREATE TABLE public.banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  cta_text TEXT DEFAULT 'Shop Now',
  cta_link TEXT DEFAULT '/products',
  image_url TEXT,
  badge_text TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  starts_at TIMESTAMP WITH TIME ZONE,
  ends_at TIMESTAMP WITH TIME ZONE,
  location TEXT DEFAULT 'home_hero',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create advertisements table
CREATE TABLE public.advertisements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  link_url TEXT,
  link_text TEXT DEFAULT 'Learn More',
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  placement TEXT NOT NULL DEFAULT 'home_sidebar',
  starts_at TIMESTAMP WITH TIME ZONE,
  ends_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on banners
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

-- Public can view active banners
CREATE POLICY "Anyone can view active banners" 
ON public.banners 
FOR SELECT 
USING (is_active = true AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now()));

-- Admins can manage banners
CREATE POLICY "Admins can manage banners" 
ON public.banners 
FOR ALL 
USING (public.is_admin(auth.uid()));

-- Enable RLS on advertisements
ALTER TABLE public.advertisements ENABLE ROW LEVEL SECURITY;

-- Public can view active ads
CREATE POLICY "Anyone can view active advertisements" 
ON public.advertisements 
FOR SELECT 
USING (is_active = true AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now()));

-- Admins can manage advertisements
CREATE POLICY "Admins can manage advertisements" 
ON public.advertisements 
FOR ALL 
USING (public.is_admin(auth.uid()));

-- Add trigger for updated_at on banners
CREATE TRIGGER update_banners_updated_at
BEFORE UPDATE ON public.banners
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add trigger for updated_at on advertisements
CREATE TRIGGER update_advertisements_updated_at
BEFORE UPDATE ON public.advertisements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment for unit_type values
COMMENT ON COLUMN public.products.unit_type IS 'Unit type: g, kg, ml, litre, packet, piece, box, dozen';