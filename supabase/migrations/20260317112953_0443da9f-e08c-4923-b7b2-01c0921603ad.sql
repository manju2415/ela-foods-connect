UPDATE public.profiles 
SET bank_account_number = NULL, bank_ifsc = NULL, bank_name = NULL, bank_account_holder = NULL, registration_fee_paid = 0, full_name = NULL
WHERE phone LIKE '%9999000005%';