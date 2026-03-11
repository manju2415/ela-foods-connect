import { useMemo, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import { Loader2, ArrowLeft, Phone } from "lucide-react";
import elaLogo from "@/assets/ela-foods-logo.png";
import { supabase } from "@/integrations/supabase/client";

const phoneSchema = z.object({
  phone: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
});

const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name is too long"),
  phone: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
  referralCode: z.string().trim().min(1, "Referral code is required"),
});

type PhoneFormData = z.infer<typeof phoneSchema>;
type SignupFormData = z.infer<typeof signupSchema>;

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [otpCode, setOtpCode] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [referralCodeValid, setReferralCodeValid] = useState<boolean | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const { user, sendOtp, verifyOtp, signUpWithOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const redirectTo = useMemo(() => {
    const redirectParam = new URLSearchParams(location.search).get("redirect")?.trim();
    if (redirectParam && redirectParam.startsWith("/")) return redirectParam;
    return null;
  }, [location.search]);

  const loginForm = useForm<PhoneFormData>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: "" },
  });

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: "", phone: "", referralCode: "" },
  });

  const [hasAttemptedLogin, setHasAttemptedLogin] = useState(false);

  useEffect(() => {
    if (user && !hasAttemptedLogin) {
      resolveRoleRedirect(user.id).then((dest) => {
        navigate(redirectTo ?? dest, { replace: true });
      });
    }
  }, [user, navigate, redirectTo, hasAttemptedLogin]);

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const resolveRoleRedirect = async (userId: string): Promise<string> => {
    const { data: partnerData } = await supabase
      .from("delivery_partners")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (partnerData) return "/driver-app";

    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["super_admin", "admin"])
      .maybeSingle();
    if (adminRole) return "/admin";

    const { data: memberRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["member", "founding_member"])
      .maybeSingle();
    if (memberRole) return "/dashboard";

    return "/shop";
  };

  const validateReferralCode = async (code: string) => {
    if (!code || code.length < 3) {
      setReferralCodeValid(null);
      return;
    }

    setCheckingCode(true);
    const { data } = await supabase
      .from("referral_codes")
      .select("id")
      .eq("code", code.toUpperCase())
      .eq("is_active", true)
      .maybeSingle();

    setReferralCodeValid(!!data);
    setCheckingCode(false);
  };

  const handlePostVerifyRedirect = async (isNewUser: boolean) => {
    const { data: { user: verifiedUser } } = await supabase.auth.getUser();
    if (!verifiedUser) return;

    const { data: partnerData } = await supabase
      .from("delivery_partners")
      .select("id")
      .eq("user_id", verifiedUser.id)
      .maybeSingle();

    if (partnerData) {
      navigate(redirectTo || "/driver-app", { replace: true });
      return;
    }

    if (isNewUser) {
      navigate("/complete-registration");
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("phone, bank_account_number, registration_fee_paid, user_level")
      .eq("id", verifiedUser.id)
      .single();

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", verifiedUser.id)
      .in("role", ["founding_member", "super_admin", "admin"])
      .maybeSingle();

    const isFounderOrAdmin = !!roleData || profileData?.user_level === "founder";
    const hasBankDetails = !!profileData?.bank_account_number;
    const isPaymentComplete = (profileData?.registration_fee_paid || 0) > 0;

    if (!isFounderOrAdmin && !hasBankDetails) {
      navigate("/complete-registration", { replace: true });
      return;
    }

    if (!isFounderOrAdmin && hasBankDetails && !isPaymentComplete) {
      navigate("/registration-payment", { replace: true });
      return;
    }

    if (redirectTo) {
      navigate(redirectTo, { replace: true });
      return;
    }

    const dest = await resolveRoleRedirect(verifiedUser.id);
    navigate(dest, { replace: true });
  };

  const handleSendLoginOtp = async (data: PhoneFormData) => {
    setIsSubmitting(true);
    setHasAttemptedLogin(true);
    const fullPhone = `+91${data.phone}`;

    const { error } = await sendOtp(fullPhone);

    if (error) {
      setIsSubmitting(false);
      setHasAttemptedLogin(false);
      toast({
        title: "Failed to send OTP",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    // Auto-verify with mock code (skip OTP screen)
    const { error: verifyError, isNewUser } = await verifyOtp(fullPhone, "000000");
    setIsSubmitting(false);

    if (verifyError) {
      toast({
        title: "Login failed",
        description: verifyError.message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: isNewUser ? "Account created!" : "Welcome back!", description: "You have logged in successfully." });
    await handlePostVerifyRedirect(isNewUser || false);
  };

  const handleSendSignupOtp = async (data: SignupFormData) => {
    if (!referralCodeValid) {
      toast({ title: "Invalid referral code", description: "Please enter a valid referral code.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    const fullPhone = `+91${data.phone}`;

    const { error } = await signUpWithOtp(fullPhone, data.fullName, data.referralCode);
    setIsSubmitting(false);

    if (error) {
      toast({
        title: "Signup failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setPhoneNumber(fullPhone);
      setStep("otp");
      setResendTimer(30);
      toast({ title: "OTP Sent", description: `Verification code sent to +91 ${data.phone}` });
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) return;

    setIsSubmitting(true);
    const { error, isNewUser } = await verifyOtp(phoneNumber, otpCode);
    setIsSubmitting(false);

    if (error) {
      toast({
        title: "Verification failed",
        description: error.message,
        variant: "destructive",
      });
      setOtpCode("");
      return;
    }

    toast({ title: isNewUser ? "Account created!" : "Welcome back!", description: "You have logged in successfully." });

    // Get the user after verification
    const { data: { user: verifiedUser } } = await supabase.auth.getUser();
    if (!verifiedUser) return;

    // Check delivery partner
    const { data: partnerData } = await supabase
      .from("delivery_partners")
      .select("id")
      .eq("user_id", verifiedUser.id)
      .maybeSingle();

    if (partnerData) {
      navigate(redirectTo || "/driver-app", { replace: true });
      return;
    }

    if (isNewUser) {
      navigate("/complete-registration");
      return;
    }

    // Check onboarding status
    const { data: profileData } = await supabase
      .from("profiles")
      .select("phone, bank_account_number, registration_fee_paid, user_level")
      .eq("id", verifiedUser.id)
      .single();

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", verifiedUser.id)
      .in("role", ["founding_member", "super_admin", "admin"])
      .maybeSingle();

    const isFounderOrAdmin = !!roleData || profileData?.user_level === "founder";
    const hasBankDetails = !!profileData?.bank_account_number;
    const isPaymentComplete = (profileData?.registration_fee_paid || 0) > 0;

    if (!isFounderOrAdmin && !hasBankDetails) {
      navigate("/complete-registration", { replace: true });
      return;
    }

    if (!isFounderOrAdmin && hasBankDetails && !isPaymentComplete) {
      navigate("/registration-payment", { replace: true });
      return;
    }

    if (redirectTo) {
      navigate(redirectTo, { replace: true });
      return;
    }

    const dest = await resolveRoleRedirect(verifiedUser.id);
    navigate(dest, { replace: true });
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    setIsSubmitting(true);
    const { error } = await sendOtp(phoneNumber);
    setIsSubmitting(false);

    if (error) {
      toast({ title: "Failed to resend OTP", description: error.message, variant: "destructive" });
    } else {
      setResendTimer(30);
      toast({ title: "OTP Resent", description: "A new verification code has been sent." });
    }
  };

  const handleBackToPhone = () => {
    setStep("phone");
    setOtpCode("");
    setPhoneNumber("");
    setHasAttemptedLogin(false);
  };

  // OTP Verification Screen
  if (step === "otp") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <img src={elaLogo} alt="Elabazar" className="h-16 w-auto" />
            </div>
            <CardTitle className="text-2xl">Verify OTP</CardTitle>
            <CardDescription>
              Enter the 6-digit code sent to {phoneNumber}
            </CardDescription>
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

            <Button
              className="w-full"
              disabled={otpCode.length !== 6 || isSubmitting}
              onClick={handleVerifyOtp}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verify & Continue
            </Button>

            <div className="text-center space-y-2">
              <button
                type="button"
                className="text-sm text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                onClick={handleResendOtp}
                disabled={resendTimer > 0 || isSubmitting}
              >
                {resendTimer > 0 ? `Resend OTP in ${resendTimer}s` : "Resend OTP"}
              </button>
              <br />
              <button
                type="button"
                className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
                onClick={handleBackToPhone}
              >
                <ArrowLeft className="h-3 w-3" />
                Change phone number
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
          <CardTitle className="text-2xl">{isLogin ? "Welcome Back" : "Join Elabazar"}</CardTitle>
          <CardDescription>
            {isLogin
              ? "Enter your mobile number to continue"
              : "Create an account using your referral code"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLogin ? (
            <form onSubmit={loginForm.handleSubmit(handleSendLoginOtp)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Mobile Number</Label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">
                    +91
                  </span>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="9876543210"
                    className="rounded-l-none"
                    maxLength={10}
                    {...loginForm.register("phone")}
                  />
                </div>
                {loginForm.formState.errors.phone && (
                  <p className="text-sm text-destructive">{loginForm.formState.errors.phone.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Phone className="mr-2 h-4 w-4" />
                Send OTP
              </Button>
            </form>
          ) : (
            <form onSubmit={signupForm.handleSubmit(handleSendSignupOtp)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="referralCode">Referral Code *</Label>
                <Input
                  id="referralCode"
                  placeholder="Enter your referral code"
                  className={referralCodeValid === true ? "border-green-500" : referralCodeValid === false ? "border-destructive" : ""}
                  {...signupForm.register("referralCode", {
                    onChange: (e) => validateReferralCode(e.target.value)
                  })}
                />
                {checkingCode && <p className="text-sm text-muted-foreground">Checking code...</p>}
                {referralCodeValid === true && <p className="text-sm text-green-600">Valid referral code!</p>}
                {referralCodeValid === false && <p className="text-sm text-destructive">Invalid or inactive referral code</p>}
                {signupForm.formState.errors.referralCode && (
                  <p className="text-sm text-destructive">{signupForm.formState.errors.referralCode.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  placeholder="Your full name"
                  {...signupForm.register("fullName")}
                />
                {signupForm.formState.errors.fullName && (
                  <p className="text-sm text-destructive">{signupForm.formState.errors.fullName.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="signupPhone">Mobile Number</Label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">
                    +91
                  </span>
                  <Input
                    id="signupPhone"
                    type="tel"
                    placeholder="9876543210"
                    className="rounded-l-none"
                    maxLength={10}
                    {...signupForm.register("phone")}
                  />
                </div>
                {signupForm.formState.errors.phone && (
                  <p className="text-sm text-destructive">{signupForm.formState.errors.phone.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting || referralCodeValid !== true}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Phone className="mr-2 h-4 w-4" />
                Send OTP
              </Button>
            </form>
          )}

          <div className="mt-6 text-center">
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => {
                setIsLogin(!isLogin);
                loginForm.reset();
                signupForm.reset();
                setReferralCodeValid(null);
              }}
            >
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
