import { useContext, useState, useEffect, ReactNode } from "react";
import { createSharedContext } from "@/lib/sharedContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface WishlistItem {
  id: string;
  product_id: string;
}

interface WishlistContextType {
  wishlistItems: WishlistItem[];
  isInWishlist: (productId: string) => boolean;
  toggleWishlist: (productId: string) => Promise<void>;
  loading: boolean;
}

// Shared across hot-reloaded copies of this module — see createSharedContext.
const WishlistContext = createSharedContext<WishlistContextType>("__ELA_WISHLIST_CONTEXT__");

export const useWishlist = () => {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error("useWishlist must be used within a WishlistProvider");
  }
  return context;
};

export const WishlistProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchWishlist();
    } else {
      setWishlistItems([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchWishlist = async () => {
    if (!user) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from("wishlist")
      .select("id, product_id")
      .eq("user_id", user.id);

    if (!error && data) {
      setWishlistItems(data);
    }
    setLoading(false);
  };

  const isInWishlist = (productId: string) => {
    return wishlistItems.some((item) => item.product_id === productId);
  };

  const toggleWishlist = async (productId: string) => {
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to save items to your wishlist.",
        variant: "destructive",
      });
      return;
    }

    const existingItem = wishlistItems.find((item) => item.product_id === productId);

    if (existingItem) {
      // Remove from wishlist
      const { error } = await supabase
        .from("wishlist")
        .delete()
        .eq("id", existingItem.id);

      if (!error) {
        setWishlistItems((prev) => prev.filter((item) => item.id !== existingItem.id));
        toast({
          title: "Removed from wishlist",
          description: "Product has been removed from your wishlist.",
        });
      } else {
        console.error("Failed to remove from wishlist:", error);
        toast({
          title: "Couldn't remove from wishlist",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    } else {
      // Add to wishlist
      const { data, error } = await supabase
        .from("wishlist")
        .insert({ user_id: user.id, product_id: productId })
        .select("id, product_id")
        .single();

      if (!error && data) {
        setWishlistItems((prev) => [...prev, data]);
        toast({
          title: "Added to wishlist",
          description: "Product has been added to your wishlist.",
        });
      } else {
        console.error("Failed to add to wishlist:", error);
        toast({
          title: "Couldn't add to wishlist",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <WishlistContext.Provider value={{ wishlistItems, isInWishlist, toggleWishlist, loading }}>
      {children}
    </WishlistContext.Provider>
  );
};
