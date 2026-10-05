-- Member views always use the authenticated identity, including for admin accounts.
CREATE OR REPLACE FUNCTION public.get_my_member_network()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE network AS (
    SELECT p.id AS user_id, p.email, p.full_name, p.user_level,
           1 AS level_depth, p.referred_by, ARRAY[auth.uid(), p.id] AS path
    FROM public.profiles p
    WHERE p.referred_by = auth.uid()
      AND coalesce(p.registration_fee_paid, 0) > 0
    UNION ALL
    SELECT p.id, p.email, p.full_name, p.user_level,
           n.level_depth + 1, p.referred_by, n.path || p.id
    FROM public.profiles p
    JOIN network n ON p.referred_by = n.user_id
    WHERE coalesce(p.registration_fee_paid, 0) > 0
      AND NOT p.id = ANY(n.path)
  )
  SELECT jsonb_build_object(
    'members', coalesce((SELECT jsonb_agg(to_jsonb(n) - 'path' ORDER BY n.level_depth, n.full_name, n.user_id) FROM network n), '[]'::jsonb),
    'invitations', coalesce((
      SELECT jsonb_agg(jsonb_build_object('user_id', p.id, 'email', p.email, 'full_name', p.full_name) ORDER BY p.created_at DESC, p.id)
      FROM public.profiles p
      WHERE p.referred_by = auth.uid() AND p.id <> auth.uid()
        AND coalesce(p.registration_fee_paid, 0) <= 0
    ), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.get_my_member_network() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_member_network() TO authenticated;
