-- The is_mlm_admin() function was narrowed in 20260423070321 to only match
-- role = 'mlm_admin' (it used to also match 'super_admin'). The write policy
-- on mlm_settings still only checks is_mlm_admin(), so super admins can no
-- longer write to mlm_settings even though they can reach the admin UI via
-- SuperAdminGuard. Restore the original intent (stated in 20260408112047's
-- own policy name/comment) by explicitly OR-ing is_super_admin(), matching
-- the pattern already used for mlm_settings_versions and founder_payment_logs.

DROP POLICY IF EXISTS "Super admins and MLM admins can manage MLM settings" ON public.mlm_settings;

CREATE POLICY "Super admins and MLM admins can manage MLM settings"
ON public.mlm_settings
FOR ALL
USING (is_mlm_admin(auth.uid()) OR is_super_admin(auth.uid()))
WITH CHECK (is_mlm_admin(auth.uid()) OR is_super_admin(auth.uid()));
