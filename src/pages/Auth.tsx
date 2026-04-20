import { useMemo, useState, useEffect, useRef } from "react";
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

// Test accounts bypass real SMS for QA. Real users always go through MSG91.
const TEST_PHONES = ["9999000001", "9999000002", "9999000003", "9999000004", "9999000005", "9999000006"];
const TEST_OTP = "000000";
const RESEND_COOLDOWN_SECONDS = 30;

const isTestPhone = (phone: string) => TEST_PHONES.some((p) => phone.endsWith(p));

const sendOtpViaMsg91 = async (phone: string) => {
  if (isTestPhone(phone)) return { success: true as const };
  const { data, error } = await supabase.functions.invoke("msg91-send-otp", { body: { phone } });
  console.log("[Auth] msg91-send-otp response:", { data, error });
  if (error) {
    // FunctionsHttpError has the body in error.context
    const ctx: any = (error as any).context;
    let body: any = null;
    try { body = ctx && typeof ctx.text === "function" ? JSON.parse(await ctx.text()) : null; } catch {}
    console.error("[Auth] msg91-send-otp error body:", body);
    return { success: false as const, error: body?.error || error.message || "Failed to send OTP" };
  }
  if (!data?.success) {
    return { success: false as const, error: data?.error || "Failed to send OTP" };
  }
  return { success: true as const };
};

const verifyOtpViaMsg91 = async (phone: string, otp: string) => {
  if (isTestPhone(phone)) {
    if (otp === TEST_OTP) return { success: true as const };
    return { success: false as const, error: "Invalid OTP" };
  }
  const { data, error } = await supabase.functions.invoke("msg91-verify-otp", { body: { phone, otp } });
  console.log("[Auth] msg91-verify-otp response:", { data, error });
  if (error) {
    const ctx: any = (error as any).context;
    let body: any = null;
    try { body = ctx && typeof ctx.text === "function" ? JSON.parse(await ctx.text()) : null; } catch {}
    console.error("[Auth] msg91-verify-otp error body:", body);
    return { success: false as const, error: body?.error || error.message || "Invalid OTP" };
  }
  if (!data?.success) return { success: false as const, error: data?.error || "Invalid OTP" };
  return { success: true as const };
};

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
  const [resendCooldown, setResendCooldown] = useState(0);
  const [referralCodeValid, setReferralCodeValid] = useState<boolean | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);
  const pendingSignupRef = useRef<{ fullName: string; referralCode: string } | null>(null);

  const { user, createSessionForPhone, signOut } = useAuth();
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
  const hasAttemptedLoginRef = useRef(false);

  useEffect(() => {
    if (user && !hasAttemptedLogin) {
      let cancelled = false;
      resolveRoleRedirect(user.id).then((dest) => {
        if (!cancelled && !hasAttemptedLoginRef.current) {
          navigate(redirectTo ?? dest, { replace: true });
        }
      });
      return () => { cancelled = true; };
    }
  }, [user, navigate, redirectTo, hasAttemptedLogin]);

  const resolveRoleRedirect = async (userId: string): Promise<string> => {
    const [partnerRes, superAdminRes, mlmAdminRes, adminRes, memberRolesRes] = await Promise.all([
      supabase
        .from("delivery_partners")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.rpc("is_super_admin", { _user_id: userId }),
      supabase.rpc("is_mlm_admin", { _user_id: userId }),
      supabase.rpc("is_admin", { _user_id: userId }),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .in("role", ["founding_member", "member"]),
    ]);

    if (partnerRes.data) return "/driver-app";
    if (superAdminRes.data) return "/admin";
    if (mlmAdminRes.data) return "/mlm-admin";
    if (adminRes.data) return "/admin/products";
    if ((memberRolesRes.data || []).length > 0) return "/member-app";

    return "/customer-app";
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
    // Wait for auth session + RLS context to fully propagate before querying
    await new Promise(r => setTimeout(r, 800));

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
      .in("role", ["founding_member", "super_admin", "admin", "member", "mlm_admin"])
      .limit(1)
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

  // ── Send OTP (Login) ──
  const handleSendLoginOtp = async (data: PhoneFormData) => {
    setIsSubmitting(true);
    setHasAttemptedLogin(true);
    hasAttemptedLoginRef.current = true;
    await signOut();

    const fullPhone = `+91${data.phone}`;
    const result = await sendOtpViaMsg91(fullPhone);
    setIsSubmitting(false);

    if (!result.success) {
      toast({ title: "Failed to send OTP", description: result.error, variant: "destructive" });
      return;
    }

    pendingSignupRef.current = null;
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

  // ── Send OTP (Signup) ──
  const handleSendSignupOtp = async (data: SignupFormData) => {
    if (!referralCodeValid) {
      toast({ title: "Invalid referral code", description: "Please enter a valid referral code.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    setHasAttemptedLogin(true);
    hasAttemptedLoginRef.current = true;

    const fullPhone = `+91${data.phone}`;
    const result = await sendOtpViaMsg91(fullPhone);
    setIsSubmitting(false);

    if (!result.success) {
      toast({ title: "Failed to send OTP", description: result.error, variant: "destructive" });
      return;
    }

    pendingSignupRef.current = { fullName: data.fullName, referralCode: data.referralCode };
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

  // ── Verify OTP ──
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

    const { error, isNewUser } = await createSessionForPhone(
      phoneNumber,
      pendingSignupRef.current || undefined
    );

    setIsSubmitting(false);
    pendingSignupRef.current = null;

    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: isNewUser ? "Account created!" : "Welcome back!", description: "You have logged in successfully." });
    await handlePostVerifyRedirect(isNewUser || false);
  };

  const handleBackToPhone = () => {
    setStep("phone");
    setOtpCode("");
    setPhoneNumber("");
    setResendCooldown(0);
    setHasAttemptedLogin(false);
    hasAttemptedLoginRef.current = false;
    pendingSignupRef.current = null;
  };

  // Resend cooldown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);


  // ── OTP Verification Screen ──
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

  // ── Phone Entry Screen ──
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
