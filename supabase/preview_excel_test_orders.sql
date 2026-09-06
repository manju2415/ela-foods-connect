-- READ ONLY: identify orders associated with the five mobile numbers in
-- Ela Bazar Login Details (1).xlsx. No accounts or orders are modified.
-- Phone fields only: do not match names, emails, passwords, or other digits.
WITH test_phones(phone) AS (
  VALUES ('9999000001'), ('9999000002'), ('9999000003'),
         ('9999000004'), ('9999000005')
), candidates AS (
  SELECT o.id, o.order_number, o.created_at, o.status, o.payment_status,
         o.total_amount, o.wallet_amount_used, o.admin_deleted_at,
         right(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), 10) AS account_phone,
         right(regexp_replace(coalesce(o.shipping_address->>'phone', ''), '[^0-9]', '', 'g'), 10) AS shipping_phone
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.user_id
)
SELECT c.*,
       EXISTS (SELECT 1 FROM public.invoices i WHERE i.order_id = c.id) AS has_invoice,
       EXISTS (SELECT 1 FROM public.payment_attempts a WHERE a.order_id = c.id) AS has_payment_record
FROM candidates c
WHERE c.account_phone IN (SELECT phone FROM test_phones)
   OR c.shipping_phone IN (SELECT phone FROM test_phones)
ORDER BY c.created_at DESC, c.id;
