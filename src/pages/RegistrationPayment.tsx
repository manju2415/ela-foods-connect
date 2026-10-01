import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CreditCard, Wallet, Gift, CheckCircle2 } from "lucide-react";
import { initiateRazorpayPayment, isPaymentCancelled, preloadRazorpayScript } from "@/utils/razorpay";
import { realEmailOrEmpty, validateEmail } from "@/lib/email";


interface RegistrationSettings {
  amount: number;
  wallet_credit: number;
  non_refundable: number;
}

const RegistrationPayment = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [settings, setSettings] = useState<RegistrationSettings>({ amount: 2499, wallet_credit: 1000, non_refundable: 0 });
  const [feePaid, setFeePaid] = useState(false);
  const [isFounder, setIsFounder] = useState(false);
  const [hasReferrer, setHasReferrer] = useState(false);
  const [founderStatus, setFounderStatus] = useState<string>("none");
  const [referralCode, setReferralCode] = useState("");
  const [referralCodeValid, setReferralCodeValid] = useState<boolean | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);



  // Start fetching Razorpay's script now so it is ready when Pay is tapped.
  useEffect(() => {
    preloadRazorpayScript();
  }, []);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, navigate]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    // Check if user already paid registration fee
    const { data: profile } = await supabase
      .from("profiles")
      .select("registration_fee_paid, user_level, is_designated_founder, referred_by, founder_status, email")
      .eq("id", user.id)
      .single();

    setContactEmail(realEmailOrEmpty(profile?.email) || realEmailOrEmpty(user.email));



    if (profile?.registration_fee_paid && profile.registration_fee_paid > 0) {
      setFeePaid(true);
    }

    setHasReferrer(!!profile?.referred_by);

    const founder = profile?.user_level === "founder" || profile?.is_designated_founder === true;
    setIsFounder(founder);
    setFounderStatus((profile as { founder_status?: string } | null)?.founder_status || "none");

    // Get registration fee settings (founders have their own fee)
    const { data: settingsData } = await supabase
      .from("mlm_settings")
      .select("key, value")
      .eq("key", founder ? "founder_registration_fee" : "registration_fee")
      .maybeSingle();

    if (settingsData?.value) {
      const value = settingsData.value as { amount?: number; total?: number; wallet_credit?: number; non_refundable?: number };
      const total = value.total || value.amount || (founder ? 4999 : 2499);
      const walletCredit = value.wallet_credit || 1000;
      const nonRefundable = value.non_refundable || (total - walletCredit);
      setSettings({
        amount: total,
        wallet_credit: walletCredit,
        non_refundable: nonRefundable > 0 ? nonRefundable : 0,
      });
    } else if (founder) {
      setSettings({ amount: 4999, wallet_credit: 3001, non_refundable: 1998 });
    }


    setLoading(false);
  };

  const validateReferralCode = async (code: string) => {
    const clean = code.trim().toUpperCase();
    setReferralCode(clean);
    if (clean.length < 3) {
      setReferralCodeValid(null);
      return;
    }
    const { data } = await supabase
      .from("referral_codes")
      .select("id")
      .eq("code", clean)
      .eq("is_active", true)
      .maybeSingle();
    setReferralCodeValid(!!data);
  };

  const getPaymentErrorMessage = (error: unknown) => {
    if (typeof error === "string" && error) {
      return error;
    }

    if (error && typeof error === "object") {
      const paymentError = error as { description?: string; message?: string; reason?: string };
      if (paymentError.description) return paymentError.description;
      if (paymentError.message) return paymentError.message;
      if (paymentError.reason) return paymentError.reason;
    }

    return "Something went wrong. Please try again.";
  };

  const getFriendlyPaymentErrorMessage = (error: unknown) => {
    const errorMessage = getPaymentErrorMessage(error);

    if (errorMessage.toLowerCase().includes("website does not match registered website")) {
      return "Razorpay is blocking this preview domain. Add this domain in Razorpay Website settings and try again.";
    }

    return errorMessage;
  };

  const handlePayment = async () => {
    if (!user) return;

    const { value: validEmail, error: emailValidationError } = validateEmail(contactEmail);
    if (!validEmail) {
      setEmailError(emailValidationError || "Please enter a valid email address");
      toast({
        title: "Email Required",
        description: emailValidationError || "Please enter a valid email address for your receipt.",
        variant: "destructive",
      });
      return;
    }
    setEmailError(null);
    setProcessing(true);

    // Save the real email on the profile so receipts and future payments use it
    await supabase.from("profiles").update({ email: validEmail }).eq("id", user.id);

    const paymentPhone =
      user.phone ||
      (typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : "");

    try {
      await initiateRazorpayPayment({
        amount: settings.amount,
        receipt: `reg_${user.id.slice(0, 8)}`,
        notes: { description: "Registration Fee", user_id: user.id },
        purpose: "registration",
        orderId: user.id,
        prefill: {
          name: user.user_metadata?.full_name || "",
          email: validEmail,
          contact: paymentPhone,
        },

        onSuccess: async (response) => {
          // Process registration via server-side edge function (bypasses RLS)
          const { data: regData, error: regError } = await supabase.functions.invoke(
            "process-registration-payment",
            {
              body: {
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                referral_code: !hasReferrer && referralCodeValid ? referralCode : undefined,
              },
            }
          );

          if (regError || regData?.error) {
            console.error("Registration processing error:", regError || regData?.error);
            toast({
              title: "Payment received, but registration processing failed",
              description:
                (typeof regData?.error === "string" && regData.error) ||
                "Please contact support. Your payment is safe.",
              variant: "destructive",
            });
            setProcessing(false);
            return;
          }

          toast({
            title: "Payment Successful!",
            description: `₹${regData?.wallet_credit || settings.wallet_credit} wallet credit added to your account.`,
          });

          setFeePaid(true);

          // Redirect to correct dashboard based on role
          const { data: roles } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id);

          const roleSet = new Set((roles || []).map((r) => r.role));

          let targetRoute = "/customer-app";
          if (roleSet.has("super_admin")) targetRoute = "/admin";
          else if (roleSet.has("mlm_admin")) targetRoute = "/mlm-admin";
          else if (roleSet.has("admin")) targetRoute = "/admin/products";
          else if (roleSet.has("founding_member") || roleSet.has("member")) targetRoute = "/member-app";

          setTimeout(() => navigate(targetRoute, { replace: true }), 1500);
        },
        onFailure: (error) => {
          console.error("Payment error:", error);
          if (isPaymentCancelled(error)) {
            toast({ title: "Payment cancelled", description: "You can try again whenever you're ready." });
          } else {
            toast({
              title: "Payment Failed",
              description: getFriendlyPaymentErrorMessage(error),
              variant: "destructive",
            });
          }
          setProcessing(false);
        },
      });
    } catch (error) {
      console.error("Payment error:", error);
      toast({
        title: "Payment Failed",
        description: getFriendlyPaymentErrorMessage(error),
        variant: "destructive",
      });
    }

    setProcessing(false);
  };

  const handleSkip = () => {
    // Remember the skip for this session so onboarding guards don't bounce
    // the user straight back to this page (which made it look "stuck").
    try {
      sessionStorage.setItem("skip_registration_payment", "1");
    } catch {
      /* ignore storage errors */
    }
    toast({
      title: "Registration Skipped",
      description: "You can complete registration payment later from your dashboard.",
    });
    navigate("/", { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-16 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (feePaid) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-16">
          <Card className="max-w-md mx-auto">
            <CardContent className="pt-8 text-center">
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Already Registered!</h2>
              <p className="text-muted-foreground mb-6">
                Your registration is complete. Enjoy member benefits!
              </p>
              <Button onClick={() => navigate("/dashboard")} className="w-full">
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Complete Your Registration</h1>
            <p className="text-muted-foreground">
              Unlock exclusive member benefits with a one-time registration fee
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Registration Fee
              </CardTitle>
              <CardDescription>
                One-time payment to become an Ela Bazar member
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Price Display */}
              <div className="text-center p-6 bg-primary/5 rounded-lg border border-primary/20">
                <p className="text-sm text-muted-foreground mb-1">Registration Fee</p>
                <p className="text-4xl font-bold text-primary">₹{settings.amount}</p>
              </div>

              {/* Fee Breakdown */}
              <div className="rounded-lg border p-4 space-y-2">
                <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Fee Breakdown</h4>
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm">Wallet Credit (Purchase Only)</span>
                  <span className="font-medium text-green-600">₹{settings.wallet_credit}</span>
                </div>
                {settings.non_refundable > 0 && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm">Platform Fee (Non-refundable)</span>
                    <span className="font-medium">₹{settings.non_refundable}</span>
                  </div>
                )}
                <div className="border-t pt-2 flex justify-between items-center font-semibold">
                  <span>Total</span>
                  <span>₹{settings.amount}</span>
                </div>
              </div>

              {/* Benefits */}
              <div className="space-y-4">
                <h3 className="font-semibold">What you get:</h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                    <Wallet className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-green-800">₹{settings.wallet_credit} Wallet Credit</p>
                      <p className="text-sm text-green-600">Use for your first purchases</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <Gift className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-blue-800">Member Pricing</p>
                      <p className="text-sm text-blue-600">Get products at discounted member prices</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                    <CreditCard className="h-5 w-5 text-purple-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-purple-800">Referral Earnings</p>
                      <p className="text-sm text-purple-600">Earn ₹200+ for each referral</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Email for payment receipt */}
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

              {/* Referral Code */}

              {!hasReferrer && (
                <div className="space-y-2">
                  <Label htmlFor="paymentReferralCode">Referral Code (optional)</Label>
                  <Input
                    id="paymentReferralCode"
                    placeholder="Enter referral code if you have one"
                    value={referralCode}
                    onChange={(e) => validateReferralCode(e.target.value)}
                    className={
                      referralCodeValid === true
                        ? "border-green-500"
                        : referralCodeValid === false
                        ? "border-destructive"
                        : ""
                    }
                  />
                  {referralCodeValid === true && (
                    <p className="text-sm text-green-600">Valid referral code — your referrer will be linked.</p>
                  )}
                  {referralCodeValid === false && (
                    <p className="text-sm text-destructive">Invalid or inactive referral code</p>
                  )}
                </div>
              )}

              {/* Founder approval status */}
              {isFounder && (
                <div className="p-3 rounded-lg border bg-muted/40">
                  <p className="text-sm font-medium">
                    Founding Member Status:{" "}
                    {founderStatus === "active"
                      ? "Active Founding Member"
                      : founderStatus === "approved_pending_payment"
                      ? "Approved — Pay Now"
                      : "Pending Approval"}
                  </p>
                  {founderStatus !== "active" && founderStatus !== "approved_pending_payment" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Your founding member application is awaiting Super Admin approval. You can pay once approved.
                    </p>
                  )}
                </div>
              )}

              {/* Payment Button */}
              <div className="space-y-3 pt-4">
                <Button 
                  className="w-full h-12 text-lg" 
                  onClick={handlePayment}
                  disabled={processing || (isFounder && founderStatus !== "approved_pending_payment" && founderStatus !== "active")}
                >
                  {processing ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>Pay ₹{settings.amount}</>
                  )}
                </Button>
                {!isFounder && (
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={handleSkip}
                    disabled={processing}
                  >
                    Skip for now
                  </Button>
                )}

              </div>

              <p className="text-xs text-center text-muted-foreground">
                By completing payment, you agree to our Terms of Service and{" "}
                <Link to="/policies/privacy" target="_blank" className="underline">Privacy Policy</Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default RegistrationPayment;
