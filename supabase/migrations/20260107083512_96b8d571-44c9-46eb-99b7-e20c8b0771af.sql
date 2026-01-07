-- Create function to get all root users (users with no referrer) for admin view
CREATE OR REPLACE FUNCTION get_network_roots()
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  user_level text,
  referral_count integer,
  referred_by uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id as user_id,
    p.email,
    p.full_name,
    p.user_level::text,
    p.referral_count,
    p.referred_by
  FROM profiles p
  WHERE p.referred_by IS NULL
  ORDER BY p.referral_count DESC, p.created_at ASC;
$$;