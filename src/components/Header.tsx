import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ShoppingCart, User, Menu, X, Search, LogOut, Shield, Truck, MapPin, ChevronDown, LayoutGrid } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import CartSheet from "@/components/CartSheet";
import { NotificationBell } from "@/components/NotificationBell";
import elaLogo from "@/assets/ela-foods-logo.png";
import { Capacitor } from "@capacitor/core";
import { AppTopBar } from "@/components/mobile/AppTopBar";

const WebsiteHeader = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { user, signOut } = useAuth();
  const { totalItems } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  const navLinks = [
    { name: "Home", href: "/shop" },
    { name: "Products", href: "/products" },
    { name: "Categories", href: "/categories" },
    { name: "Stores", href: "/stores" },
    { name: "About", href: "/about" },
    { name: "Contact", href: "/contact" },
  ];

  // The header remounts on every page, so the role lookup is cached per user
  // id for a few minutes instead of being repeated on each navigation. These
  // flags only decide which menu links are shown — the admin and driver
  // pages run their own access checks, and the database enforces access
  // regardless. Keyed by user id, so logging out or switching accounts never
  // reuses another user's result; a lookup that errored is never cached.
  const { data: roles } = useQuery({
    queryKey: ["header-roles", user?.id],
    enabled: !!user,
    staleTime: (query) => (query.state.data?.hadError ? 0 : 5 * 60 * 1000),
    queryFn: async () => {
      const [adminRes, partnerRes] = await Promise.all([
        supabase.rpc("is_admin", { _user_id: user!.id }),
        supabase.from("delivery_partners").select("id").eq("user_id", user!.id).maybeSingle(),
      ]);
      return {
        isAdmin: !!adminRes.data,
        isDeliveryPartner: !!partnerRes.data,
        hadError: !!adminRes.error || !!partnerRes.error,
      };
    },
  });
  const isAdmin = !!user && !!roles?.isAdmin;
  const isDeliveryPartner = !!user && !!roles?.isDeliveryPartner;

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    navigate(`/products?search=${encodeURIComponent(query)}`);
  };

  // When a delivery partner is logged in (especially inside the driver app),
  // the primary "Dashboard" action should take them to the driver dashboard.
  // We still keep access to the customer dashboard as a separate entry.
  const driverDashboardPath = "/driver-app";
  const customerDashboardPath = "/dashboard";
  const dashboardPath = isDeliveryPartner ? driverDashboardPath : customerDashboardPath;

  const searchForm = (className: string) => (
    <form onSubmit={handleSearchSubmit} role="search" className={className}>
      <Search className="ml-3 h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        type="search"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Search for dals, rice, spices and more"
        aria-label="Search products"
        className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
      />
      <Button type="submit" size="sm" className="mr-1 h-8 rounded-full px-4" aria-label="Submit product search">
        Search
      </Button>
    </form>
  );

  const searchBoxClass =
    "flex h-10 items-center rounded-full border border-border bg-background shadow-sm transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20";

  return (
    <>
      {/* Announcement strip (scrolls away; only the main bar is sticky) */}
      <div className="bg-primary text-primary-foreground">
        <div className="container mx-auto flex h-8 items-center justify-between gap-4 px-4 text-xs">
          <p className="truncate font-medium">
            <Truck className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" />
            Wholesale prices on daily groceries · Member prices for registered shoppers
          </p>
          <div className="hidden shrink-0 items-center gap-4 sm:flex">
            <Link to="/stores" className="flex items-center gap-1 hover:underline">
              <MapPin className="h-3.5 w-3.5" />
              Find a store
            </Link>
            <Link to="/contact" className="hover:underline">
              Help
            </Link>
          </div>
        </div>
      </div>

      <header className="sticky top-0 z-50 w-full safe-area-pt border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center gap-3 md:h-20 md:gap-6">
            {/* Logo */}
            <Link to="/shop" className="flex shrink-0 items-center gap-2">
              <img src={elaLogo} alt="ELA Foods" className="h-12 w-auto md:h-16" />
            </Link>

            {/* Desktop search — always visible, like a store search bar */}
            {searchForm(`hidden flex-1 md:flex max-w-2xl ${searchBoxClass}`)}

            {/* Actions */}
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              {user && <NotificationBell />}

              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="hidden sm:flex gap-2 font-medium">
                      <User className="h-4 w-4" />
                      Account
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem className="text-muted-foreground text-xs">
                      {user.email}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {isAdmin && (
                      <>
                        <DropdownMenuItem onClick={() => navigate("/admin")}>
                          <Shield className="h-4 w-4 mr-2" />
                          Admin Panel
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem onClick={() => navigate(dashboardPath, { replace: location.pathname === "/auth" })}>
                      Dashboard
                    </DropdownMenuItem>
                    {!isDeliveryPartner && (
                      <>
                        <DropdownMenuItem onClick={() => navigate("/dashboard?tab=orders")}>
                          My Orders
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate("/dashboard?tab=wallet")}>
                          Wallet
                        </DropdownMenuItem>
                      </>
                    )}
                    {isDeliveryPartner && (
                      <>
                        <DropdownMenuItem onClick={() => navigate("/driver-app/orders")}>
                          My Deliveries
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate("/driver-app/earnings")}>
                          Earnings
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <Button variant="ghost" size="sm" className="gap-2 font-medium" onClick={() => navigate("/auth")}>
                    <User className="h-4 w-4" />
                    Login
                  </Button>
                  <Button size="sm" className="hidden sm:flex rounded-full px-4 font-semibold" onClick={() => navigate("/signup")}>
                    Sign Up
                  </Button>
                </>
              )}

              <Button
                variant="ghost"
                className="relative gap-2 px-2 font-medium sm:px-3"
                onClick={() => setIsCartOpen(true)}
                aria-label="Open cart"
              >
                <span className="relative">
                  <ShoppingCart className="h-5 w-5" />
                  {totalItems > 0 && (
                    <span className="absolute -top-2 -right-2 h-5 min-w-5 px-1 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center">
                      {totalItems > 99 ? "99+" : totalItems}
                    </span>
                  )}
                </span>
                <span className="hidden lg:inline">Cart</span>
              </Button>

              {/* Mobile Menu Button */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label={isMenuOpen ? "Close menu" : "Open menu"}
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </Button>
            </div>
          </div>

          {/* Mobile search */}
          <div className="pb-3 md:hidden">{searchForm(`w-full ${searchBoxClass}`)}</div>

          {/* Mobile Navigation */}
          {isMenuOpen && (
            <nav className="md:hidden pb-6 pt-2 border-t border-border">
              <div className="flex flex-col gap-4">
                {navLinks.map((link) => (
                  <Link
                    key={link.name}
                    to={link.href}
                    className="text-foreground/80 hover:text-primary font-medium transition-colors py-2"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {link.name}
                  </Link>
                ))}
                <div className="flex gap-3 pt-4 border-t border-border">
                  {user ? (
                    <>
                      <Button variant="outline" className="flex-1" onClick={() => navigate(dashboardPath)}>
                        Dashboard
                      </Button>
                      <Button variant="destructive" className="flex-1" onClick={handleSignOut}>
                        Sign Out
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" className="flex-1" onClick={() => navigate("/auth")}>
                        Login
                      </Button>
                      <Button className="flex-1" onClick={() => navigate("/signup")}>
                        Sign Up
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </nav>
          )}
        </div>
      </header>

      {/* Desktop link bar (not sticky, so the sticky header stays short) */}
      <nav aria-label="Main" className="hidden border-b border-border bg-card md:block">
        <div className="container mx-auto flex h-11 items-center gap-1 px-4">
          <Link
            to="/categories"
            className="mr-3 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
          >
            <LayoutGrid className="h-4 w-4" />
            All Categories
          </Link>
          {navLinks
            .filter((link) => link.href !== "/categories")
            .map((link) => {
              const active = location.pathname === link.href || (link.href === "/shop" && location.pathname === "/");
              return (
                <Link
                  key={link.name}
                  to={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative px-3 py-2 text-sm font-medium transition-colors hover:text-primary ${
                    active
                      ? "text-primary after:absolute after:inset-x-3 after:-bottom-[5px] after:h-0.5 after:rounded-full after:bg-primary"
                      : "text-foreground/75"
                  }`}
                >
                  {link.name}
                </Link>
              );
            })}
        </div>
      </nav>

      <CartSheet open={isCartOpen} onOpenChange={setIsCartOpen} />
    </>
  );
};

// Inside the installed app the website header is replaced by a slim app bar
// (back arrow + page title); the website keeps the full header.
const Header = () => (Capacitor.isNativePlatform() ? <AppTopBar /> : <WebsiteHeader />);

export default Header;
