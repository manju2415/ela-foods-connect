-- Add GST fields to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS gst_percentage numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS gst_inclusive boolean DEFAULT true;