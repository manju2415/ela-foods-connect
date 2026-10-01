import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { DeliveryScheduler } from "@/components/checkout/DeliveryScheduler";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Plus, Wallet, CreditCard, Ticket, X, Check, Store } from "lucide-react";
import { initiateRazorpayPayment, isPaymentCancelled, preloadRazorpayScript } from "@/utils/razorpay";
import { realEmailOrEmpty, validateEmail } from "@/lib/email";
import { PostOrderProducts } from "@/components/PostOrderProducts";

import { useShippingSettings } from "@/hooks/useShippingSettings";
import { useStorePickupStockMap } from "@/hooks/useStorePickupStock";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { format } from "date-fns";

interface Address {
  id: string;
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  label: string;
  is_default: boolean;
}

interface WalletData {
  balance: number;
  withdrawable_balance: number;
  purchase_only_balance: number;
}

interface Coupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  min_order_amount: number;
  max_discount_amount: number | null;
  usage_count: number;
  usage_limit: number | null;
  valid_until: string | null;
}

const Checkout = () => {
  const { user } = useAuth();
  const { items, totalPrice, memberTotalPrice, clearCart } = useCart();
  const { isMember } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Use member price for members, MRP for normal users
  const effectiveTotalPrice = isMember ? memberTotalPrice : totalPrice;
  const { calculateShipping } = useShippingSettings();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [wallet, setWallet] = useState<WalletData>({ balance: 0, withdrawable_balance: 0, purchase_only_balance: 0 });
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [useWallet, setUseWallet] = useState(true);
  const [paymentMethod] = useState<"online">("online");
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState<Date | null>(null);
  const [selectedDeliverySlotId, setSelectedDeliverySlotId] = useState<string | null>(null);
  const [hasDeliveryDate, setHasDeliveryDate] = useState(true);
  const [fulfillmentType, setFulfillmentType] = useState<"delivery" | "store_pickup">("delivery");
  const [pickupStoreId, setPickupStoreId] = useState<string | null>(null);
  const [pickupStores, setPickupStores] = useState<Tables<"stores">[]>([]);
  const [contactEmail, setContactEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [orderPlaced, setOrderPlaced] = useState<{ orderNumber: string; amount: number } | null>(null);

  // Store-pickup stock (store_inventory) is tracked separately from each
  // product's central stock_quantity, and the product listing/cart now
  // treats a product as available if either pool has stock — but Home
  // Delivery can only ever draw from the central pool. Cart items that are
  // only coverable by a pickup store's stock must not be allowed through on
  // Home Delivery, or the order would be rejected at the final step.
  const { data: storePickupStockMap } = useStorePickupStockMap(items.map((item) => item.product_id));
  const pickupOnlyItems = items.filter((item) => {
    const centralStock = item.variant?.stock_quantity ?? item.product.stock_quantity ?? 0;
    if (item.quantity <= centralStock) return false;
    const pickupStock = storePickupStockMap?.get(item.product_id) ?? 0;
    return item.quantity <= pickupStock;
  });


  const [newAddress, setNewAddress] = useState({
    full_name: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    postal_code: "",
    label: "Home",
  });

  // Start fetching Razorpay's script now so it is ready when Pay is tapped.
  useEffect(() => {
    preloadRazorpayScript();
  }, []);

  useEffect(() => {
    if (!user) {
      navigate("/auth?redirect=/checkout");
      return;
    }
    if (items.length === 0 && !orderPlaced) {
      navigate("/products");
      return;
    }
    if (!orderPlaced) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, items.length, navigate, orderPlaced]);

  // Placing an order swaps in the confirmation view in-page (no route change),
  // so the router-level scroll reset doesn't cover it — reset manually.
  useEffect(() => {
    if (orderPlaced) window.scrollTo(0, 0);
  }, [orderPlaced]);

  const fetchData = async () => {
    if (!user) return;

    setLoading(true);
    const [addressRes, walletRes, storesRes, profileRes] = await Promise.all([
      supabase.from("addresses").select("*").eq("user_id", user.id).order("is_default", { ascending: false }),
      supabase.from("wallets").select("balance, withdrawable_balance, purchase_only_balance").eq("user_id", user.id).maybeSingle(),
      supabase.from("stores").select("*").eq("is_active", true).order("display_order"),
      supabase.from("profiles").select("email").eq("id", user.id).maybeSingle(),
    ]);

    setContactEmail(realEmailOrEmpty(profileRes.data?.email) || realEmailOrEmpty(user.email));

    if (storesRes.data) setPickupStores(storesRes.data);


    if (addressRes.data) {
      setAddresses(addressRes.data);
      const defaultAddr = addressRes.data.find((a) => a.is_default);
      if (defaultAddr) {
        setSelectedAddressId(defaultAddr.id);
      } else if (addressRes.data.length > 0) {
        setSelectedAddressId(addressRes.data[0].id);
      }
    }

    if (walletRes.data) {
      setWallet({
        balance: walletRes.data.balance || 0,
        withdrawable_balance: walletRes.data.withdrawable_balance || 0,
        purchase_only_balance: walletRes.data.purchase_only_balance || 0,
      });
    }

    setLoading(false);
  };

  const handleAddAddress = async () => {
    if (!user) return;

    if (!newAddress.full_name || !newAddress.phone || !newAddress.address_line1 || 
        !newAddress.city || !newAddress.state || !newAddress.postal_code) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    if (!/^[6-9]\d{9}$/.test(newAddress.phone.replace(/\D/g, "")) || !/^\d{6}$/.test(newAddress.postal_code)) {
      toast({ title: "Invalid address", description: "Enter a valid 10-digit mobile number and 6-digit postal code.", variant: "destructive" });
      return;
    }

    const { data, error } = await supabase
      .from("addresses")
      .insert({
        user_id: user.id,
        full_name: newAddress.full_name,
        phone: newAddress.phone,
        address_line1: newAddress.address_line1,
        address_line2: newAddress.address_line2 || null,
        city: newAddress.city,
        state: newAddress.state,
        postal_code: newAddress.postal_code,
        label: newAddress.label,
        is_default: addresses.length === 0,
      })
      .select()
      .single();

    if (error) {
      toast({
        title: "Error",
        description: "Failed to add address.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Address Added",
        description: "Your address has been saved.",
      });
      setAddresses([...addresses, data]);
      setSelectedAddressId(data.id);
      setShowAddAddress(false);
      setNewAddress({
        full_name: "",
        phone: "",
        address_line1: "",
        address_line2: "",
        city: "",
        state: "",
        postal_code: "",
        label: "Home",
      });
    }
  };

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError("");

    const { data, error } = await supabase
      .from("coupons")
      .select("*")
      .eq("code", couponCode.toUpperCase())
      .eq("is_active", true)
      .maybeSingle();

    if (error || !data) {
      setCouponError("Invalid or expired coupon code");
      setCouponLoading(false);
      return;
    }

    if (data.min_order_amount && effectiveTotalPrice < data.min_order_amount) {
      setCouponError(`Minimum order amount is ₹${data.min_order_amount}`);
      setCouponLoading(false);
      return;
    }

    if (data.audience === "members" && !isMember) {
      setCouponError("This coupon is only for members");
      setCouponLoading(false);
      return;
    }

    if (data.audience === "non_members" && isMember) {
      setCouponError("This coupon is only for non-member customers");
      setCouponLoading(false);
      return;
    }

    if (data.first_order_only && user) {
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .neq("status", "cancelled");
      if ((count || 0) > 0) {
        setCouponError("This coupon is valid on your first order only");
        setCouponLoading(false);
        return;
      }
    }

    if (data.usage_limit && data.usage_count >= data.usage_limit) {
      setCouponError("Coupon usage limit reached");
      setCouponLoading(false);
      return;
    }


    if (data.valid_until && new Date(data.valid_until) < new Date()) {
      setCouponError("Coupon has expired");
      setCouponLoading(false);
      return;
    }

    setAppliedCoupon(data);
    setCouponLoading(false);
    toast({
      title: "Coupon Applied!",
      description: `Discount of ${data.discount_type === "percentage" ? data.discount_value + "%" : "₹" + data.discount_value} applied`,
    });
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError("");
  };

  const calculateDiscount = () => {
    if (!appliedCoupon) return 0;
    let discount = 0;
    if (appliedCoupon.discount_type === "percentage") {
      discount = (effectiveTotalPrice * appliedCoupon.discount_value) / 100;
    } else {
      discount = appliedCoupon.discount_value;
    }
    if (appliedCoupon.max_discount_amount) {
      discount = Math.min(discount, appliedCoupon.max_discount_amount);
    }
    return Math.min(discount, effectiveTotalPrice);
  };

  const handlePlaceOrder = async () => {
    if (fulfillmentType === "delivery" && pickupOnlyItems.length > 0) {
      toast({
        title: "Store pickup only",
        description: `${pickupOnlyItems.map((item) => item.product.name).join(", ")} ${pickupOnlyItems.length > 1 ? "are" : "is"} only available for store pickup right now. Switch to Store Pickup to order ${pickupOnlyItems.length > 1 ? "them" : "it"}.`,
        variant: "destructive",
      });
      return;
    }
    if (fulfillmentType === "delivery" && !selectedAddressId) {
      toast({ title: "Select Address", description: "Please select a delivery address.", variant: "destructive" });
      return;
    }
    if (fulfillmentType === "store_pickup" && !pickupStoreId) {
      toast({ title: "Select Store", description: "Please select a store for pickup.", variant: "destructive" });
      return;
    }
    if (!hasDeliveryDate) {
      toast({ title: "No delivery date", description: "No delivery date is available for all the items in your cart.", variant: "destructive" });
      return;
    }
    if (!user) return;

    let validEmail = "";
    if (finalAmount > 0) {
      const validated = validateEmail(contactEmail);
      if (!validated.value) {
        setEmailError(validated.error || "Please enter a valid email address");
        toast({ title: "Email Required", description: validated.error || "Please enter a valid email address for your receipt.", variant: "destructive" });
        return;
      }
      validEmail = validated.value;
      setEmailError(null);
      await supabase.from("profiles").update({ email: validEmail }).eq("id", user.id);
    }

    const selectedAddress = fulfillmentType === "delivery" ? addresses.find((address) => address.id === selectedAddressId) : null;
    const selectedStore = fulfillmentType === "store_pickup" ? pickupStores.find((store) => store.id === pickupStoreId) : null;
    const shippingAddress = selectedStore ? {
      full_name: "Store Pickup", phone: selectedStore.phone || "", address_line1: selectedStore.address_line1,
      address_line2: selectedStore.address_line2, city: selectedStore.city, state: selectedStore.state,
      postal_code: selectedStore.postal_code, country: "India", email: validEmail,
    } : selectedAddress ? { ...selectedAddress, email: validEmail } : {};

    setPlacing(true);
    const idempotencyKey = crypto.randomUUID();
    const { data, error } = await supabase.rpc("place_order_atomic", {
      p_user_id: user.id,
      p_items: items.map((item) => ({ product_id: item.product_id, variant_id: item.variant_id || null, quantity: item.quantity })),
      p_shipping_address: shippingAddress,
      p_fulfillment_type: fulfillmentType,
      p_pickup_store_id: fulfillmentType === "store_pickup" ? pickupStoreId : null,
      p_coupon_code: appliedCoupon?.code || null,
      p_use_wallet: useWallet,
      p_payment_method: paymentMethod,
      p_preferred_delivery_date: selectedDeliveryDate ? format(selectedDeliveryDate, "yyyy-MM-dd") : null,
      p_preferred_delivery_slot_id: selectedDeliverySlotId,
      p_idempotency_key: idempotencyKey,
    });
    const result = data as {
      success: boolean;
      error?: string;
      code?: string;
      order_id?: string;
      order_number?: string;
      total_amount?: number;
    } | null;
    if (error || !result?.success) {
      toast({ title: result?.code === "OUT_OF_STOCK" ? "Stock changed" : "Order failed", description: result?.error || error?.message || "Please try again.", variant: "destructive" });
      await fetchData();
      setPlacing(false);
      return;
    }

    const finishOrder = async (title: string) => {
      try { await supabase.functions.invoke("send-order-confirmation", { body: { order_id: result.order_id } }); } catch (emailError) { console.error("Confirmation email error:", emailError); }
      await clearCart();
      toast({ title, description: `Order ${result.order_number} placed successfully.` });
      setOrderPlaced({ orderNumber: result.order_number, amount: Number(result.total_amount) });
      setPlacing(false);
    };

    if (Number(result.total_amount) > 0) {
      try {
        await initiateRazorpayPayment({
          amount: Number(result.total_amount), receipt: result.order_number,
          notes: { description: `Order ${result.order_number}`, order_id: result.order_id }, orderId: result.order_id,
          prefill: { name: selectedAddress?.full_name || user.user_metadata?.full_name || "", contact: selectedAddress?.phone || user.phone || "", email: validEmail },
          onSuccess: async () => { await finishOrder("Payment Successful!"); },
          onFailure: async (paymentError) => {
            console.error("Payment failed:", paymentError);
            await supabase.from("orders").update({ status: "cancelled", payment_status: "failed" }).eq("id", result.order_id);
            if (isPaymentCancelled(paymentError)) {
              toast({ title: "Payment cancelled", description: "The order was cancelled and reserved stock was restored." });
            } else {
              toast({ title: "Payment Failed", description: "The order was cancelled and reserved stock was restored.", variant: "destructive" });
            }
            setPlacing(false);
          },
        });
      } catch (paymentError) {
        await supabase.from("orders").update({ status: "cancelled", payment_status: "failed" }).eq("id", result.order_id);
        toast({ title: "Payment Failed", description: "The order was cancelled and reserved stock was restored.", variant: "destructive" });
        setPlacing(false);
      }
      return;
    }
    await finishOrder("Order Placed!");
  };

  if (!user) {
    return null;
  }

  if (orderPlaced) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 space-y-10">
          <div className="max-w-lg mx-auto text-center space-y-6">
            <div className="mx-auto w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Check className="h-10 w-10 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Order Placed!</h2>
              <p className="text-muted-foreground mt-2">Thank you for shopping with us.</p>
            </div>
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="flex justify-between"><span className="text-muted-foreground">Order ID</span><span className="font-mono font-semibold">{orderPlaced.orderNumber}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold text-primary">₹{orderPlaced.amount.toFixed(2)}</span></div>
              </CardContent>
            </Card>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button onClick={() => navigate("/dashboard?tab=orders")}>View My Orders</Button>
              <Button variant="outline" onClick={() => navigate("/products")}>Continue Shopping</Button>
            </div>
          </div>
          <div className="max-w-5xl mx-auto px-1">
            <PostOrderProducts />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (items.length === 0) {
    return null;
  }

  const discountAmount = calculateDiscount();
  const shippingAmountDisplay = calculateShipping(effectiveTotalPrice, fulfillmentType);
  const purchaseOnlyBalance = wallet.purchase_only_balance;
  const withdrawableBalance = wallet.withdrawable_balance;
  const totalWalletBalance = wallet.balance;
  
  // Calculate wallet usage for display: purchase-only first, then withdrawable
  const amountAfterDiscount = effectiveTotalPrice - discountAmount + shippingAmountDisplay;
  const purchaseOnlyUsed = useWallet ? Math.min(purchaseOnlyBalance, amountAfterDiscount) : 0;
  const remainingAfterPurchaseOnly = amountAfterDiscount - purchaseOnlyUsed;
  const withdrawableUsed = useWallet ? Math.min(withdrawableBalance, remainingAfterPurchaseOnly) : 0;
  const totalWalletUsed = purchaseOnlyUsed + withdrawableUsed;
  const finalAmount = amountAfterDiscount - totalWalletUsed;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-foreground mb-8">Checkout</h1>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Address & Payment */}
          <div className="lg:col-span-2 space-y-6">
            {/* Fulfillment Type Toggle */}
            {pickupStores.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Store className="h-5 w-5" />
                    Fulfillment Type
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <RadioGroup
                    value={fulfillmentType}
                    onValueChange={(v) => {
                      setFulfillmentType(v as "delivery" | "store_pickup");
                      if (v === "delivery") setPickupStoreId(null);
                    }}
                    className="grid grid-cols-2 gap-4"
                  >
                    <div className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${fulfillmentType === "delivery" ? "border-primary bg-primary/5" : "border-border"}`}>
                      <RadioGroupItem value="delivery" id="delivery" />
                      <label htmlFor="delivery" className="cursor-pointer">
                        <p className="font-medium">Home Delivery</p>
                        <p className="text-sm text-muted-foreground">Delivered to your address</p>
                      </label>
                    </div>
                    <div className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${fulfillmentType === "store_pickup" ? "border-primary bg-primary/5" : "border-border"}`}>
                      <RadioGroupItem value="store_pickup" id="store_pickup" />
                      <label htmlFor="store_pickup" className="cursor-pointer">
                        <p className="font-medium">Store Pickup</p>
                        <p className="text-sm text-muted-foreground">Pick up from a store</p>
                      </label>
                    </div>
                  </RadioGroup>

                  {fulfillmentType === "store_pickup" && (
                    <div className="mt-4 space-y-3">
                      <Label className="text-sm font-medium">Select Store</Label>
                      <RadioGroup value={pickupStoreId || ""} onValueChange={setPickupStoreId}>
                        {pickupStores.map((s) => (
                          <div
                            key={s.id}
                            className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${pickupStoreId === s.id ? "border-primary bg-primary/5" : "border-border"}`}
                          >
                            <RadioGroupItem value={s.id} id={s.id} className="mt-1" />
                            <label htmlFor={s.id} className="flex-1 cursor-pointer">
                              <p className="font-semibold">{s.name}</p>
                              <p className="text-sm text-muted-foreground">{s.address_line1}, {s.city}, {s.state}</p>
                              {s.opening_time && s.closing_time && (
                                <p className="text-xs text-muted-foreground mt-1">Hours: {s.opening_time.slice(0, 5)} - {s.closing_time.slice(0, 5)}</p>
                              )}
                            </label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>
                  )}

                  {fulfillmentType === "delivery" && pickupOnlyItems.length > 0 && (
                    <p className="mt-4 text-sm text-destructive">
                      {pickupOnlyItems.map((item) => item.product.name).join(", ")}{" "}
                      {pickupOnlyItems.length > 1 ? "are" : "is"} only available for store pickup right now —
                      switch to Store Pickup above to order {pickupOnlyItems.length > 1 ? "them" : "it"}.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Delivery Address - only shown for home delivery */}
            {fulfillmentType === "delivery" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Delivery Address
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : addresses.length === 0 ? (
                  <div className="text-center py-6">
                    <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">No addresses saved</p>
                    <Dialog open={showAddAddress} onOpenChange={setShowAddAddress}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Address
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Add New Address</DialogTitle>
                        </DialogHeader>
                        <AddressForm
                          address={newAddress}
                          onChange={setNewAddress}
                          onSave={handleAddAddress}
                        />
                      </DialogContent>
                    </Dialog>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <RadioGroup value={selectedAddressId} onValueChange={setSelectedAddressId}>
                      {addresses.map((address) => (
                        <div
                          key={address.id}
                          className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
                            selectedAddressId === address.id
                              ? "border-primary bg-primary/5"
                              : "border-border"
                          }`}
                        >
                          <RadioGroupItem value={address.id} id={address.id} className="mt-1" />
                          <label htmlFor={address.id} className="flex-1 cursor-pointer">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold">{address.full_name}</span>
                              <span className="text-xs bg-muted px-2 py-0.5 rounded">
                                {address.label}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {address.address_line1}
                              {address.address_line2 && `, ${address.address_line2}`}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {address.city}, {address.state} {address.postal_code}
                            </p>
                            <p className="text-sm text-muted-foreground">Phone: {address.phone}</p>
                          </label>
                        </div>
                      ))}
                    </RadioGroup>

                    <Dialog open={showAddAddress} onOpenChange={setShowAddAddress}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full">
                          <Plus className="h-4 w-4 mr-2" />
                          Add New Address
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Add New Address</DialogTitle>
                        </DialogHeader>
                        <AddressForm
                          address={newAddress}
                          onChange={setNewAddress}
                          onSave={handleAddAddress}
                        />
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
              </CardContent>
            </Card>
            )}

            {/* Delivery Scheduling */}
            <DeliveryScheduler
              selectedDate={selectedDeliveryDate}
              selectedSlotId={selectedDeliverySlotId}
              onDateChange={setSelectedDeliveryDate}
              onSlotChange={setSelectedDeliverySlotId}
              productIds={items.map((item) => item.product_id)}
              onAvailabilityChange={setHasDeliveryDate}
            />

            {/* Payment Options */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment Method
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {totalWalletBalance > 0 && (
                  <div
                    className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                      useWallet ? "border-primary bg-primary/5" : "border-border"
                    }`}
                    onClick={() => setUseWallet(!useWallet)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Wallet className="h-5 w-5 text-primary" />
                        <p className="font-medium">Use Wallet Balance</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={useWallet}
                        onChange={() => {}}
                        className="h-5 w-5 accent-primary"
                      />
                    </div>
                    <div className="ml-8 space-y-1 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Purchase Credits:</span>
                        <span className="text-foreground">₹{purchaseOnlyBalance.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Withdrawable Balance:</span>
                        <span className="text-foreground">₹{withdrawableBalance.toFixed(2)}</span>
                      </div>
                      {useWallet && totalWalletUsed > 0 && (
                        <div className="flex justify-between font-medium text-primary pt-1 border-t">
                          <span>Will use:</span>
                          <span>-₹{totalWalletUsed.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Online Payment */}
                <div className="p-4 rounded-lg border border-primary bg-primary/5">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">Pay Online (Razorpay)</p>
                      <p className="text-sm text-muted-foreground">
                        UPI, Credit/Debit Card, Net Banking, Wallets
                      </p>
                    </div>
                    <Check className="h-5 w-5 text-primary ml-auto" />
                  </div>
                </div>

                {finalAmount > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="paymentEmail">Email Address</Label>
                    <Input
                      id="paymentEmail"
                      type="email"
                      inputMode="email"
                      placeholder="you@example.com"
                      value={contactEmail}
                      onChange={(e) => {
                        setContactEmail(e.target.value);
                        if (emailError) setEmailError(null);
                      }}
                      maxLength={255}
                      className={emailError ? "border-destructive" : ""}
                    />
                    {emailError ? (
                      <p className="text-sm text-destructive">{emailError}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Your payment receipt will be sent to this email.
                      </p>
                    )}
                  </div>
                )}

              </CardContent>
            </Card>

            {/* Coupon Code */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ticket className="h-5 w-5" />
                  Promo Code
                </CardTitle>
              </CardHeader>
              <CardContent>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="font-mono font-semibold">{appliedCoupon.code}</span>
                      <span className="text-sm text-green-600">
                        -{appliedCoupon.discount_type === "percentage" 
                          ? `${appliedCoupon.discount_value}%` 
                          : `₹${appliedCoupon.discount_value}`}
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={removeCoupon}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter promo code"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                        className="font-mono"
                      />
                      <Button onClick={applyCoupon} disabled={couponLoading || !couponCode.trim()}>
                        {couponLoading ? "..." : "Apply"}
                      </Button>
                    </div>
                    {couponError && (
                      <p className="text-sm text-destructive">{couponError}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Order Summary */}
          <div>
            <Card className="sticky top-24">
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Items */}
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {items.map((item) => (
                    <div key={item.id} className="flex gap-3">
                      <img
                        src={item.product.images?.[0] || "/placeholder.svg"}
                        alt={item.product.name}
                        className="w-16 h-16 object-cover rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm line-clamp-2">
                          {item.product.name}{item.variant?.label ? ` — ${item.variant.label}` : ""}
                        </p>
                        <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                        <p className="text-sm font-semibold">
                          ₹{((isMember
                            ? (item.variant ? (item.variant.member_price ?? item.variant.price) : (item.product.member_price || item.product.price))
                            : (item.variant?.price ?? item.product.price)) * item.quantity).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* Pricing */}
                <div className="space-y-2">
                {(() => {
                  const discountAmount = calculateDiscount();
                  const shippingAmount = calculateShipping(effectiveTotalPrice, fulfillmentType);
                  const amountAfterDiscount = effectiveTotalPrice - discountAmount + shippingAmount;
                  const purchaseOnlyUsed = useWallet ? Math.min(wallet.purchase_only_balance, amountAfterDiscount) : 0;
                  const remainingAfterPurchaseOnly = amountAfterDiscount - purchaseOnlyUsed;
                  const withdrawableUsed = useWallet ? Math.min(wallet.withdrawable_balance, remainingAfterPurchaseOnly) : 0;
                  const totalWalletUsed = purchaseOnlyUsed + withdrawableUsed;
                  const finalAmount = amountAfterDiscount - totalWalletUsed;

                  return (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span>₹{effectiveTotalPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Delivery</span>
                        {shippingAmount === 0 ? (
                          <span className="text-green-600">Free</span>
                        ) : (
                          <span>₹{shippingAmount.toFixed(2)}</span>
                        )}
                      </div>
                      {discountAmount > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span>Coupon Discount</span>
                          <span>-₹{discountAmount.toFixed(2)}</span>
                        </div>
                      )}
                      {totalWalletUsed > 0 && (
                        <>
                          {purchaseOnlyUsed > 0 && (
                            <div className="flex justify-between text-sm text-green-600">
                              <span>Purchase Credits Used</span>
                              <span>-₹{purchaseOnlyUsed.toFixed(2)}</span>
                            </div>
                          )}
                          {withdrawableUsed > 0 && (
                            <div className="flex justify-between text-sm text-green-600">
                              <span>Wallet Balance Used</span>
                              <span>-₹{withdrawableUsed.toFixed(2)}</span>
                            </div>
                          )}
                        </>
                      )}
                      <Separator />
                      <div className="flex justify-between font-semibold text-lg">
                        <span>Total</span>
                        <span className="text-primary">₹{finalAmount.toFixed(2)}</span>
                      </div>
                    </>
                  );
                })()}
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handlePlaceOrder}
                  disabled={
                    placing ||
                    !hasDeliveryDate ||
                    (fulfillmentType === "delivery"
                      ? !selectedAddressId || pickupOnlyItems.length > 0
                      : !pickupStoreId)
                  }
                >
                  {placing ? "Placing Order..." : "Place Order"}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  By placing this order, you agree to our Terms & Conditions
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

interface AddressFormProps {
  address: {
    full_name: string;
    phone: string;
    address_line1: string;
    address_line2: string;
    city: string;
    state: string;
    postal_code: string;
    label: string;
  };
  onChange: (address: AddressFormProps["address"]) => void;
  onSave: () => void;
}

const AddressForm = ({ address, onChange, onSave }: AddressFormProps) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="full_name">Full Name *</Label>
          <Input
            id="full_name"
            value={address.full_name}
            onChange={(e) => onChange({ ...address, full_name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone *</Label>
          <Input
            id="phone"
            value={address.phone}
            onChange={(e) => onChange({ ...address, phone: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address_line1">Address Line 1 *</Label>
        <Input
          id="address_line1"
          value={address.address_line1}
          onChange={(e) => onChange({ ...address, address_line1: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="address_line2">Address Line 2</Label>
        <Input
          id="address_line2"
          value={address.address_line2}
          onChange={(e) => onChange({ ...address, address_line2: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="city">City *</Label>
          <Input
            id="city"
            value={address.city}
            onChange={(e) => onChange({ ...address, city: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="state">State *</Label>
          <Input
            id="state"
            value={address.state}
            onChange={(e) => onChange({ ...address, state: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="postal_code">Postal Code *</Label>
          <Input
            id="postal_code"
            value={address.postal_code}
            onChange={(e) => onChange({ ...address, postal_code: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="label">Label</Label>
          <Input
            id="label"
            value={address.label}
            onChange={(e) => onChange({ ...address, label: e.target.value })}
            placeholder="Home, Office, etc."
          />
        </div>
      </div>

      <Button className="w-full" onClick={onSave}>
        Save Address
      </Button>
    </div>
  );
};

export default Checkout;
