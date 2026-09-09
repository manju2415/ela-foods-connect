ALTER TABLE public.otp_send_log DROP CONSTRAINT IF EXISTS otp_send_log_outcome_check;
ALTER TABLE public.otp_send_log ADD CONSTRAINT otp_send_log_outcome_check
  CHECK (
    outcome = ANY (ARRAY['success','provider_error','invalid_response','internal_error'])
    OR outcome LIKE 'session:%'
  );