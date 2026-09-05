-- check-phones-batch let any authenticated user bulk-lookup up to 2000
-- arbitrary phone numbers with no rate limit, returning real registered
-- names — a PII enumeration vector unrelated to whether the caller actually
-- owns those contacts. This table backs a simple per-user rate limit; the
-- response itself no longer includes names (see the function).
CREATE TABLE IF NOT EXISTS public.phone_batch_check_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_batch_check_log_user_created_idx
  ON public.phone_batch_check_log (user_id, created_at);

ALTER TABLE public.phone_batch_check_log ENABLE ROW LEVEL SECURITY;
-- Written only by the check-phones-batch edge function via the service role;
-- no policies are needed for anon/authenticated access.
