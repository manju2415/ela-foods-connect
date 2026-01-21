-- Add return and exchange policy columns to categories table
ALTER TABLE public.categories 
ADD COLUMN IF NOT EXISTS return_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS exchange_enabled boolean DEFAULT true;