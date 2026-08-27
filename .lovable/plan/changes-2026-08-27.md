Improve cart navigation so users can easily return to product browsing before checkout.

The only cart surface is the `CartSheet` slide-out. It already contains a "Continue Shopping" button, but the user reports no obvious way to get back to the product list. The plan is to make the back-to-browsing action more discoverable and mobile-safe.

### Changes
1. Add a clear back/close affordance in the cart sheet header (left chevron + "Back to Products" action) so the user can exit the cart without hunting for the small sheet close icon.
2. Promote the existing "Continue Shopping" footer button visually (e.g. use a more prominent outline or add an icon) and ensure it remains visible above the mobile bottom navigation.
3. Add bottom-safe padding to the cart footer on mobile so it is not covered by the fixed bottom nav or device safe area.
4. Keep the empty-cart "Browse Products" button as-is; it already covers the no-items case.

### Files to edit
- `src/components/CartSheet.tsx`
- `src/components/mobile/MobileBottomNav.tsx` (if nav height/safe-area constants need tuning)
