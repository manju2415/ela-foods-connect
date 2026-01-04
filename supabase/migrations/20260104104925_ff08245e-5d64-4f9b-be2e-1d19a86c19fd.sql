-- Create is_super_admin helper function
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'super_admin'
  )
$$;

-- Add policy to allow super admins to update referral codes
CREATE POLICY "Super admins can update referral codes" 
ON public.referral_codes 
FOR UPDATE 
USING (is_super_admin(auth.uid()));

-- Add policy to allow super admins to delete referral codes
CREATE POLICY "Super admins can delete referral codes" 
ON public.referral_codes 
FOR DELETE 
USING (is_super_admin(auth.uid()));