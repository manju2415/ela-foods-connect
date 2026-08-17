import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface CartItem {
  id: string;
  product_id: string;
  quantity: number;
  variant_id?: string | null;
  variant?: {
    id: string;
    label: string;
    price: number;
    member_price: number | null;
    stock_quantity: number;
  } | null;
  product: {
    id: string;
    name: string;
    price: number;
    member_price: number | null;
    images: string[];
    stock_quantity?: number;
  };
}

interface GuestCartItem {
  id: string;
  product_id: string;
  quantity: number;
  variant_id?: string | null;
}

interface CartContextType {
  items: CartItem[];
  loading: boolean;
  addToCart: (productId: string, quantity?: number, variantId?: string | null) => Promise<void>;
  buyNow: (productId: string, quantity?: number, variantId?: string | null) => Promise<void>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeFromCart: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  totalItems: number;
  totalPrice: number;
  memberTotalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const GUEST_CART_KEY = "ela_guest_cart";

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
};

export const CartProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      // Merge guest cart with user cart on login
      mergeGuestCart();
    } else {
      // Load guest cart from localStorage
      loadGuestCart();
    }
  }, [user]);

  const loadGuestCart = async () => {
    const guestCartJson = localStorage.getItem(GUEST_CART_KEY);
    if (!guestCartJson) {
      setItems([]);
      return;
    }

    try {
      const guestItems: GuestCartItem[] = JSON.parse(guestCartJson);
      if (guestItems.length === 0) {
        setItems([]);
        return;
      }

      // Fetch product details for guest cart items
      const productIds = guestItems.map(item => item.product_id);
      const variantIds = guestItems.map(item => item.variant_id).filter(Boolean) as string[];

      const [{ data: products }, variantsRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, price, member_price, images, stock_quantity")
          .in("id", productIds),
        variantIds.length
          ? supabase
              .from("product_variants")
              .select("id, label, price, member_price, stock_quantity")
              .in("id", variantIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const variants = (variantsRes as any)?.data || [];

      if (products) {
        const cartItems: CartItem[] = guestItems.map(gItem => {
          const product = products.find(p => p.id === gItem.product_id);
          const variant = gItem.variant_id ? variants.find((v: any) => v.id === gItem.variant_id) || null : null;
          return {
            id: gItem.id,
            product_id: gItem.product_id,
            quantity: gItem.quantity,
            variant_id: gItem.variant_id ?? null,
            variant,
            product: product || { id: gItem.product_id, name: "Product", price: 0, member_price: null, images: [] },
          };
        }).filter(item => item.product);
        setItems(cartItems);
      }
    } catch (e) {
      console.error("Error loading guest cart:", e);
      setItems([]);
    }
  };

  const saveGuestCart = (guestItems: GuestCartItem[]) => {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(guestItems));
  };

  const mergeGuestCart = async () => {
    if (!user) return;

    const guestCartJson = localStorage.getItem(GUEST_CART_KEY);
    if (guestCartJson) {
      try {
        const guestItems: GuestCartItem[] = JSON.parse(guestCartJson);
        
        // Add guest items to user's cart
        for (const gItem of guestItems) {
          let existingQuery = supabase
            .from("cart_items")
            .select("id, quantity")
            .eq("user_id", user.id)
            .eq("product_id", gItem.product_id);
          existingQuery = gItem.variant_id
            ? existingQuery.eq("variant_id", gItem.variant_id)
            : (existingQuery as any).is("variant_id", null);
          const { data: existing } = await existingQuery.maybeSingle();

          if (existing) {
            await supabase
              .from("cart_items")
              .update({ quantity: existing.quantity + gItem.quantity })
              .eq("id", existing.id);
          } else {
            await supabase.from("cart_items").insert({
              user_id: user.id,
              product_id: gItem.product_id,
              quantity: gItem.quantity,
              variant_id: gItem.variant_id ?? null,
            } as any);
          }
        }

        // Clear guest cart after merge
        localStorage.removeItem(GUEST_CART_KEY);
      } catch (e) {
        console.error("Error merging guest cart:", e);
      }
    }

    await fetchCart();
  };

  const fetchCart = async () => {
    if (!user) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from("cart_items")
      .select(`
        id,
        product_id,
        quantity,
        variant_id,
        product:products (
          id,
          name,
          price,
          member_price,
          images,
          stock_quantity
        ),
        variant:product_variants (
          id,
          label,
          price,
          member_price,
          stock_quantity
        )
      ` as any)
      .eq("user_id", user.id);

    if (error) {
      console.error("Error fetching cart:", error);
    } else {
      const transformedItems = ((data as any[]) || []).map((item: any) => ({
        id: item.id,
        product_id: item.product_id,
        quantity: item.quantity,
        variant_id: item.variant_id,
        variant: item.variant || null,
        product: item.product,
      }));
      setItems(transformedItems);
    }
    setLoading(false);
  };

  const addToCart = async (productId: string, quantity = 1, variantId: string | null = null) => {
    const existingItem = items.find((item) => item.product_id === productId && (item.variant_id ?? null) === (variantId ?? null));
    const requestedQuantity = (existingItem?.quantity || 0) + quantity;
    const stock = variantId ? existingItem?.variant?.stock_quantity : existingItem?.product.stock_quantity;
    if (stock !== undefined && requestedQuantity > stock) {
      toast({ title: "Not enough stock", description: `Only ${stock} available.`, variant: "destructive" });
      return;
    }
    if (user) {
      // Logged in user - use database
      if (existingItem) {
        await updateQuantity(existingItem.id, existingItem.quantity + quantity);
      } else {
        const { error } = await supabase.from("cart_items").insert({
          user_id: user.id,
          product_id: productId,
          quantity,
          variant_id: variantId,
        } as any);

        if (error) {
          console.error("Error adding to cart:", error);
          toast({
            title: "Error",
            description: "Failed to add item to cart.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Added to Cart",
            description: "Item has been added to your cart.",
          });
          await fetchCart();
        }
      }
    } else {
      // Guest user - use localStorage
      const guestCartJson = localStorage.getItem(GUEST_CART_KEY);
      let guestItems: GuestCartItem[] = guestCartJson ? JSON.parse(guestCartJson) : [];
      
      const existingIndex = guestItems.findIndex(item => item.product_id === productId && (item.variant_id ?? null) === (variantId ?? null));
      
      if (existingIndex >= 0) {
        guestItems[existingIndex].quantity += quantity;
      } else {
        guestItems.push({
          id: `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          product_id: productId,
          quantity,
          variant_id: variantId,
        });
      }
      
      saveGuestCart(guestItems);
      await loadGuestCart();
      
      toast({
        title: "Added to Cart",
        description: "Item has been added to your cart.",
      });
    }
  };

  const navigate = useNavigate();

  const buyNow = async (productId: string, quantity = 1, variantId: string | null = null) => {
    await addToCart(productId, quantity, variantId);
    if (user) {
      navigate("/checkout");
    } else {
      navigate("/guest-checkout");
    }
  };

  const updateQuantity = async (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      await removeFromCart(itemId);
      return;
    }
    const current = items.find((item) => item.id === itemId);
    const stock = current?.variant?.stock_quantity ?? current?.product.stock_quantity;
    if (stock !== undefined && quantity > stock) {
      toast({ title: "Not enough stock", description: `Only ${stock} available.`, variant: "destructive" });
      return;
    }

    if (user) {
      const { error } = await supabase
        .from("cart_items")
        .update({ quantity })
        .eq("id", itemId)
        .eq("user_id", user.id);

      if (error) {
        console.error("Error updating quantity:", error);
        toast({
          title: "Error",
          description: "Failed to update quantity.",
          variant: "destructive",
        });
      } else {
        await fetchCart();
      }
    } else {
      // Guest user
      const guestCartJson = localStorage.getItem(GUEST_CART_KEY);
      if (guestCartJson) {
        let guestItems: GuestCartItem[] = JSON.parse(guestCartJson);
        const index = guestItems.findIndex(item => item.id === itemId);
        if (index >= 0) {
          guestItems[index].quantity = quantity;
          saveGuestCart(guestItems);
          await loadGuestCart();
        }
      }
    }
  };

  const removeFromCart = async (itemId: string) => {
    if (user) {
      const { error } = await supabase
        .from("cart_items")
        .delete()
        .eq("id", itemId)
        .eq("user_id", user.id);

      if (error) {
        console.error("Error removing from cart:", error);
        toast({
          title: "Error",
          description: "Failed to remove item.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Removed",
          description: "Item has been removed from your cart.",
        });
        await fetchCart();
      }
    } else {
      // Guest user
      const guestCartJson = localStorage.getItem(GUEST_CART_KEY);
      if (guestCartJson) {
        let guestItems: GuestCartItem[] = JSON.parse(guestCartJson);
        guestItems = guestItems.filter(item => item.id !== itemId);
        saveGuestCart(guestItems);
        await loadGuestCart();
        toast({
          title: "Removed",
          description: "Item has been removed from your cart.",
        });
      }
    }
  };

  const clearCart = async () => {
    if (user) {
      const { error } = await supabase
        .from("cart_items")
        .delete()
        .eq("user_id", user.id);

      if (error) {
        console.error("Error clearing cart:", error);
      } else {
        setItems([]);
      }
    } else {
      localStorage.removeItem(GUEST_CART_KEY);
      setItems([]);
    }
  };

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce(
    (sum, item) => sum + (item.variant?.price ?? item.product.price) * item.quantity,
    0
  );
  const memberTotalPrice = items.reduce(
    (sum, item) => sum + ((item.variant ? (item.variant.member_price ?? item.variant.price) : (item.product.member_price ?? item.product.price)) * item.quantity),
    0
  );

  return (
    <CartContext.Provider
      value={{
        items,
        loading,
        addToCart,
        buyNow,
        updateQuantity,
        removeFromCart,
        clearCart,
        totalItems,
        totalPrice,
        memberTotalPrice,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};
