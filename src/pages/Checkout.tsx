import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCart } from "@/contexts/CartContext";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
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
import { MapPin, Plus, Package, Wallet, CreditCard, Ticket, X, Check } from "lucide-react";
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

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [wallet, setWallet] = useState<WalletData>({ balance: 0, withdrawable_balance: 0, purchase_only_balance: 0 });
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [useWallet, setUseWallet] = useState(true); // Default to using wallet
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState<Date | null>(null);
  const [selectedDeliverySlotId, setSelectedDeliverySlotId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!user) {
      navigate("/auth?redirect=/checkout");
      return;
    }
    if (items.length === 0) {
      navigate("/products");
      return;
    }
    fetchData();
  }, [user, items.length, navigate]);

  const fetchData = async () => {
    if (!user) return;

    setLoading(true);
    const [addressRes, walletRes] = await Promise.all([
      supabase.from("addresses").select("*").eq("user_id", user.id).order("is_default", { ascending: false }),
      supabase.from("wallets").select("balance, withdrawable_balance, purchase_only_balance").eq("user_id", user.id).maybeSingle(),
    ]);

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
    if (!user || !selectedAddressId) {
      toast({
        title: "Select Address",
        description: "Please select a delivery address.",
        variant: "destructive",
      });
      return;
    }

    const selectedAddress = addresses.find((a) => a.id === selectedAddressId);
    if (!selectedAddress) return;

    setPlacing(true);

    const discountAmount = calculateDiscount();
    
    // Calculate wallet usage: purchase-only first, then withdrawable
    const amountAfterDiscount = effectiveTotalPrice - discountAmount;
    const purchaseOnlyUsed = useWallet ? Math.min(wallet.purchase_only_balance, amountAfterDiscount) : 0;
    const remainingAfterPurchaseOnly = amountAfterDiscount - purchaseOnlyUsed;
    const withdrawableUsed = useWallet ? Math.min(wallet.withdrawable_balance, remainingAfterPurchaseOnly) : 0;
    const totalWalletUsed = purchaseOnlyUsed + withdrawableUsed;
    const finalAmount = amountAfterDiscount - totalWalletUsed;

    // Generate order number
    const orderNumber = `ELA${Date.now().toString().slice(-8)}`;

    // Create order with delivery scheduling
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        order_number: orderNumber,
        status: "pending",
        payment_status: "pending",
        subtotal: effectiveTotalPrice,
        shipping_amount: 0,
        discount_amount: discountAmount,
        wallet_amount_used: totalWalletUsed,
        total_amount: finalAmount,
        coupon_code: appliedCoupon?.code || null,
        preferred_delivery_date: selectedDeliveryDate ? format(selectedDeliveryDate, "yyyy-MM-dd") : null,
        preferred_delivery_slot_id: selectedDeliverySlotId,
        shipping_address: {
          full_name: selectedAddress.full_name,
          phone: selectedAddress.phone,
          address_line1: selectedAddress.address_line1,
          address_line2: selectedAddress.address_line2,
          city: selectedAddress.city,
          state: selectedAddress.state,
          postal_code: selectedAddress.postal_code,
          country: selectedAddress.country,
        },
      })
      .select()
      .single();

    if (orderError) {
      console.error("Order error:", orderError);
      toast({
        title: "Error",
        description: "Failed to place order. Please try again.",
        variant: "destructive",
      });
      setPlacing(false);
      return;
    }

    // Create order items with correct pricing based on member status
    const orderItems = items.map((item) => {
      const itemPrice = isMember 
        ? (item.product.member_price || item.product.price) 
        : item.product.price;
      return {
        order_id: order.id,
        product_id: item.product_id,
        product_name: item.product.name,
        product_price: itemPrice,
        quantity: item.quantity,
        total_price: itemPrice * item.quantity,
      };
    });

    const { error: itemsError } = await supabase.from("order_items").insert(orderItems);

    if (itemsError) {
      console.error("Order items error:", itemsError);
    }

    // Update coupon usage count
    if (appliedCoupon) {
      await supabase
        .from("coupons")
        .update({ usage_count: appliedCoupon.usage_count + 1 })
        .eq("id", appliedCoupon.id);
    }

    // Send order confirmation email
    try {
      await supabase.functions.invoke("send-order-confirmation", {
        body: { order_id: order.id },
      });
    } catch (emailError) {
      console.error("Failed to send confirmation email:", emailError);
    }

    // Clear cart
    await clearCart();

    toast({
      title: "Order Placed!",
      description: `Your order ${orderNumber} has been placed successfully.`,
    });

    navigate("/dashboard?tab=orders");
    setPlacing(false);
  };

  if (!user || items.length === 0) {
    return null;
  }

  const discountAmount = calculateDiscount();
  const purchaseOnlyBalance = wallet.purchase_only_balance;
  const withdrawableBalance = wallet.withdrawable_balance;
  const totalWalletBalance = wallet.balance;
  
  // Calculate wallet usage for display: purchase-only first, then withdrawable
  const amountAfterDiscount = effectiveTotalPrice - discountAmount;
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
            {/* Delivery Address */}
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

            {/* Delivery Scheduling */}
            <DeliveryScheduler
              selectedDate={selectedDeliveryDate}
              selectedSlotId={selectedDeliverySlotId}
              onDateChange={setSelectedDeliveryDate}
              onSlotChange={setSelectedDeliverySlotId}
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

                <div className="p-4 rounded-lg border border-primary bg-primary/5">
                  <div className="flex items-center gap-3">
                    <Package className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">Cash on Delivery</p>
                      <p className="text-sm text-muted-foreground">
                        Pay when your order arrives
                      </p>
                    </div>
                  </div>
                </div>
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
                        <p className="font-medium text-sm line-clamp-2">{item.product.name}</p>
                        <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                        <p className="text-sm font-semibold">
                          ₹{((isMember ? (item.product.member_price || item.product.price) : item.product.price) * item.quantity).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* Pricing */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>₹{effectiveTotalPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Shipping</span>
                    <span className="text-green-600">Free</span>
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
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handlePlaceOrder}
                  disabled={placing || !selectedAddressId}
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
