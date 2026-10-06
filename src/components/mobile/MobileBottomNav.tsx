import { forwardRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Home, Package, User, Wallet, Users, ShoppingCart, LogIn, Store, LayoutGrid, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useMemberPricing } from "@/hooks/useMemberPricing";
import { cn } from "@/lib/utils";
import { APP_CART_PATH } from "@/lib/appRoutes";

type AppType = "customer" | "driver" | "member";

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  /** Shows the cart item count badge. */
  showsCartCount?: boolean;
  /** Path prefixes that also mark this tab as active. */
  activePrefixes?: string[];
}

// Screens with their own bottom action bar — no "View cart" bar there.
const NO_VIEW_CART_BAR = [APP_CART_PATH, "/checkout", "/guest-checkout", "/product/"];

const getNavItems = (appType: AppType, isLoggedIn: boolean, isNativeApp: boolean): NavItem[] => {
  switch (appType) {
    case "driver":
      return [
        { icon: Home, label: "Home", path: "/driver-app" },
        { icon: Package, label: "Orders", path: "/driver-app/orders" },
        { icon: Wallet, label: "Earnings", path: "/driver-app/earnings" },
        { icon: User, label: "Profile", path: "/driver-app/profile" },
      ];
    case "member":
      return [
        { icon: Home, label: "Home", path: "/member-app" },
        { icon: Store, label: "Shop", path: "/member-app/shop" },
        { icon: Users, label: "Network", path: "/member-app/network" },
        { icon: Wallet, label: "Wallet", path: "/member-app/wallet" },
        { icon: User, label: "Profile", path: "/member-app/profile" },
      ];
    case "customer":
    default:
      // Installed app: shopping-first tabs. Orders and Wallet live under Account.
      if (isNativeApp) {
        return [
          { icon: Home, label: "Home", path: "/customer-app" },
          { icon: LayoutGrid, label: "Categories", path: "/categories", activePrefixes: ["/category/"] },
          { icon: ShoppingCart, label: "Cart", path: APP_CART_PATH, showsCartCount: true },
          {
            icon: User,
            label: "Account",
            path: "/customer-app/profile",
            activePrefixes: ["/customer-app/orders", "/customer-app/order/", "/customer-app/wallet", "/customer-app/addresses"],
          },
        ];
      }
      if (!isLoggedIn) {
        return [
          { icon: Home, label: "Home", path: "/customer-app" },
          { icon: ShoppingCart, label: "Orders", path: "/customer-app/orders" },
          { icon: LogIn, label: "Login", path: "/auth?redirect=/customer-app" },
        ];
      }
      return [
        { icon: Home, label: "Home", path: "/customer-app" },
        { icon: ShoppingCart, label: "Orders", path: "/customer-app/orders" },
        { icon: Wallet, label: "Wallet", path: "/customer-app/wallet" },
        { icon: User, label: "Profile", path: "/customer-app/profile" },
      ];
  }
};

/** Installed app: "View cart · X items · ₹Y" bar shown above the customer tabs. */
function ViewCartBar() {
  const navigate = useNavigate();
  const { totalItems, totalPrice, memberTotalPrice } = useCart();
  const memberPricing = useMemberPricing();
  const total = memberPricing ? memberTotalPrice : totalPrice;

  return (
    <>
      <div aria-hidden className="h-16 md:hidden" />
      <button
        type="button"
        onClick={() => navigate(APP_CART_PATH)}
        className="fixed left-3 right-3 z-50 flex h-12 items-center justify-between rounded-xl bg-primary px-4 text-primary-foreground shadow-lg md:hidden"
        style={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingCart className="h-4 w-4" />
          {totalItems} item{totalItems === 1 ? "" : "s"} · ₹{total.toFixed(2)}
        </span>
        <span className="flex items-center text-sm font-bold">
          View cart <ChevronRight className="h-4 w-4" />
        </span>
      </button>
    </>
  );
}

interface MobileBottomNavProps {
  appType: AppType;
}

export const MobileBottomNav = forwardRef<HTMLElement, MobileBottomNavProps>(function MobileBottomNav(
  { appType },
  ref
) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { totalItems } = useCart();
  const isNativeApp = Capacitor.isNativePlatform();
  const navItems = getNavItems(appType, !!user, isNativeApp);

  const showViewCartBar =
    isNativeApp &&
    appType === "customer" &&
    totalItems > 0 &&
    !NO_VIEW_CART_BAR.some((prefix) => location.pathname.startsWith(prefix));

  const isActive = (item: NavItem) => {
    const { path } = item;
    if (item.activePrefixes?.some((prefix) => location.pathname.startsWith(prefix))) {
      return true;
    }
    if (path.endsWith("-app")) {
      return location.pathname === path;
    }
    if (path.startsWith("/auth")) {
      return location.pathname === "/auth";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {showViewCartBar && <ViewCartBar />}
      <nav ref={ref} className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border safe-area-pb md:hidden">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            const badge = item.showsCartCount && totalItems > 0 ? (totalItems > 99 ? "99+" : String(totalItems)) : null;

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                aria-label={badge ? `${item.label}, ${totalItems} items` : item.label}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 min-w-0 h-full gap-1 px-0.5 transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="relative flex">
                  <Icon className={cn("h-5 w-5 shrink-0", active && "stroke-[2.5]")} />
                  {badge && (
                    <span className="absolute -top-2 -right-3 min-w-[18px] h-[18px] rounded-full bg-primary px-1 text-[10px] font-semibold leading-[18px] text-primary-foreground text-center">
                      {badge}
                    </span>
                  )}
                </span>
                <span className={cn("text-[10px] xs:text-xs leading-none w-full truncate text-center", active && "font-medium")}>{item.label}</span>

              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
});
MobileBottomNav.displayName = "MobileBottomNav";
