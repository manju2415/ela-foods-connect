import { useContext, useEffect, useState, ReactNode } from "react";
import { createSharedContext } from "@/lib/sharedContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface CartItemVariant {
  id: string;
  label: string;
  price: number;
  member_price: number | null;
  stock_quantity: number;
}

interface CartItemProduct {
  id: string;
  name: string;
  price: number;
  member_price: number | null;
  images: string[];
  stock_quantity?: number;
}

interface CartItem {
  id: string;
  product_id: string;
  quantity: number;
  variant_id?: string | null;
  variant?: CartItemVariant | null;
  product: CartItemProduct;
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
  addToCart: (productId: string, quantity?: number, variantId?: string | null) => Promise<boolean>;
  buyNow: (productId: string, quantity?: number, variantId?: string | null) => Promise<boolean>;
  updateQuantity: (itemId: string, quantity: number) => Promise<boolean>;
  removeFromCart: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  /** Re-reads the cart (incl. current stock) from the server. */
  refreshCart: () => Promise<void>;
  totalItems: number;
  totalPrice: number;
  memberTotalPrice: number;
}

// Shared across hot-reloaded copies of this module — see createSharedContext.
const CartContext = createSharedContext<CartContextType>("__ELA_CART_CONTEXT__");

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadGuestCart = async () => {
    const guestItems = readGuestCart();
    if (guestItems.length === 0) {
      setItems([]);
      return;
    }

    try {
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
          : Promise.resolve({ data: [] as CartItemVariant[] }),
      ]);

      const variants: CartItemVariant[] = variantsRes?.data || [];

      if (products) {
        const cartItems: CartItem[] = guestItems.map(gItem => {
          const product = products.find(p => p.id === gItem.product_id);
          const variant = gItem.variant_id ? variants.find((v) => v.id === gItem.variant_id) || null : null;
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

  // Guards against corrupted/incompatible localStorage data (e.g. left over from
  // a prior app version) throwing and permanently breaking the guest cart.
  const readGuestCart = (): GuestCartItem[] => {
    const raw = localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("Corrupted guest cart data, resetting:", e);
      localStorage.removeItem(GUEST_CART_KEY);
      return [];
    }
  };

  const mergeGuestCart = async () => {
    if (!user) return;

    const guestItems = readGuestCart();
    if (guestItems.length > 0) {
      try {
        // Add guest items to user's cart
        for (const gItem of guestItems) {
          const baseQuery = supabase
            .from("cart_items")
            .select("id, quantity")
            .eq("user_id", user.id)
            .eq("product_id", gItem.product_id);
          const existingQuery = gItem.variant_id
            ? baseQuery.eq("variant_id", gItem.variant_id)
            : baseQuery.is("variant_id", null);
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
            });
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
      `)
      .eq("user_id", user.id)
      .returns<
        {
          id: string;
          product_id: string;
          quantity: number;
          variant_id: string | null;
          product: CartItemProduct | null;
          variant: CartItemVariant | null;
        }[]
      >();

    if (error) {
      console.error("Error fetching cart:", error);
    } else {
      const transformedItems: CartItem[] = (data || [])
        .filter((item): item is typeof item & { product: CartItemProduct } => item.product !== null)
        .map((item) => ({
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

  // Store-pickup inventory (store_inventory) is a pool kept separate from a
  // product's central stock_quantity, and is only checked authoritatively at
  // checkout (place_order_atomic). This mirrors that check here so the cart's
  // central-stock guard doesn't block a quantity a pickup store can actually
  // fulfill — returns the largest stock held by any single store, since a
  // customer can only collect from one store.
  const fetchMaxStorePickupStock = async (productId: string): Promise<number> => {
    const { data } = await supabase
      .from("store_inventory")
      .select("stock_quantity")
      .eq("product_id", productId);
    return (data || []).reduce((max, row) => Math.max(max, row.stock_quantity ?? 0), 0);
  };

  const addToCart = async (productId: string, quantity = 1, variantId: string | null = null): Promise<boolean> => {
    const existingItem = items.find((item) => item.product_id === productId && (item.variant_id ?? null) === (variantId ?? null));
    const requestedQuantity = (existingItem?.quantity || 0) + quantity;
    let stock = variantId ? existingItem?.variant?.stock_quantity : existingItem?.product.stock_quantity;
    if (stock === undefined) {
      // Not in the cart yet, so its stock isn't loaded — read it, so an item
      // that is already sold out can't be added at all.
      const { data } = variantId
        ? await supabase.from("product_variants").select("stock_quantity").eq("id", variantId).maybeSingle()
        : await supabase.from("products").select("stock_quantity").eq("id", productId).maybeSingle();
      if (data?.stock_quantity != null) stock = data.stock_quantity;
    }
    if (stock !== undefined && requestedQuantity > stock) {
      // Central stock alone says no, but store-pickup inventory is tracked as
      // a separate pool (see admin Store Inventory) and can still cover this
      // — only block if no single pickup store has enough either. The final
      // fulfillment-specific check still happens server-side at checkout.
      const maxStorePickupStock = await fetchMaxStorePickupStock(productId);
      if (requestedQuantity > maxStorePickupStock) {
        toast(
          stock <= 0 && maxStorePickupStock <= 0
            ? { title: "Out of stock", description: "This item is not available at the moment.", variant: "destructive" }
            : { title: "Not enough stock", description: `Only ${Math.max(stock, maxStorePickupStock)} available.`, variant: "destructive" },
        );
        return false;
      }
    }
    if (user) {
      // Logged in user - use database
      if (existingItem) {
        return updateQuantity(existingItem.id, existingItem.quantity + quantity);
      } else {
        const { error } = await supabase.from("cart_items").insert({
          user_id: user.id,
          product_id: productId,
          quantity,
          variant_id: variantId,
        });

        if (error) {
          console.error("Error adding to cart:", error);
          toast({
            title: "Error",
            description: "Failed to add item to cart.",
            variant: "destructive",
          });
          return false;
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
      const guestItems = readGuestCart();

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

    return true;
  };

  const navigate = useNavigate();

  const buyNow = async (productId: string, quantity = 1, variantId: string | null = null): Promise<boolean> => {
    const wasAdded = await addToCart(productId, quantity, variantId);
    if (!wasAdded) return false;

    if (user) {
      navigate("/checkout");
    } else {
      navigate("/guest-checkout");
    }
    return true;
  };

  const updateQuantity = async (itemId: string, quantity: number): Promise<boolean> => {
    if (quantity <= 0) {
      await removeFromCart(itemId);
      return true;
    }
    const current = items.find((item) => item.id === itemId);
    const stock = current?.variant?.stock_quantity ?? current?.product.stock_quantity;
    if (stock !== undefined && quantity > stock) {
      const maxStorePickupStock = await fetchMaxStorePickupStock(current!.product_id);
      if (quantity > maxStorePickupStock) {
        toast({ title: "Not enough stock", description: `Only ${stock} available.`, variant: "destructive" });
        return false;
      }
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
        return false;
      } else {
        await fetchCart();
      }
    } else {
      // Guest user
      const guestItems = readGuestCart();
      const index = guestItems.findIndex(item => item.id === itemId);
      if (index >= 0) {
        guestItems[index].quantity = quantity;
        saveGuestCart(guestItems);
        await loadGuestCart();
      } else {
        return false;
      }
    }

    return true;
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
      const guestItems = readGuestCart().filter(item => item.id !== itemId);
      saveGuestCart(guestItems);
      await loadGuestCart();
      toast({
        title: "Removed",
        description: "Item has been removed from your cart.",
      });
    }
  };

  const refreshCart = async () => {
    if (user) await fetchCart();
    else await loadGuestCart();
  };

  const clearCart = async () => {
    if (user) {
      const { error } = await supabase
        .from("cart_items")
        .delete()
        .eq("user_id", user.id);

      if (error) {
        // The cart must not keep showing items the customer already
        // bought just because this cleanup delete failed — clear the
        // visible state regardless and log the DB inconsistency.
        console.error("Error clearing cart:", error);
      }
      setItems([]);
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
        refreshCart,
        totalItems,
        totalPrice,
        memberTotalPrice,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};
