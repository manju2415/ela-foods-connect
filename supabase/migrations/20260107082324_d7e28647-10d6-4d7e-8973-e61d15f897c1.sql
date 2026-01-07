-- Create testimonials table
CREATE TABLE public.testimonials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  is_approved BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;

-- Anyone can view approved testimonials
CREATE POLICY "Anyone can view approved testimonials"
ON public.testimonials
FOR SELECT
USING (is_approved = true);

-- Users can view their own testimonials (including pending)
CREATE POLICY "Users can view their own testimonials"
ON public.testimonials
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create testimonials
CREATE POLICY "Users can create testimonials"
ON public.testimonials
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending testimonials
CREATE POLICY "Users can update their own pending testimonials"
ON public.testimonials
FOR UPDATE
USING (auth.uid() = user_id AND is_approved = false);

-- Users can delete their own testimonials
CREATE POLICY "Users can delete their own testimonials"
ON public.testimonials
FOR DELETE
USING (auth.uid() = user_id);

-- Admins can manage all testimonials
CREATE POLICY "Admins can manage all testimonials"
ON public.testimonials
FOR ALL
USING (is_admin(auth.uid()));

-- Add updated_at trigger
CREATE TRIGGER update_testimonials_updated_at
BEFORE UPDATE ON public.testimonials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();