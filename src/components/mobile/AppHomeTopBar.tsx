import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, MapPin, Search, ShoppingCart } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import CartSheet from "@/components/CartSheet";
import { Button } from "@/components/ui/button";

/**
 * Installed-app home top bar: delivery address, product search and cart.
 * Search goes to the existing /products?search= results; the address line
 * opens the existing address manager.
 */
export function AppHomeTopBar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { totalItems } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
    navigate(`/products?search=${encodeURIComponent(query)}`);
  };

  const addressText = address
    ? [address.address_line1, address.city, address.postal_code].filter(Boolean).join(", ")
    : "Add a delivery address";

  return (
    <>
      <header className="sticky top-0 z-40 safe-area-pt border-b border-border bg-background">
        <div className="flex items-center gap-2 px-4 pt-2">
          <button
            type="button"
            onClick={() => navigate("/customer-app/addresses")}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            aria-label="Change delivery address"
          >
            <MapPin className="h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="flex items-center gap-1 text-sm font-semibold leading-tight">
                {address ? `Deliver to ${address.label || "Home"}` : "Deliver to"}
                <ChevronDown className="h-4 w-4 shrink-0" />
              </span>
              <span className="block truncate text-xs text-muted-foreground">{addressText}</span>
            </span>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative shrink-0"
            onClick={() => setIsCartOpen(true)}
            aria-label={totalItems > 0 ? `Cart, ${totalItems} items` : "Cart"}
          >
            <ShoppingCart className="h-5 w-5" />
            {totalItems > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-primary px-1 text-[10px] font-semibold leading-[18px] text-primary-foreground text-center">
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
          </Button>
        </div>
        <form onSubmit={handleSearch} className="px-4 pb-3 pt-2" role="search">
          <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-muted/50 px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              type="search"
              enterKeyHint="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search products"
              aria-label="Search products"
              className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
        </form>
      </header>
      <CartSheet open={isCartOpen} onOpenChange={setIsCartOpen} />
    </>
  );
}
