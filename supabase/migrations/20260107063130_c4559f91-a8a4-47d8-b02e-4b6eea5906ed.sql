-- Fix the restrictive RLS policy for categories (change to PERMISSIVE for admin management)
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
CREATE POLICY "Admins can manage categories" 
ON public.categories 
FOR ALL 
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Add member_price column to products for member-exclusive pricing
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS member_price numeric;