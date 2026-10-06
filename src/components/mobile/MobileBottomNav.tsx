import { forwardRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Home, Package, User, Wallet, Truck, Users, ShoppingCart, LogIn, Store, LayoutGrid } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import CartSheet from "@/components/CartSheet";
import { cn } from "@/lib/utils";

type AppType = "customer" | "driver" | "member";

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  /** Opens the cart sheet instead of navigating. */
  opensCart?: boolean;
  /** Path prefixes that also mark this tab as active. */
  activePrefixes?: string[];
}

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
          { icon: ShoppingCart, label: "Cart", path: "#cart", opensCart: true },
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
  const [isCartOpen, setIsCartOpen] = useState(false);
  const navItems = getNavItems(appType, !!user, Capacitor.isNativePlatform());

  const isActive = (item: NavItem) => {
    if (item.opensCart) return isCartOpen;
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
      <nav ref={ref} className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border safe-area-pb md:hidden">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            const badge = item.opensCart && totalItems > 0 ? (totalItems > 99 ? "99+" : String(totalItems)) : null;

            return (
              <button
                key={item.path}
                onClick={() => (item.opensCart ? setIsCartOpen(true) : navigate(item.path))}
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
      {navItems.some((item) => item.opensCart) && <CartSheet open={isCartOpen} onOpenChange={setIsCartOpen} />}
    </>
  );
});
MobileBottomNav.displayName = "MobileBottomNav";
