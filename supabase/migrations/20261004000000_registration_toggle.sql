-- Super-admin switch for the member registration process.
--
-- ON  (default): Login → OTP → details + address → registration fee → shop.
-- OFF:           Login → OTP → shop; new numbers get a plain customer account
--                at login and the delivery address is taken at checkout.
--
-- Stored in platform_settings (anyone can read, only super admins can write),
-- not mlm_settings: it is a global switch, not an MLM rate, so it must never
-- create an mlm_settings version. Seeded ON so nothing changes until a super
-- admin turns it off.
INSERT INTO public.platform_settings (key, value, description)
VALUES (
  'registration_settings',
  '{"registration_enabled": true}'::jsonb,
  'Member registration on/off (super admin)'
)
ON CONFLICT (key) DO NOTHING;
