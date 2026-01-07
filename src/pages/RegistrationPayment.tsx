import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CreditCard, Wallet, Gift, CheckCircle2 } from "lucide-react";

interface RegistrationSettings {
  amount: number;
  wallet_credit: number;
}

const RegistrationPayment = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [settings, setSettings] = useState<RegistrationSettings>({ amount: 2499, wallet_credit: 1000 });
  const [feePaid, setFeePaid] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    fetchData();
  }, [user, navigate]);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    // Check if user already paid registration fee
    const { data: profile } = await supabase
      .from("profiles")
      .select("registration_fee_paid")
      .eq("id", user.id)
      .single();

    if (profile?.registration_fee_paid && profile.registration_fee_paid > 0) {
      setFeePaid(true);
    }

    // Get registration fee settings
    const { data: settingsData } = await supabase
      .from("mlm_settings")
      .select("key, value")
      .eq("key", "registration_fee")
      .single();

    if (settingsData?.value) {
      const value = settingsData.value as { amount?: number; wallet_credit?: number };
      setSettings({
        amount: value.amount || 2499,
        wallet_credit: value.wallet_credit || 1000,
      });
    }

    setLoading(false);
  };

  const handlePayment = async () => {
    if (!user) return;
    setProcessing(true);

    try {
      // For now, simulate payment success (integrate with actual payment gateway later)
      // Update profile with registration fee paid
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ registration_fee_paid: settings.amount })
        .eq("id", user.id);

      if (profileError) throw profileError;

      // Credit wallet with welcome bonus
      const { error: walletError } = await supabase
        .from("wallets")
        .update({ 
          balance: settings.wallet_credit,
          purchase_only_balance: settings.wallet_credit
        })
        .eq("user_id", user.id);

      if (walletError) throw walletError;

      // Add wallet transaction record
      const { data: wallet } = await supabase
        .from("wallets")
        .select("id, balance")
        .eq("user_id", user.id)
        .single();

      if (wallet) {
        await supabase.from("wallet_transactions").insert({
          wallet_id: wallet.id,
          type: "credit",
          amount: settings.wallet_credit,
          balance_after: wallet.balance,
          description: "Registration welcome bonus",
          is_withdrawable: false,
        });
      }

      // Create notification
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "Registration Complete!",
        message: `Welcome to ELA Foods! ₹${settings.wallet_credit} has been credited to your wallet.`,
        type: "success",
      });

      toast({
        title: "Payment Successful!",
        description: `₹${settings.wallet_credit} wallet credit added to your account.`,
      });

      setFeePaid(true);
      
      // Redirect to dashboard after short delay
      setTimeout(() => {
        navigate("/dashboard");
      }, 2000);
    } catch (error) {
      console.error("Payment error:", error);
      toast({
        title: "Payment Failed",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }

    setProcessing(false);
  };

  const handleSkip = () => {
    toast({
      title: "Registration Skipped",
      description: "You can complete registration payment later from your dashboard.",
    });
    navigate("/dashboard");
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
                One-time payment to become an ELA Foods member
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Price Display */}
              <div className="text-center p-6 bg-primary/5 rounded-lg border border-primary/20">
                <p className="text-sm text-muted-foreground mb-1">Registration Fee</p>
                <p className="text-4xl font-bold text-primary">₹{settings.amount}</p>
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

              {/* Payment Button */}
              <div className="space-y-3 pt-4">
                <Button 
                  className="w-full h-12 text-lg" 
                  onClick={handlePayment}
                  disabled={processing}
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
                <Button 
                  variant="ghost" 
                  className="w-full" 
                  onClick={handleSkip}
                  disabled={processing}
                >
                  Skip for now
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                By completing payment, you agree to our Terms of Service and Privacy Policy
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
