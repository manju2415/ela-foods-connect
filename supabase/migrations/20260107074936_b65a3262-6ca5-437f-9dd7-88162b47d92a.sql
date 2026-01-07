-- Create delivery_time_slots table for scheduling
CREATE TABLE public.delivery_time_slots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT true,
  max_orders_per_slot INTEGER DEFAULT 50,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.delivery_time_slots ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read active slots
CREATE POLICY "Anyone can view active delivery slots"
ON public.delivery_time_slots
FOR SELECT
USING (is_active = true);

-- Admins can manage slots
CREATE POLICY "Admins can manage delivery slots"
ON public.delivery_time_slots
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()));

-- Add delivery scheduling columns to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS preferred_delivery_date DATE,
ADD COLUMN IF NOT EXISTS preferred_delivery_slot_id UUID REFERENCES public.delivery_time_slots(id);

-- Insert some default time slots
INSERT INTO public.delivery_time_slots (name, start_time, end_time, display_order) VALUES
  ('Morning (9 AM - 12 PM)', '09:00', '12:00', 1),
  ('Afternoon (12 PM - 3 PM)', '12:00', '15:00', 2),
  ('Evening (3 PM - 6 PM)', '15:00', '18:00', 3),
  ('Night (6 PM - 9 PM)', '18:00', '21:00', 4);

-- Create updated_at trigger
CREATE TRIGGER update_delivery_time_slots_updated_at
BEFORE UPDATE ON public.delivery_time_slots
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();