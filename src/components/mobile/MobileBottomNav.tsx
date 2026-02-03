import { forwardRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Package, User, Wallet, Truck, Users, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";

type AppType = "customer" | "driver" | "member";

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
}

const getNavItems = (appType: AppType): NavItem[] => {
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
        { icon: Users, label: "Network", path: "/member-app/network" },
        { icon: Wallet, label: "Wallet", path: "/member-app/wallet" },
        { icon: User, label: "Profile", path: "/member-app/profile" },
      ];
    case "customer":
    default:
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
  const navItems = getNavItems(appType);

  const isActive = (path: string) => {
    // Exact match for home routes
    if (path.endsWith("-app")) {
      return location.pathname === path;
    }
    // Prefix match for sub-routes
    return location.pathname.startsWith(path);
  };

  return (
    <nav ref={ref} className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border safe-area-pb">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
              <span className={cn("text-xs", active && "font-medium")}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});
MobileBottomNav.displayName = "MobileBottomNav";
