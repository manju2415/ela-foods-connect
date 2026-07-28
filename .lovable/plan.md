
## 1. Force founders through profile completion + registration payment

**Root cause (verified in `src/pages/Auth.tsx` lines 201–227):** `handlePostVerifyRedirect` sets `isFounderOrAdmin = true` whenever the user has any of `founding_member / super_admin / admin / member / mlm_admin`, then **skips** both the `/complete-registration` and `/registration-payment` gates. That's why 9448493290 went straight into the member/admin dashboard without being asked for bank details or payment.

Changes:
- Narrow the "skip onboarding" bucket to admin-only: `super_admin`, `admin`, `mlm_admin` (not `founding_member` / `member`).
- Founders (`founding_member` role or `user_level = 'founder'`) will now go through the same two gates as regular members:
  1. `/complete-registration` if bank details missing.
  2. `/registration-payment` if `registration_fee_paid = 0`.
- Apply the same narrowed check inside `src/hooks/useOnboardingStatus.ts` so the member-app guard also enforces it.
- Backfill: reset `profiles.registration_fee_paid = 0` and clear bank fields for the four founders (Shyju, Sudevan, Manoj, Vinod) so their next login triggers the flow. Their `founding_member` role and `user_level='founder'` stay intact.
- Super admin `8050000300` remains exempt (admin role skips onboarding).

## 2. Package photos — before pickup & after delivery

New feature on the delivery partner app:
- Add two nullable columns to `order_assignments`: `pickup_photo_url TEXT`, `delivery_photo_url TEXT`.
- Reuse the existing `product-images` bucket path prefix `order-proofs/<order_id>/{pickup|delivery}-<timestamp>.jpg` (public bucket, RLS on `storage.objects` scoped to assigned delivery partner + admins).
- Driver app flow:
  - "Mark Picked Up" button → require a photo capture (Capacitor Camera on native, file input fallback on web) → upload → save `pickup_photo_url` → then flip status to `picked_up`.
  - "Mark Delivered" button → require a photo capture → upload → save `delivery_photo_url` → then flip status to `delivered`.
- Admin `Order Assignments` and customer `OrderDetailPage` show thumbnails of both photos as proof.

## 3. Weight/package variants (500g / 1kg / 2kg …)

- New table `public.product_variants` with columns: `product_id`, `label` (e.g. "500 g"), `unit_value NUMERIC`, `unit_type TEXT`, `price NUMERIC`, `member_price NUMERIC`, `stock_quantity INT`, `sku TEXT`, `is_default BOOLEAN`, `display_order INT`. Standard GRANTs + RLS (public read for active variants, admin write).
- Admin Products page: add a "Variants" editor inside the product form so each product optionally holds a list of weights with independent price/stock.
- `cart_items` gains a nullable `variant_id UUID` FK. When a variant is chosen, cart/checkout/order-items use variant price + label.
- `order_items` gains `variant_id`, `variant_label` (snapshot).
- Product detail page (`ProductDetail.tsx` + mobile view): show a variant selector when the product has variants; price, stock, and "Add to cart" reflect the selected variant.
- Featured/product cards show the price of the default (or lowest-priced) variant with an "options available" hint.
- Products without variants keep working exactly as today (fallback to product-level price/stock).

## 4. End-to-end go-live audit (code review + live automated run)

Deliverable: a written report at `.lovable/go-live-audit.md` covering each step, plus fixes for any regressions found while doing the run.

Steps I will execute against the preview using test accounts + Playwright:

```text
add user (with fee)
      ↓
process_mlm_referral → credit_founder_commission (multi-level upline)
      ↓
shopping (browse + add to cart, with new variants)
      ↓
checkout (address, delivery slot, wallet split, coupon)
      ↓
payment (Razorpay live order + verify)
      ↓
order created → dispatch (assign delivery partner, pickup photo, delivery photo)
      ↓
credit_purchase_commission → upline wallets (withdrawable vs purchase-only)
```

For each step I will confirm:
- HTTP/edge-function success (no 4xx/5xx).
- DB side-effects (rows in `wallet_transactions`, `notifications`, `order_status_history`).
- Wallet balance splits match the current MLM settings values you finalised.
- Screenshots at each stage.

## 5. Verify MLM wallet distribution matches your final settings

As part of the audit I'll:
- Dump the current `mlm_settings` rows (`registration_fee`, `first_10_referral_bonus`, `beyond_10_referral_bonus`, `welcome_bonus`, `founder_level_commissions`, `founder_registration_commission`, `purchase_commission_rate`).
- Trigger one seeded referral chain (Founder → Master → Associate → new signup) and one purchase, then verify each upline's `wallet_transactions` row (amount, `is_withdrawable`, description) matches the settings JSON exactly.
- Report any level whose credited amount ≠ configured amount, with the exact SQL/edge-function line to fix.

## Technical details

- Files touched for §1: `src/pages/Auth.tsx` (redirect logic), `src/hooks/useOnboardingStatus.ts` (mirror change), plus a data migration for founder profiles.
- Files touched for §2: migration on `order_assignments`, `src/pages/DriverApp.tsx` / `src/pages/mobile/driver/OrdersPage.tsx`, new `PackagePhotoCapture` component, admin `OrderAssignments.tsx`, customer `OrderDetailPage.tsx`.
- Files touched for §3: migration for `product_variants` + `cart_items.variant_id` + `order_items.variant_id/label`, `src/pages/admin/Products.tsx`, `src/pages/ProductDetail.tsx`, `src/components/ProductCard.tsx`, `src/contexts/CartContext.tsx`, `src/pages/Checkout.tsx`, `supabase/functions/place-guest-order/index.ts`.
- All new tables follow the four-step CREATE → GRANT → ENABLE RLS → POLICY pattern; storage bucket for proof photos will be private with RLS.

## Out of scope

- No visual redesign of existing screens beyond adding variant selectors and photo buttons.
- No change to super-admin or delivery-partner login flow.
- No new payment provider — Razorpay only.
