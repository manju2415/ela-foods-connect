
-- Delete auth users for phone 9999999992
-- User created via phone auth
DELETE FROM auth.users WHERE id = '36bdf9f0-fdb3-485f-853f-ed9dc93e0a92';
-- User created via email auth  
DELETE FROM auth.users WHERE id = '5870b49e-3117-4646-962f-9bea6cb8f68d';
