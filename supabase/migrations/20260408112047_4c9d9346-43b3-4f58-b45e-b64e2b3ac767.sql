
-- Drop the existing super-admin-only write policy
DROP POLICY IF EXISTS "Super admins can manage MLM settings" ON public.mlm_settings;

-- Create a new policy that allows both super_admin and mlm_admin to manage MLM settings
CREATE POLICY "Super admins and MLM admins can manage MLM settings"
ON public.mlm_settings
FOR ALL
USING (is_mlm_admin(auth.uid()))
WITH CHECK (is_mlm_admin(auth.uid()));
