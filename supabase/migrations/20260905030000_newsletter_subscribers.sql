-- The homepage newsletter form had no backing table at all — "Subscribe"
-- just reloaded the page.
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous visitors) may subscribe, but only admins can
-- read the list back.
DROP POLICY IF EXISTS "Anyone can subscribe to the newsletter" ON public.newsletter_subscribers;
CREATE POLICY "Anyone can subscribe to the newsletter"
ON public.newsletter_subscribers FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view newsletter subscribers" ON public.newsletter_subscribers;
CREATE POLICY "Admins can view newsletter subscribers"
ON public.newsletter_subscribers FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));
