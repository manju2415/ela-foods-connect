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
import {
  MapPin, Package, CreditCard, Ticket, X, Check,
  ShoppingCart, Loader2, ChevronRight, Edit2, CheckCircle2,
} from "lucide-react";
import { initiateRazorpayPayment } from "@/utils/razorpay";
import { useAuth } from "@/contexts/AuthContext";
import { useShippingSettings } from "@/hooks/useShippingSettings";

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

type Step = "details" | "summary" | "payment" | "confirmation";

const STEPS: { key: Step; label: string }[] = [
  { key: "details", label: "Your Details" },
  { key: "summary", label: "Order Summary" },
  { key: "payment", label: "Payment" },
  { key: "confirmation", label: "Confirmation" },
];

const GuestCheckout = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { items, totalPrice, updateQuantity, removeFromCart } = useCart();
  const { calculateShipping } = useShippingSettings();

  const [step, setStep] = useState<Step>("details");
  const [placing, setPlacing] = useState(false);
  const [orderResult, setOrderResult] = useState<{ orderNumber: string } | null>(null);

  // Coupon state
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");

  const [guestDetails, setGuestDetails] = useState({
    full_name: "",
    phone: "",
    email: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    postal_code: "",
  });

  const [paymentMethod, setPaymentMethod] = useState<string>("upi");

  useEffect(() => {
    if (user) {
      navigate("/checkout");
    }
  }, [user, navigate]);

  // ──── Validation ────
  const isDetailsValid = () => {
    const { full_name, phone, address_line1, city, state, postal_code } = guestDetails;
    return (
      full_name.trim().length >= 2 &&
      /^[6-9]\d{9}$/.test(phone.trim()) &&
      address_line1.trim().length >= 3 &&
      city.trim().length >= 2 &&
      state.trim().length >= 2 &&
      /^\d{6}$/.test(postal_code.trim())
    );
  };

  // ──── Coupon ────
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
    let discount =
      appliedCoupon.discount_type === "percentage"
        ? (totalPrice * appliedCoupon.discount_value) / 100
        : appliedCoupon.discount_value;
    if (appliedCoupon.max_discount_amount) {
      discount = Math.min(discount, appliedCoupon.max_discount_amount);
    }
    return Math.min(discount, totalPrice);
  };

  const discountAmount = calculateDiscount();
  const shippingAmount = calculateShipping(totalPrice);
  const finalAmount = totalPrice - discountAmount + shippingAmount;

  // ──── Place Order ────
  const handlePlaceOrder = async () => {
    setPlacing(true);

    try {
      // Guest orders are always paid online — the order is created only after
      // Razorpay confirms and the payment is verified server-side.
      await initiateRazorpayPayment({
        amount: finalAmount,
        receipt: `guest_${Date.now()}`,
        notes: { description: "Guest Order" },
        purpose: "guest_order",
        prefill: {
          name: guestDetails.full_name,
          contact: guestDetails.phone,
          email: guestDetails.email,
        },
        onSuccess: async (response) => {
          const { data, error } = await supabase.functions.invoke("place-guest-order", {
            body: {
              guest_details: guestDetails,
              items: items.map((item) => ({
                product_id: item.product_id,
                quantity: item.quantity,
              })),
              coupon_code: appliedCoupon?.code || null,
              discount_amount: discountAmount,
              payment_method: "online",
              payment_reference: response?.razorpay_payment_id || null,
            },
          });

          if (error || !data?.success) {
            toast({
              title: "Order creation failed",
              description:
                "Your payment went through but the order could not be created. Please contact support with your payment reference.",
              variant: "destructive",
            });
            setPlacing(false);
            return;
          }

          localStorage.removeItem("ela_guest_cart");
          setOrderResult({ orderNumber: data.order_number });
          setStep("confirmation");
          setPlacing(false);
        },
        onFailure: (error) => {
          console.error("Payment failed:", error);
          toast({
            title: "Payment not completed",
            description: "No order was created. Please complete the payment to confirm your order.",
            variant: "destructive",
          });
          setPlacing(false);
        },
      });
      return;
    } catch (err) {
      console.error("Guest order error:", err);
      toast({ title: "Error", description: "Failed to place order. Please try again.", variant: "destructive" });
    }
    setPlacing(false);
  };

  // ──── Stepper ────
  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const renderStepper = () => (
    <div className="flex items-center justify-center gap-1 mb-8">
      {STEPS.map((s, i) => {
        const isActive = i === stepIndex;
        const isDone = i < stepIndex;
        return (
          <div key={s.key} className="flex items-center">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors
              ${isDone ? "bg-primary/15 text-primary" : isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {isDone ? <Check className="h-3.5 w-3.5" /> : <span>{i + 1}</span>}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground" />}
          </div>
        );
      })}
    </div>
  );

  // ──── Step: Details ────
  const renderDetailsStep = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> Delivery Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name *</Label>
              <Input id="full_name" value={guestDetails.full_name} onChange={(e) => setGuestDetails({ ...guestDetails, full_name: e.target.value })} placeholder="Your full name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Mobile Number *</Label>
              <Input id="phone" value={guestDetails.phone} onChange={(e) => setGuestDetails({ ...guestDetails, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="10-digit mobile number" maxLength={10} />
              {guestDetails.phone && !/^[6-9]\d{9}$/.test(guestDetails.phone) && (
                <p className="text-xs text-destructive">Enter a valid 10-digit mobile number</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email (optional)</Label>
            <Input id="email" type="email" value={guestDetails.email} onChange={(e) => setGuestDetails({ ...guestDetails, email: e.target.value })} placeholder="For order updates" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address_line1">House / Flat / Street *</Label>
            <Input id="address_line1" value={guestDetails.address_line1} onChange={(e) => setGuestDetails({ ...guestDetails, address_line1: e.target.value })} placeholder="House no., flat, street" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address_line2">Area / Landmark</Label>
            <Input id="address_line2" value={guestDetails.address_line2} onChange={(e) => setGuestDetails({ ...guestDetails, address_line2: e.target.value })} placeholder="Area, landmark" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City *</Label>
              <Input id="city" value={guestDetails.city} onChange={(e) => setGuestDetails({ ...guestDetails, city: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State *</Label>
              <Input id="state" value={guestDetails.state} onChange={(e) => setGuestDetails({ ...guestDetails, state: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postal_code">Pincode *</Label>
              <Input id="postal_code" value={guestDetails.postal_code} onChange={(e) => setGuestDetails({ ...guestDetails, postal_code: e.target.value.replace(/\D/g, "").slice(0, 6) })} maxLength={6} />
              {guestDetails.postal_code && !/^\d{6}$/.test(guestDetails.postal_code) && (
                <p className="text-xs text-destructive">Enter a valid 6-digit pincode</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={() => setStep("summary")} disabled={!isDetailsValid()}>
          Continue to Order Summary <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );

  // ──── Step: Summary ────
  const renderSummaryStep = () => (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Delivery Address */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2"><MapPin className="h-5 w-5" /> Delivery Address</span>
            <Button variant="ghost" size="sm" onClick={() => setStep("details")}><Edit2 className="h-4 w-4 mr-1" /> Edit</Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-medium">{guestDetails.full_name}</p>
          <p className="text-sm text-muted-foreground">{guestDetails.address_line1}{guestDetails.address_line2 ? `, ${guestDetails.address_line2}` : ""}</p>
          <p className="text-sm text-muted-foreground">{guestDetails.city}, {guestDetails.state} - {guestDetails.postal_code}</p>
          <p className="text-sm text-muted-foreground">Phone: {guestDetails.phone}</p>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader><CardTitle>Items ({items.length})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="flex gap-3">
              <img src={item.product.images?.[0] || "/placeholder.svg"} alt={item.product.name} className="w-16 h-16 object-cover rounded" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm line-clamp-2">{item.product.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => updateQuantity(item.id, item.quantity - 1)}>-</Button>
                  <span className="text-sm">{item.quantity}</span>
                  <Button variant="outline" size="sm" className="h-6 w-6 p-0" onClick={() => updateQuantity(item.id, item.quantity + 1)}>+</Button>
                  <Button variant="ghost" size="sm" className="h-6 ml-auto text-destructive" onClick={() => removeFromCart(item.id)}><X className="h-3 w-3" /></Button>
                </div>
                <p className="text-sm font-semibold mt-1">₹{(item.product.price * item.quantity).toFixed(2)}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Coupon */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Ticket className="h-5 w-5" /> Promo Code</CardTitle></CardHeader>
        <CardContent>
          {appliedCoupon ? (
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="font-mono font-semibold">{appliedCoupon.code}</span>
                <span className="text-sm text-green-600">
                  -{appliedCoupon.discount_type === "percentage" ? `${appliedCoupon.discount_value}%` : `₹${appliedCoupon.discount_value}`}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={removeCoupon}><X className="h-4 w-4" /></Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input placeholder="Enter promo code" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} className="font-mono" />
                <Button onClick={applyCoupon} disabled={couponLoading || !couponCode.trim()}>{couponLoading ? "..." : "Apply"}</Button>
              </div>
              {couponError && <p className="text-sm text-destructive">{couponError}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Price breakdown */}
      <Card>
        <CardContent className="pt-6 space-y-2">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal (MRP)</span><span>₹{totalPrice.toFixed(2)}</span></div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Delivery</span>
            {shippingAmount === 0 ? (
              <span className="text-green-600">Free</span>
            ) : (
              <span>₹{shippingAmount.toFixed(2)}</span>
            )}
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm text-green-600"><span>Coupon Discount</span><span>-₹{discountAmount.toFixed(2)}</span></div>
          )}
          <Separator />
          <div className="flex justify-between font-semibold text-lg"><span>Grand Total</span><span className="text-primary">₹{finalAmount.toFixed(2)}</span></div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep("details")}>Back</Button>
        <Button size="lg" onClick={() => setStep("payment")}>Confirm &amp; Proceed to Payment <ChevronRight className="h-4 w-4 ml-1" /></Button>
      </div>
    </div>
  );

  // ──── Step: Payment ────
  const renderPaymentStep = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> Payment Options</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[
            { id: "upi", label: "UPI", desc: "Google Pay, PhonePe, Paytm", icon: <CreditCard className="h-5 w-5" /> },
            { id: "card", label: "Credit / Debit Card", desc: "Visa, Mastercard, RuPay", icon: <CreditCard className="h-5 w-5" /> },
          ].map((opt) => (
            <div
              key={opt.id}
              onClick={() => setPaymentMethod(opt.id)}
              className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                paymentMethod === opt.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${paymentMethod === opt.id ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {opt.icon}
                </div>
                <div>
                  <p className="font-medium">{opt.label}</p>
                  <p className="text-sm text-muted-foreground">{opt.desc}</p>
                </div>
                {paymentMethod === opt.id && <Check className="h-5 w-5 text-primary ml-auto" />}
              </div>
            </div>
          ))}
          {paymentMethod !== "cod" && (
            <p className="text-sm text-primary text-center pt-2 font-medium">
              You'll be redirected to Razorpay for secure payment.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Total */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between font-semibold text-lg"><span>Amount to Pay</span><span className="text-primary">₹{finalAmount.toFixed(2)}</span></div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep("summary")}>Back</Button>
        <Button size="lg" onClick={handlePlaceOrder} disabled={placing}>
          {placing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...</> : paymentMethod === "cod" ? "Place Order" : `Pay ₹${finalAmount.toFixed(2)}`}
        </Button>
      </div>
    </div>
  );

  // ──── Step: Confirmation ────
  const renderConfirmationStep = () => (
    <div className="max-w-lg mx-auto text-center space-y-6 py-8">
      <div className="mx-auto w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
        <CheckCircle2 className="h-10 w-10 text-green-600" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-foreground">Order Placed Successfully!</h2>
        <p className="text-muted-foreground mt-2">Thank you for your order.</p>
      </div>
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex justify-between"><span className="text-muted-foreground">Order ID</span><span className="font-mono font-semibold">{orderResult?.orderNumber}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold text-primary">₹{finalAmount.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Payment</span><span>Cash on Delivery</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Est. Delivery</span><span>2-4 business days</span></div>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        We'll send updates to {guestDetails.phone}{guestDetails.email ? ` and ${guestDetails.email}` : ""}.
      </p>
      <div className="flex gap-3 justify-center">
        <Button onClick={() => navigate("/products")}>Continue Shopping</Button>
        <Button variant="outline" onClick={() => navigate("/auth")}>Sign Up for Member Prices</Button>
      </div>
    </div>
  );

  // ──── Loading / Empty states ────
  if (items.length === 0 && step !== "confirmation") {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 text-center py-16">
          <ShoppingCart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold mb-2">Your cart is empty</h2>
          <p className="text-muted-foreground mb-6">Add some products to get started</p>
          <Button onClick={() => navigate("/products")}>Browse Products</Button>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {step !== "confirmation" && (
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-foreground">Guest Checkout</h1>
            <p className="text-sm text-muted-foreground">
              <Button variant="link" className="p-0 h-auto text-sm" onClick={() => navigate("/auth")}>Sign in</Button> for member prices &amp; order tracking!
            </p>
          </div>
        )}
        {renderStepper()}
        {step === "details" && renderDetailsStep()}
        {step === "summary" && renderSummaryStep()}
        {step === "payment" && renderPaymentStep()}
        {step === "confirmation" && renderConfirmationStep()}
      </main>
      <Footer />
    </div>
  );
};

export default GuestCheckout;
