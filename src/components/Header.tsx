import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShoppingCart, User, Menu, X, Search, LogOut, Shield, Truck } from "lucide-react";
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

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDeliveryPartner, setIsDeliveryPartner] = useState(false);
  const { user, signOut } = useAuth();
  const { totalItems } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  const navLinks = [
    { name: "Home", href: "/" },
    { name: "Products", href: "/products" },
    { name: "Categories", href: "/categories" },
    { name: "Stores", href: "/stores" },
    { name: "About", href: "/about" },
    { name: "Contact", href: "/contact" },
  ];

  useEffect(() => {
    const checkRoles = async () => {
      if (user) {
        const [adminRes, partnerRes] = await Promise.all([
          supabase.rpc("is_admin", { _user_id: user.id }),
          supabase.from("delivery_partners").select("id").eq("user_id", user.id).maybeSingle(),
        ]);
        setIsAdmin(!!adminRes.data);
        setIsDeliveryPartner(!!partnerRes.data);
      } else {
        setIsAdmin(false);
        setIsDeliveryPartner(false);
      }
    };
    checkRoles();
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  // When a delivery partner is logged in (especially inside the driver app),
  // the primary "Dashboard" action should take them to the driver dashboard.
  // We still keep access to the customer dashboard as a separate entry.
  const driverDashboardPath = "/driver-app";
  const customerDashboardPath = "/dashboard";
  const dashboardPath = isDeliveryPartner ? driverDashboardPath : customerDashboardPath;

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="container mx-auto px-4">
          <div className="flex h-20 items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
              <img src={elaLogo} alt="ELA Foods" className="h-16 w-auto" />
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.name}
                  to={link.href}
                  className="text-foreground/80 hover:text-primary font-medium transition-colors duration-200"
                >
                  {link.name}
                </Link>
              ))}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="hidden sm:flex">
                <Search className="h-5 w-5" />
              </Button>
              
              {user && <NotificationBell />}
              
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                onClick={() => setIsCartOpen(true)}
              >
                <ShoppingCart className="h-5 w-5" />
                {totalItems > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                    {totalItems > 99 ? "99+" : totalItems}
                  </span>
                )}
              </Button>

              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="hidden sm:flex gap-2">
                      <User className="h-4 w-4" />
                      Account
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden sm:flex gap-2"
                    onClick={() => navigate("/auth")}
                  >
                    <User className="h-4 w-4" />
                    Login
                  </Button>
                  <Button size="sm" className="hidden sm:flex" onClick={() => navigate("/auth")}>
                    Sign Up
                  </Button>
                </>
              )}

              {/* Mobile Menu Button */}
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </Button>
            </div>
          </div>

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
                      <Button className="flex-1" onClick={() => navigate("/auth")}>
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

      <CartSheet open={isCartOpen} onOpenChange={setIsCartOpen} />
    </>
  );
};

export default Header;
