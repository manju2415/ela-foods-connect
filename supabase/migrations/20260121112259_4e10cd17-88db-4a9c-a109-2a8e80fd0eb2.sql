-- Create return_requests table for customer return/exchange/refund requests
CREATE TABLE public.return_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('return', 'exchange', 'refund')),
  quantity INTEGER NOT NULL DEFAULT 1,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'pickup_scheduled', 'picked_up', 'completed')),
  admin_notes TEXT,
  -- Pickup scheduling fields
  pickup_date DATE,
  pickup_slot_id UUID REFERENCES public.delivery_time_slots(id),
  pickup_address JSONB,
  picked_up_at TIMESTAMP WITH TIME ZONE,
  -- Resolution details
  resolution_type TEXT CHECK (resolution_type IN ('refund_to_wallet', 'refund_to_source', 'exchange_processed')),
  refund_amount NUMERIC,
  processed_by UUID,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own return requests
CREATE POLICY "Users can view their own return requests"
ON public.return_requests
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create return requests for their orders
CREATE POLICY "Users can create return requests"
ON public.return_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their pending requests (e.g., schedule pickup)
CREATE POLICY "Users can update pending requests"
ON public.return_requests
FOR UPDATE
USING (auth.uid() = user_id AND status IN ('pending', 'approved'));

-- Admins can manage all return requests
CREATE POLICY "Admins can manage return requests"
ON public.return_requests
FOR ALL
USING (is_admin(auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_return_requests_updated_at
BEFORE UPDATE ON public.return_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();