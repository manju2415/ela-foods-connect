-- Add new order statuses to the enum
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'undelivered';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'return_initiated';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'return_in_transit';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'returned';

-- Create undelivery reasons enum
DO $$ BEGIN
  CREATE TYPE undelivery_reason AS ENUM (
    'customer_unavailable',
    'wrong_address',
    'customer_refused',
    'payment_issue',
    'incomplete_address',
    'area_inaccessible',
    'customer_rescheduled',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create table to track undelivery and return process
CREATE TABLE IF NOT EXISTS public.undelivery_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_assignment_id UUID NOT NULL REFERENCES public.order_assignments(id) ON DELETE CASCADE,
  delivery_partner_id UUID NOT NULL REFERENCES public.delivery_partners(id),
  reason undelivery_reason NOT NULL,
  reason_notes TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  undelivered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  return_initiated_at TIMESTAMP WITH TIME ZONE,
  return_completed_at TIMESTAMP WITH TIME ZONE,
  return_received_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create order status history table for complete audit trail
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  previous_status order_status,
  new_status order_status NOT NULL,
  changed_by UUID,
  changed_by_type TEXT NOT NULL DEFAULT 'system', -- 'system', 'admin', 'delivery_partner', 'customer'
  delivery_partner_id UUID REFERENCES public.delivery_partners(id),
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_undelivery_logs_order_id ON public.undelivery_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_undelivery_logs_delivery_partner ON public.undelivery_logs(delivery_partner_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON public.order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_created_at ON public.order_status_history(created_at);

-- Enable RLS
ALTER TABLE public.undelivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for undelivery_logs
CREATE POLICY "Admins can manage undelivery logs"
  ON public.undelivery_logs FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Delivery partners can view their undelivery logs"
  ON public.undelivery_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM delivery_partners dp
    WHERE dp.id = undelivery_logs.delivery_partner_id
    AND dp.user_id = auth.uid()
  ));

CREATE POLICY "Delivery partners can create undelivery logs"
  ON public.undelivery_logs FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM delivery_partners dp
    WHERE dp.id = undelivery_logs.delivery_partner_id
    AND dp.user_id = auth.uid()
  ));

CREATE POLICY "Delivery partners can update their undelivery logs"
  ON public.undelivery_logs FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM delivery_partners dp
    WHERE dp.id = undelivery_logs.delivery_partner_id
    AND dp.user_id = auth.uid()
  ));

-- RLS Policies for order_status_history
CREATE POLICY "Admins can manage status history"
  ON public.order_status_history FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Delivery partners can view status history for their orders"
  ON public.order_status_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM order_assignments oa
    JOIN delivery_partners dp ON dp.id = oa.delivery_partner_id
    WHERE oa.order_id = order_status_history.order_id
    AND dp.user_id = auth.uid()
  ));

CREATE POLICY "Users can view their order status history"
  ON public.order_status_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders o
    WHERE o.id = order_status_history.order_id
    AND o.user_id = auth.uid()
  ));

CREATE POLICY "Delivery partners can insert status history"
  ON public.order_status_history FOR INSERT
  WITH CHECK (
    changed_by_type = 'delivery_partner' AND
    EXISTS (
      SELECT 1 FROM delivery_partners dp
      WHERE dp.id = order_status_history.delivery_partner_id
      AND dp.user_id = auth.uid()
    )
  );

-- Add COD settlement tracking columns to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_cod BOOLEAN DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cod_amount NUMERIC DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cod_collected BOOLEAN DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cod_collected_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cod_settled BOOLEAN DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cod_settled_at TIMESTAMP WITH TIME ZONE;

-- Update order_assignments for return tracking
ALTER TABLE public.order_assignments ADD COLUMN IF NOT EXISTS is_return_assignment BOOLEAN DEFAULT false;
ALTER TABLE public.order_assignments ADD COLUMN IF NOT EXISTS original_assignment_id UUID REFERENCES public.order_assignments(id);
ALTER TABLE public.order_assignments ADD COLUMN IF NOT EXISTS undelivery_reason undelivery_reason;

-- Trigger to update updated_at
CREATE OR REPLACE TRIGGER update_undelivery_logs_updated_at
  BEFORE UPDATE ON public.undelivery_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();