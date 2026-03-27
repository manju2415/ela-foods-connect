import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Network, Phone, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import elaLogo from "@/assets/ela-foods-logo.png";

const MOCK_OTP = "000000";

const phoneSchema = z.object({
  phone: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
});

type PhoneFormData = z.infer<typeof phoneSchema>;

const MLMLogin = () => {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [otpCode, setOtpCode] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAttemptedLogin, setHasAttemptedLogin] = useState(false);

  const { user, createSessionForPhone, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const form = useForm<PhoneFormData>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: "" },
  });

  useEffect(() => {
    if (user && !hasAttemptedLogin) {
      supabase.rpc("is_mlm_admin", { _user_id: user.id }).then(({ data }) => {
        if (data) {
          navigate("/mlm-admin", { replace: true });
        }
      });
    }
  }, [user, navigate, hasAttemptedLogin]);

  const handleSendOtp = async (data: PhoneFormData) => {
    setIsSubmitting(true);
    setHasAttemptedLogin(true);
    await signOut();

    const fullPhone = `+91${data.phone}`;
    setPhoneNumber(fullPhone);
    setStep("otp");
    setIsSubmitting(false);
    toast({ title: "OTP Sent", description: `Use code ${MOCK_OTP} to verify` });
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) return;

    if (otpCode !== MOCK_OTP) {
      toast({ title: "Verification failed", description: "Invalid OTP. Use 000000.", variant: "destructive" });
      setOtpCode("");
      return;
    }

    setIsSubmitting(true);

    const { error } = await createSessionForPhone(phoneNumber);
    setIsSubmitting(false);

    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
      setHasAttemptedLogin(false);
      return;
    }

    const { data: { user: verifiedUser } } = await supabase.auth.getUser();
    if (verifiedUser) {
      const { data: isMlmAdmin } = await supabase.rpc("is_mlm_admin", { _user_id: verifiedUser.id });

      if (!isMlmAdmin) {
        toast({ title: "Access Denied", description: "This login is for Network Managers only.", variant: "destructive" });
        await signOut();
        setHasAttemptedLogin(false);
        setStep("phone");
        setOtpCode("");
        return;
      }
    }

    toast({ title: "Welcome!", description: "Logged in to Network Manager." });
    navigate("/mlm-admin", { replace: true });
  };

  if (step === "otp") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <img src={elaLogo} alt="Elabazar" className="h-16 w-auto" />
            </div>
            <CardTitle className="text-2xl">Verify OTP</CardTitle>
            <CardDescription>Enter the 6-digit code sent to {phoneNumber}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>

            <Button className="w-full" disabled={otpCode.length !== 6 || isSubmitting} onClick={handleVerifyOtp}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verify & Sign In
            </Button>

            <div className="text-center">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
                onClick={() => { setStep("phone"); setOtpCode(""); setPhoneNumber(""); setHasAttemptedLogin(false); }}
              >
                <ArrowLeft className="h-3 w-3" /> Change phone number
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={elaLogo} alt="Elabazar" className="h-16 w-auto" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            <CardTitle className="text-2xl">Network Manager</CardTitle>
          </div>
          <CardDescription>Sign in with your mobile number</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(handleSendOtp)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mlm-phone">Mobile Number</Label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">
                  +91
                </span>
                <Input
                  id="mlm-phone"
                  type="tel"
                  placeholder="9876543210"
                  className="rounded-l-none"
                  maxLength={10}
                  {...form.register("phone")}
                />
              </div>
              {form.formState.errors.phone && (
                <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Phone className="mr-2 h-4 w-4" />
              Send OTP
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              className="text-sm text-muted-foreground hover:underline"
              onClick={() => navigate("/auth")}
            >
              Customer / Member Login →
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MLMLogin;
