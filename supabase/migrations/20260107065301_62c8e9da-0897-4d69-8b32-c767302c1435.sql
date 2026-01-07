-- Drop existing policies and recreate with proper INSERT support
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Anyone can view active categories" ON public.categories;

-- Create policy for admins to manage all categories (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Admins can manage categories" ON public.categories
FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Create policy for anyone to view active categories
CREATE POLICY "Anyone can view active categories" ON public.categories
FOR SELECT
USING (is_active = true);