-- GoodBox (appzo.ai) contact creation after a member's registration is paid.
--
-- completeRegistration can run several times at once for the same payment
-- (razorpay-verify-payment, the webhook/sweep via settlePayment, the client's
-- process-registration-payment and reconcile-payment-attempt), so the edge
-- function claims a row here first — the primary key lets exactly one caller
-- win — and only that caller submits to GoodBox. This stops duplicate
-- contacts / duplicate WhatsApp welcome messages.
--
-- New table only: no existing table or row is touched, and nothing is
-- backfilled, so members who registered before this never get submitted.
CREATE TABLE IF NOT EXISTS public.goodbox_contact_sync (
  user_id uuid PRIMARY KEY,
  mobile_number text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  http_status integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.goodbox_contact_sync ENABLE ROW LEVEL SECURITY;

-- Written only by edge functions via the service role. Readable by admins
-- for debugging failed submissions.
DROP POLICY IF EXISTS "Admins can view goodbox contact sync" ON public.goodbox_contact_sync;
CREATE POLICY "Admins can view goodbox contact sync"
ON public.goodbox_contact_sync FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));
