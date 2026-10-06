import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMemberPricing } from "@/hooks/useMemberPricing";
import { useShippingSettings } from "@/hooks/useShippingSettings";
import { MobileAppLayout } from "@/components/mobile/MobileAppLayout";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { hapticTap } from "@/lib/haptics";

const formatRupees = (amount: number) => `₹${amount.toFixed(2)}`;

/**
 * Installed app's full-screen cart. Same cart state, prices, delivery charge
 * and checkout destination as the website's CartSheet — only the layout differs.
 */
export default function CartPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, loading, updateQuantity, removeFromCart, totalItems, totalPrice, memberTotalPrice } = useCart();
  const memberPricing = useMemberPricing();
  const { calculateShipping } = useShippingSettings();
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const displayTotalPrice = memberPricing ? memberTotalPrice : totalPrice;
  const shippingAmount = calculateShipping(displayTotalPrice);
  const cartTotal = displayTotalPrice + shippingAmount;

  const unitPrice = (item: (typeof items)[number]) =>
    memberPricing
      ? item.variant
        ? item.variant.member_price ?? item.variant.price
        : item.product.member_price ?? item.product.price
      : item.variant?.price ?? item.product.price;

  const changeQuantity = async (itemId: string, quantity: number) => {
    setBusyItemId(itemId);
    hapticTap();
    try {
      await updateQuantity(itemId, quantity);
    } finally {
      setBusyItemId(null);
    }
  };

  const remove = async (itemId: string) => {
    setBusyItemId(itemId);
    try {
      await removeFromCart(itemId);
    } finally {
      setBusyItemId(null);
    }
  };

  const handleCheckout = () => navigate(user ? "/checkout" : "/guest-checkout");

  return (
    <MobileAppLayout appType="customer">
      <div className="min-h-screen bg-muted/30">
        <MobileHeader title={totalItems > 0 ? `My Cart (${totalItems})` : "My Cart"} showBack />

        {loading && items.length === 0 ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-24 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <ShoppingBag className="h-10 w-10 text-primary" />
            </span>
            <div>
              <p className="text-lg font-bold">Your cart is empty</p>
              <p className="text-sm text-muted-foreground">Add groceries to see them here.</p>
            </div>
            <Button onClick={() => navigate("/customer-app")}>Start shopping</Button>
          </div>
        ) : (
          <>
            <div className="space-y-3 p-4">
              <div className="divide-y rounded-2xl border bg-card">
                {items.map((item) => {
                  const price = unitPrice(item);
                  const busy = busyItemId === item.id;
                  return (
                    <div key={item.id} className={`flex gap-3 p-3 ${busy ? "opacity-60" : ""}`}>
                      <OptimizedImage
                        src={item.product.images?.[0] || "/placeholder.svg"}
                        alt={item.product.name}
                        className="h-full w-full object-cover"
                        containerClassName="h-16 w-16 shrink-0 rounded-xl bg-muted"
                        displayWidth={64}
                        displayHeight={64}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold leading-snug">{item.product.name}</p>
                        {item.variant?.label && <p className="text-xs text-muted-foreground">{item.variant.label}</p>}
                        <p className="mt-0.5 text-xs text-muted-foreground">{formatRupees(price)} each</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="flex items-center rounded-lg bg-primary text-primary-foreground">
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center"
                              onClick={() => changeQuantity(item.id, item.quantity - 1)}
                              disabled={busy}
                              aria-label={`Decrease ${item.product.name}`}
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="w-7 text-center text-sm font-bold">{item.quantity}</span>
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center"
                              onClick={() => changeQuantity(item.id, item.quantity + 1)}
                              disabled={busy}
                              aria-label={`Increase ${item.product.name}`}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                          <span className="text-sm font-bold">{formatRupees(price * item.quantity)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="self-start p-1 text-muted-foreground"
                        onClick={() => remove(item.id)}
                        disabled={busy}
                        aria-label={`Remove ${item.product.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
                <p className="font-bold">Bill details</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Items total</span>
                  <span>{formatRupees(displayTotalPrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery</span>
                  {shippingAmount === 0 ? (
                    <span className="font-medium text-green-600">Free</span>
                  ) : (
                    <span>{formatRupees(shippingAmount)}</span>
                  )}
                </div>
                <div className="flex justify-between border-t pt-2 text-base font-bold">
                  <span>To pay</span>
                  <span>{formatRupees(cartTotal)}</span>
                </div>
                <p className="text-xs text-muted-foreground">Coupons and wallet can be applied at checkout.</p>
              </div>

              <button
                type="button"
                onClick={() => navigate("/customer-app")}
                className="w-full py-2 text-center text-sm font-semibold text-primary"
              >
                + Add more items
              </button>
            </div>

            {/* Space for the checkout bar */}
            <div aria-hidden className="h-20" />
            <div
              className="fixed left-0 right-0 z-40 border-t bg-background px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
              style={{ bottom: "calc(4rem + env(safe-area-inset-bottom, 0px))" }}
            >
              <Button className="h-12 w-full justify-between rounded-xl text-base" onClick={handleCheckout}>
                <span>{formatRupees(cartTotal)}</span>
                <span>Proceed to Checkout ›</span>
              </Button>
            </div>
          </>
        )}
      </div>
    </MobileAppLayout>
  );
}
