-- "Send OTP" occasionally fails before it even reaches MSG91 (intermittent
-- server errors on the login/phone-check services). Nothing recorded each
-- attempt, so there was no way to see whether failures cluster around a
-- specific time, phone prefix, or provider response. This table gives
-- msg91-send-otp somewhere to record every attempt so the pattern can be
-- traced instead of guessed at.
CREATE TABLE IF NOT EXISTS public.otp_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'provider_error', 'invalid_response', 'internal_error')),
  provider_request_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_send_log_phone_created_idx
  ON public.otp_send_log (phone, created_at);

ALTER TABLE public.otp_send_log ENABLE ROW LEVEL SECURITY;

-- Written only by the msg91-send-otp edge function via the service role.
-- Readable by admins only, for tracing intermittent failures.
DROP POLICY IF EXISTS "Admins can view otp send log" ON public.otp_send_log;
CREATE POLICY "Admins can view otp send log"
ON public.otp_send_log FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));
