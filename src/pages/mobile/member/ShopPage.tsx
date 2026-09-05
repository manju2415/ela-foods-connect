import { MobileAppLayout } from "@/components/mobile/MobileAppLayout";
import Products from "@/pages/Products";

/**
 * Member app's "Shop" tab. Renders the product catalog inside the member-app
 * shell (bottom nav + layout) instead of navigating away to the standalone
 * /products page, which has its own desktop-style Header/Footer and no
 * bottom nav.
 */
export default function MemberShopPage() {
  return (
    <MobileAppLayout appType="member">
      <Products hideChrome />
    </MobileAppLayout>
  );
}
