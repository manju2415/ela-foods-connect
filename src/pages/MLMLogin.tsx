import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/AuthContext";
import { useMsg91OTP } from "@/hooks/useMsg91OTP";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Network, Phone, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import elaLogo from "@/assets/ela-foods-logo.png";

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
  const [resendTimer, setResendTimer] = useState(0);

  const { user, createSessionForPhone, signOut } = useAuth();
  const { sendOtp: msg91SendOtp, verifyOtp: msg91VerifyOtp, retryOtp: msg91RetryOtp, isReady: msg91Ready, initError: msg91Error } = useMsg91OTP();
  const navigate = useNavigate();
  const { toast } = useToast();

  const form = useForm<PhoneFormData>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: "" },
  });

  useEffect(() => {
    if (user && !hasAttemptedLogin) {
      Promise.all([
        supabase.rpc("is_admin", { _user_id: user.id }),
        supabase.rpc("is_founding_member", { _user_id: user.id }),
      ]).then(([adminRes, founderRes]) => {
        if (adminRes.data || founderRes.data) {
          navigate("/mlm-admin", { replace: true });
        }
      });
    }
  }, [user, navigate, hasAttemptedLogin]);

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const useMockOtp = !msg91Ready && !!msg91Error;

  const handleMockLogin = async (phone: string) => {
    const fullPhone = `+91${phone}`;
    const { error } = await createSessionForPhone(fullPhone);
    setIsSubmitting(false);

    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
      setHasAttemptedLogin(false);
      return;
    }

    // Check admin/founder role
    const { data: { user: verifiedUser } } = await supabase.auth.getUser();
    if (verifiedUser) {
      const [{ data: isAdmin }, { data: isFounder }] = await Promise.all([
        supabase.rpc("is_admin", { _user_id: verifiedUser.id }),
        supabase.rpc("is_founding_member", { _user_id: verifiedUser.id }),
      ]);

      if (!isAdmin && !isFounder) {
        toast({ title: "Access Denied", description: "This login is for Network Managers only.", variant: "destructive" });
        await signOut();
        setHasAttemptedLogin(false);
        return;
      }
    }

    toast({ title: "Welcome!", description: "Logged in to Network Manager." });
    navigate("/mlm-admin", { replace: true });
  };

  const handleSendOtp = async (data: PhoneFormData) => {
    setIsSubmitting(true);
    setHasAttemptedLogin(true);
    await signOut();

    // Mock OTP: skip SMS, login directly
    if (useMockOtp) {
      await handleMockLogin(data.phone);
      return;
    }

    const fullPhone = `+91${data.phone}`;

    const result = await msg91SendOtp(fullPhone);
    setIsSubmitting(false);

    if (!result.success) {
      setHasAttemptedLogin(false);
      toast({ title: "Failed to send OTP", description: result.error || "Please try again.", variant: "destructive" });
      return;
    }

    setPhoneNumber(fullPhone);
    setStep("otp");
    setResendTimer(30);
    toast({ title: "OTP Sent", description: `Verification code sent to ${fullPhone}` });
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) return;

    setIsSubmitting(true);

    // Verify OTP via MSG91
    const verifyResult = await msg91VerifyOtp(otpCode);

    if (!verifyResult.success) {
      setIsSubmitting(false);
      toast({ title: "Verification failed", description: verifyResult.error || "Invalid OTP.", variant: "destructive" });
      setOtpCode("");
      return;
    }

    // OTP verified — create Supabase session
    const { error } = await createSessionForPhone(phoneNumber);
    setIsSubmitting(false);

    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
      setHasAttemptedLogin(false);
      return;
    }

    // Check admin role
    const { data: { user: verifiedUser } } = await supabase.auth.getUser();
    if (verifiedUser) {
      const [{ data: isAdmin }, { data: isFounder }] = await Promise.all([
        supabase.rpc("is_admin", { _user_id: verifiedUser.id }),
        supabase.rpc("is_founding_member", { _user_id: verifiedUser.id }),
      ]);

      if (!isAdmin && !isFounder) {
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

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    setIsSubmitting(true);
    const result = await msg91RetryOtp('text');
    setIsSubmitting(false);

    if (!result.success) {
      toast({ title: "Failed to resend OTP", description: result.error || "Please try again.", variant: "destructive" });
    } else {
      setResendTimer(30);
      toast({ title: "OTP Resent", description: "A new verification code has been sent." });
    }
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

            <div className="text-center space-y-2">
              <button
                type="button"
                className="text-sm text-primary hover:underline disabled:text-muted-foreground"
                onClick={handleResendOtp}
                disabled={resendTimer > 0 || isSubmitting}
              >
                {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : "Resend OTP"}
              </button>
              <br />
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

            <Button type="submit" className="w-full" disabled={isSubmitting || !msg91Ready}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Phone className="mr-2 h-4 w-4" />
              {msg91Ready ? "Send OTP" : "Loading..."}
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
