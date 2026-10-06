import { useLocation, useNavigate } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { APP_CART_PATH } from "@/lib/appRoutes";
import { MobileHeader } from "./MobileHeader";

// Shopping screens get a cart shortcut in the top bar.
const CART_ACTION_ROUTES = [/^\/products\/?$/, /^\/categories\/?$/, /^\/category\//, /^\/product\//];

// Onboarding screens: no back arrow, so users don't step back out of the
// required registration flow.
const NO_BACK_PREFIXES = ["/complete-registration", "/registration-payment"];

const STATIC_TITLES: Record<string, string> = {
  "/products": "Products",
  "/categories": "Categories",
  "/checkout": "Checkout",
  "/guest-checkout": "Checkout",
  "/about": "About Us",
  "/contact": "Contact Us",
  "/stores": "Stores",
  "/terms-and-conditions": "Terms & Conditions",
  "/user-agreement": "User Agreement",
  "/dashboard": "My Account",
  "/delivery": "Deliveries",
  "/complete-registration": "Complete Registration",
  "/registration-payment": "Registration",
};

const titleFromSlug = (slug: string) =>
  decodeURIComponent(slug)
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

function getAppPageTitle(pathname: string, search: string): string {
  if (pathname === "/products") {
    const query = new URLSearchParams(search).get("search");
    if (query) return `Results for "${query}"`;
  }
  if (STATIC_TITLES[pathname]) return STATIC_TITLES[pathname];
  if (pathname.startsWith("/product/")) return "Product Details";
  if (pathname.startsWith("/category/")) {
    const slug = pathname.split("/").filter(Boolean).pop() ?? "";
    return titleFromSlug(slug) || "Category";
  }
  if (pathname.startsWith("/policies")) return "Policies";
  return "Ela Bazar";
}

/**
 * Installed-app replacement for the website Header: a slim bar with a back
 * arrow and the page title. Rendered by Header only on the native platform.
 */
export function AppTopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { totalItems } = useCart();
  const showCart = CART_ACTION_ROUTES.some((route) => route.test(location.pathname));

  const showBack = !NO_BACK_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));

  // Opened directly (e.g. from a notification) with nothing to go back to:
  // go to the app home instead of doing nothing.
  const handleBack = () => {
    if (location.key === "default") {
      navigate(user ? "/role-redirect" : "/auth", { replace: true });
    } else {
      navigate(-1);
    }
  };

  return (
    <MobileHeader
      title={getAppPageTitle(location.pathname, location.search)}
      showBack={showBack}
      onBack={handleBack}
      className="bg-background supports-[backdrop-filter]:bg-background/95"
      rightAction={
        showCart ? (
          <button
            type="button"
            onClick={() => navigate(APP_CART_PATH)}
            className="relative flex h-10 w-10 items-center justify-center rounded-full"
            aria-label={totalItems > 0 ? `Cart, ${totalItems} items` : "Cart"}
          >
            <ShoppingCart className="h-5 w-5" />
            {totalItems > 0 && (
              <span className="absolute right-0.5 top-0.5 min-w-[18px] h-[18px] rounded-full bg-primary px-1 text-[10px] font-semibold leading-[18px] text-primary-foreground text-center">
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
          </button>
        ) : undefined
      }
    />
  );
}
