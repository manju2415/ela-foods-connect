import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Package, CreditCard, Ticket, X, Check, ShoppingCart, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface GuestCartItem {
  product_id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    price: number;
    member_price: number | null;
    images: string[];
    slug: string;
  };
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

const GuestCheckout = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [guestCart, setGuestCart] = useState<GuestCartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");

  const [guestDetails, setGuestDetails] = useState({
    full_name: "",
    email: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    postal_code: "",
  });

  useEffect(() => {
    // If user is logged in, redirect to regular checkout
    if (user) {
      navigate("/checkout");
      return;
    }
    loadGuestCart();
  }, [user, navigate]);

  const loadGuestCart = async () => {
    setLoading(true);
    const storedCart = localStorage.getItem("guest_cart");
    if (!storedCart) {
      setLoading(false);
      return;
    }

    try {
      const cartItems: { product_id: string; quantity: number }[] = JSON.parse(storedCart);
      if (cartItems.length === 0) {
        setLoading(false);
        return;
      }

      const productIds = cartItems.map(item => item.product_id);
      const { data: products } = await supabase
        .from("products")
        .select("id, name, price, member_price, images, slug")
        .in("id", productIds);

      if (products) {
        const enrichedCart = cartItems.map(item => {
          const product = products.find(p => p.id === item.product_id);
          return product ? {
            product_id: item.product_id,
            quantity: item.quantity,
            product
          } : null;
        }).filter(Boolean) as GuestCartItem[];
        setGuestCart(enrichedCart);
      }
    } catch (error) {
      console.error("Error loading guest cart:", error);
    }
    setLoading(false);
  };

  const totalPrice = guestCart.reduce((sum, item) => {
    // Guest users pay MRP (regular price), not member price
    return sum + (item.product.price * item.quantity);
  }, 0);

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

    if (data.min_order_amount && totalPrice < data.min_order_amount) {
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
      discount = (totalPrice * appliedCoupon.discount_value) / 100;
    } else {
      discount = appliedCoupon.discount_value;
    }
    if (appliedCoupon.max_discount_amount) {
      discount = Math.min(discount, appliedCoupon.max_discount_amount);
    }
    return Math.min(discount, totalPrice);
  };

  const handlePlaceOrder = async () => {
    if (!guestDetails.full_name || !guestDetails.email || !guestDetails.phone ||
        !guestDetails.address_line1 || !guestDetails.city || !guestDetails.state || !guestDetails.postal_code) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setPlacing(true);

    const discountAmount = calculateDiscount();
    const finalAmount = totalPrice - discountAmount;
    const orderNumber = `ELA${Date.now().toString().slice(-8)}`;

    // For guest orders, we need to create a guest order record
    // Since there's no user_id, we'll store guest info in the shipping_address
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: "00000000-0000-0000-0000-000000000000", // Placeholder for guest orders
        order_number: orderNumber,
        status: "pending",
        payment_status: "pending",
        subtotal: totalPrice,
        shipping_amount: 0,
        discount_amount: discountAmount,
        wallet_amount_used: 0,
        total_amount: finalAmount,
        coupon_code: appliedCoupon?.code || null,
        notes: `Guest Order - Email: ${guestDetails.email}`,
        shipping_address: {
          full_name: guestDetails.full_name,
          email: guestDetails.email,
          phone: guestDetails.phone,
          address_line1: guestDetails.address_line1,
          address_line2: guestDetails.address_line2,
          city: guestDetails.city,
          state: guestDetails.state,
          postal_code: guestDetails.postal_code,
          country: "India",
          is_guest: true
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

    // Create order items
    const orderItems = guestCart.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.product.name,
      product_price: item.product.price, // MRP price for guests
      quantity: item.quantity,
      total_price: item.product.price * item.quantity,
    }));

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

    // Clear guest cart
    localStorage.removeItem("guest_cart");

    toast({
      title: "Order Placed!",
      description: `Your order ${orderNumber} has been placed successfully. Check your email for confirmation.`,
    });

    navigate(`/`);
    setPlacing(false);
  };

  const updateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    const updatedCart = guestCart.map(item => 
      item.product_id === productId ? { ...item, quantity: newQuantity } : item
    );
    setGuestCart(updatedCart);
    localStorage.setItem("guest_cart", JSON.stringify(updatedCart.map(i => ({ product_id: i.product_id, quantity: i.quantity }))));
  };

  const removeItem = (productId: string) => {
    const updatedCart = guestCart.filter(item => item.product_id !== productId);
    setGuestCart(updatedCart);
    localStorage.setItem("guest_cart", JSON.stringify(updatedCart.map(i => ({ product_id: i.product_id, quantity: i.quantity }))));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (guestCart.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-16">
            <ShoppingCart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Your cart is empty</h2>
            <p className="text-muted-foreground mb-6">Add some products to get started</p>
            <Button onClick={() => navigate("/products")}>Browse Products</Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const discountAmount = calculateDiscount();
  const finalAmount = totalPrice - discountAmount;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Guest Checkout</h1>
          <p className="text-muted-foreground">
            Checking out as guest. <Button variant="link" className="p-0 h-auto" onClick={() => navigate("/auth")}>Sign in</Button> for member prices!
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Guest Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Your Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Full Name *</Label>
                    <Input
                      id="full_name"
                      value={guestDetails.full_name}
                      onChange={(e) => setGuestDetails({ ...guestDetails, full_name: e.target.value })}
                      placeholder="Your full name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={guestDetails.email}
                      onChange={(e) => setGuestDetails({ ...guestDetails, email: e.target.value })}
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone *</Label>
                  <Input
                    id="phone"
                    value={guestDetails.phone}
                    onChange={(e) => setGuestDetails({ ...guestDetails, phone: e.target.value })}
                    placeholder="Your phone number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address_line1">Address Line 1 *</Label>
                  <Input
                    id="address_line1"
                    value={guestDetails.address_line1}
                    onChange={(e) => setGuestDetails({ ...guestDetails, address_line1: e.target.value })}
                    placeholder="Street address"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address_line2">Address Line 2</Label>
                  <Input
                    id="address_line2"
                    value={guestDetails.address_line2}
                    onChange={(e) => setGuestDetails({ ...guestDetails, address_line2: e.target.value })}
                    placeholder="Apartment, suite, etc."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      value={guestDetails.city}
                      onChange={(e) => setGuestDetails({ ...guestDetails, city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State *</Label>
                    <Input
                      id="state"
                      value={guestDetails.state}
                      onChange={(e) => setGuestDetails({ ...guestDetails, state: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postal_code">Postal Code *</Label>
                  <Input
                    id="postal_code"
                    value={guestDetails.postal_code}
                    onChange={(e) => setGuestDetails({ ...guestDetails, postal_code: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Payment Method */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment Method
                </CardTitle>
              </CardHeader>
              <CardContent>
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

            {/* Coupon */}
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
                  {guestCart.map((item) => (
                    <div key={item.product_id} className="flex gap-3">
                      <img
                        src={item.product.images?.[0] || "/placeholder.svg"}
                        alt={item.product.name}
                        className="w-16 h-16 object-cover rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm line-clamp-2">{item.product.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => updateQuantity(item.product_id, item.quantity - 1)}>-</Button>
                          <span className="text-sm">{item.quantity}</span>
                          <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => updateQuantity(item.product_id, item.quantity + 1)}>+</Button>
                          <Button variant="ghost" size="sm" className="h-6 ml-auto text-destructive" onClick={() => removeItem(item.product_id)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-sm font-semibold mt-1">
                          ₹{(item.product.price * item.quantity).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <Separator />

                {/* Pricing */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal (MRP)</span>
                    <span>₹{totalPrice.toFixed(2)}</span>
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
                  disabled={placing}
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

export default GuestCheckout;
