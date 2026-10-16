import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, MapPin, Search, ShoppingCart, User, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { APP_CART_PATH } from "@/lib/appRoutes";
import { accountPath } from "@/lib/guestAccess";
import { ProductSearchSuggestions } from "@/components/ProductSearchSuggestions";

// Same orange as the customer app's native status bar (useSplashScreen), so
// the header reads as one block with it.
const APP_ORANGE = "#f97316";
const SEARCH_HINTS = ["toor dal", "rice", "wheat flour", "spices", "cooking oil", "moong dal"];

/**
 * Installed-app home top bar: delivery address, product search and cart.
 * Search goes to the existing /products?search= results; the address line
 * opens the existing address manager; the cart opens the app cart page.
 */
export function AppHomeTopBar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { totalItems } = useCart();
  const [searchQuery, setSearchQuery] = useState("");
  const [hintIndex, setHintIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Rotate the search hint while the box is empty.
  useEffect(() => {
    if (searchQuery) return;
    const timer = window.setInterval(() => setHintIndex((i) => (i + 1) % SEARCH_HINTS.length), 2500);
    return () => window.clearInterval(timer);
  }, [searchQuery]);

  const { data: address } = useQuery({
    queryKey: ["app-home-address", user?.id],
    enabled: !!user,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("addresses")
        .select("label, address_line1, city, postal_code")
        .eq("user_id", user!.id)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    setShowSuggestions(false);
    navigate(`/products?search=${encodeURIComponent(query)}`);
  };

  const showAllResults = () => {
    setShowSuggestions(false);
    navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
  };

  const handlePickSuggestion = (slug: string) => {
    setShowSuggestions(false);
    navigate(`/product/${slug}`);
  };

  const addressText = address
    ? [address.address_line1, address.city, address.postal_code].filter(Boolean).join(", ")
    : user
      ? "Tap to add your delivery address"
      : "Sign in to add your delivery address";

  const iconButton =
    "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-white ring-1 ring-white/25 backdrop-blur-sm active:scale-95 transition-transform";

  return (
    <>
      <header
        className="sticky top-0 z-40 safe-area-pt rounded-b-3xl text-white shadow-md"
        style={{ background: `linear-gradient(180deg, ${APP_ORANGE} 0%, hsl(var(--accent)) 100%)` }}
      >
        <div className="flex items-center gap-3 px-4 pt-3">
          <button
            type="button"
            onClick={() => navigate(accountPath("/customer-app/addresses", !!user))}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left active:opacity-80"
            aria-label="Change delivery address"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
              <MapPin className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-medium uppercase tracking-wider text-white/80">
                Deliver to
              </span>
              <span className="flex items-center gap-1 text-base font-bold leading-tight">
                <span className="truncate">{address ? address.label || "Home" : "Set location"}</span>
                <ChevronDown className="h-4 w-4 shrink-0" />
              </span>
              <span className="block truncate text-xs text-white/85">{addressText}</span>
            </span>
          </button>

          <button
            type="button"
            className={iconButton}
            onClick={() => navigate(APP_CART_PATH)}
            aria-label={totalItems > 0 ? `Cart, ${totalItems} items` : "Cart"}
          >
            <ShoppingCart className="h-5 w-5" />
            {totalItems > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full bg-white px-1 text-[11px] font-bold leading-5 text-center shadow"
                style={{ color: APP_ORANGE }}
              >
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
          </button>
          <button
            type="button"
            className={iconButton}
            onClick={() => navigate("/customer-app/profile")}
            aria-label="Account"
          >
            <User className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSearch} className="relative px-4 pb-4 pt-3" role="search">
          <label className="flex h-12 items-center gap-3 rounded-2xl bg-white px-4 text-foreground shadow-lg">
            <Search className="h-5 w-5 shrink-0" style={{ color: APP_ORANGE }} />
            <span className="relative flex-1 min-w-0 h-full">
              <input
                type="search"
                enterKeyHint="search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setShowSuggestions(false)}
                autoComplete="off"
                aria-label="Search products"
                className="h-full w-full bg-transparent text-[15px] outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              {!searchQuery && (
                <span className="pointer-events-none absolute inset-0 flex items-center truncate text-[15px] text-muted-foreground">
                  Search for&nbsp;
                  <span key={hintIndex} className="truncate font-medium text-foreground/70 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    "{SEARCH_HINTS[hintIndex]}"
                  </span>
                </span>
              )}
            </span>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          {showSuggestions && (
            <ProductSearchSuggestions
              query={searchQuery}
              onPickProduct={handlePickSuggestion}
              onSeeAll={showAllResults}
              className="left-4 right-4 -mt-2"
            />
          )}
        </form>
      </header>
    </>
  );
}
