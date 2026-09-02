-- "Fast Selling" is a separate merchandising tag from "Featured" (is_featured),
-- shown as its own badge on product cards.
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS is_fast_selling boolean NOT NULL DEFAULT false;
