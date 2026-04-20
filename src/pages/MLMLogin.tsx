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

// Test accounts bypass real SMS for QA. Real users always go through MSG91.
const TEST_PHONES = ["9999000001", "9999000002", "9999000003", "9999000004", "9999000005", "9999000006"];
const TEST_OTP = "000000";
const RESEND_COOLDOWN_SECONDS = 30;

const isTestPhone = (phone: string) => TEST_PHONES.some((p) => phone.endsWith(p));

const sendOtpViaMsg91 = async (phone: string) => {
  if (isTestPhone(phone)) return { success: true as const };
  const { data, error } = await supabase.functions.invoke("msg91-send-otp", { body: { phone } });
  if (error) return { success: false as const, error: error.message };
  if (!data?.success) return { success: false as const, error: data?.error || "Failed to send OTP" };
  return { success: true as const };
};

const verifyOtpViaMsg91 = async (phone: string, otp: string) => {
  if (isTestPhone(phone)) {
    if (otp === TEST_OTP) return { success: true as const };
    return { success: false as const, error: "Invalid OTP" };
  }
  const { data, error } = await supabase.functions.invoke("msg91-verify-otp", { body: { phone, otp } });
  if (error) return { success: false as const, error: error.message };
  if (!data?.success) return { success: false as const, error: data?.error || "Invalid OTP" };
  return { success: true as const };
};

const phoneSchema = z.object({
  phone: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
});

type PhoneFormData = z.infer<typeof phoneSchema>;

const MLMLogin = () => {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [otpCode, setOtpCode] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
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

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleSendOtp = async (data: PhoneFormData) => {
    setIsSubmitting(true);
    setHasAttemptedLogin(true);
    await signOut();

    const fullPhone = `+91${data.phone}`;
    const result = await sendOtpViaMsg91(fullPhone);
    setIsSubmitting(false);

    if (!result.success) {
      toast({ title: "Failed to send OTP", description: result.error, variant: "destructive" });
      return;
    }

    setPhoneNumber(fullPhone);
    setStep("otp");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    toast({
      title: "OTP Sent",
      description: isTestPhone(fullPhone)
        ? `Test account — use ${TEST_OTP}`
        : `A 6-digit code was sent to ${fullPhone}`,
    });
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || !phoneNumber) return;
    setIsSubmitting(true);
    const result = await sendOtpViaMsg91(phoneNumber);
    setIsSubmitting(false);
    if (!result.success) {
      toast({ title: "Failed to resend OTP", description: result.error, variant: "destructive" });
      return;
    }
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    toast({ title: "OTP Resent", description: `A new code was sent to ${phoneNumber}` });
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) return;

    setIsSubmitting(true);
    const verify = await verifyOtpViaMsg91(phoneNumber, otpCode);

    if (!verify.success) {
      setIsSubmitting(false);
      toast({ title: "Verification failed", description: verify.error, variant: "destructive" });
      setOtpCode("");
      return;
    }

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

            <div className="text-center text-sm">
              {resendCooldown > 0 ? (
                <span className="text-muted-foreground">Resend code in {resendCooldown}s</span>
              ) : (
                <button
                  type="button"
                  className="text-primary hover:underline disabled:opacity-50"
                  onClick={handleResendOtp}
                  disabled={isSubmitting}
                >
                  Resend OTP
                </button>
              )}
            </div>

            <div className="text-center">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
                onClick={() => { setStep("phone"); setOtpCode(""); setPhoneNumber(""); setResendCooldown(0); setHasAttemptedLogin(false); }}
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
