-- Add missing columns to categories table
ALTER TABLE public.categories 
ADD COLUMN IF NOT EXISTS return_window_days integer DEFAULT 7;

-- Add missing column to profiles table for designated founders
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_designated_founder boolean DEFAULT false;

-- Create site_policies table for managing policies
CREATE TABLE IF NOT EXISTS public.site_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_type text NOT NULL UNIQUE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  is_active boolean DEFAULT true,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS on site_policies
ALTER TABLE public.site_policies ENABLE ROW LEVEL SECURITY;

-- RLS policies for site_policies
CREATE POLICY "Anyone can view active policies" ON public.site_policies
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage all policies" ON public.site_policies
  FOR ALL USING (is_admin(auth.uid()));

-- Insert default policies
INSERT INTO public.site_policies (policy_type, title, content) VALUES
  ('return', 'Return Policy', '## Return Policy

### Eligibility
- Products must be returned within the specified return window
- Items must be unused and in original packaging

### Process
1. Submit a return request from your order history
2. Select pickup date and time slot
3. Our delivery partner will collect the item
4. Refund will be processed within 5-7 business days'),
  ('cancellation', 'Cancellation Policy', '## Cancellation Policy

### Before Dispatch
- Orders can be cancelled anytime before dispatch
- Full refund will be credited to your wallet

### After Dispatch
- Once dispatched, orders cannot be cancelled
- You may request a return after delivery'),
  ('refund', 'Refund Policy', '## Refund Policy

### Refund Methods
- **Wallet Credit**: Instant refund to your ELA Foods wallet
- **Original Payment Method**: 5-7 business days

### Conditions
- Item must pass quality check
- All tags and packaging must be intact')
ON CONFLICT (policy_type) DO NOTHING;

-- Add founder_commission_percentage to mlm_settings if not exists
INSERT INTO public.mlm_settings (key, value, description) VALUES
  ('founder_registration_commission', '{"enabled": false, "percentage": 5, "description": "Percentage of registration fee credited to founder"}', 'Founder commission on new member registration fee')
ON CONFLICT (key) DO NOTHING;