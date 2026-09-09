CREATE SEQUENCE IF NOT EXISTS public.invoice_number_eb_seq START 1;

CREATE OR REPLACE FUNCTION public.next_invoice_number(p_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 'EB-' || lpad(nextval('public.invoice_number_eb_seq')::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_invoice_number(text) FROM PUBLIC, anon, authenticated;

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY issued_at, created_at, id) AS rn
  FROM public.invoices
)
UPDATE public.invoices i
SET invoice_number = 'EB-' || lpad(o.rn::text, 4, '0')
FROM ordered o
WHERE o.id = i.id;

SELECT setval('public.invoice_number_eb_seq', GREATEST((SELECT count(*) FROM public.invoices), 1), true);