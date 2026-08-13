-- 1) Central helper: always return a wallet id, creating it if needed
CREATE OR REPLACE FUNCTION public.ensure_user_wallet(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wallet_id uuid;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_wallet_id FROM wallets WHERE user_id = p_user_id;
  IF v_wallet_id IS NOT NULL THEN RETURN v_wallet_id; END IF;

  INSERT INTO wallets (user_id, balance, withdrawable_balance, purchase_only_balance)
  VALUES (p_user_id, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_wallet_id;

  IF v_wallet_id IS NULL THEN
    SELECT id INTO v_wallet_id FROM wallets WHERE user_id = p_user_id;
  END IF;

  RETURN v_wallet_id;
END;
$$;

-- 2) Backfill wallets for every existing profile
INSERT INTO wallets (user_id, balance, withdrawable_balance, purchase_only_balance)
SELECT p.id, 0, 0, 0
FROM profiles p
LEFT JOIN wallets w ON w.user_id = p.id
WHERE w.id IS NULL
ON CONFLICT DO NOTHING;

-- 3) Auto-create a wallet whenever a profile is created
CREATE OR REPLACE FUNCTION public.create_wallet_for_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM ensure_user_wallet(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_wallet_for_profile ON public.profiles;
CREATE TRIGGER trg_create_wallet_for_profile
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.create_wallet_for_profile();
