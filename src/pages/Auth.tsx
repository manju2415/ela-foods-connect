import { useMemo, useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
import { Capacitor } from "@capacitor/core";
import { fetchRegistrationEnabled, useRegistrationEnabled } from "@/hooks/useRegistrationEnabled";

// Only the App Store review demo number skips SMS; the server
// (verify-otp-login) accepts the fixed code for this number alone.
const TEST_PHONES = ["9999000005"];
const TEST_OTP = "000000";
const RESEND_COOLDOWN_SECONDS = 30;

const isTestPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return TEST_PHONES.some((p) => digits === p || digits === `91${p}`);
};

// Remembers the last mobile number typed on this device so returning users
// don't have to re-type it every time they open the login screen.
const LAST_PHONE_STORAGE_KEY = "ela_last_login_phone";

const checkPhoneRegistered = async (phone: string): Promise<boolean> => {
  const { data, error } = await supabase.functions.invoke("check-phone-registered", { body: { phone, source: "app" } });
  if (error) {
    console.error("[Auth] check-phone-registered error:", error);
    return false;
  }
  return !!data?.registered;
};

const sendOtpViaMsg91 = async (phone: string) => {
  if (isTestPhone(phone)) return { success: true as const };
  const { data, error } = await supabase.functions.invoke("msg91-send-otp", { body: { phone } });
  console.log("[Auth] msg91-send-otp response:", { data, error });
  if (error) {
    // FunctionsHttpError has the body in error.context
    const ctx = (error as { context?: { text?: () => Promise<string> } }).context;
    let body: { error?: string } | null = null;
    try { body = ctx && typeof ctx.text === "function" ? JSON.parse(await ctx.text()) : null; } catch { /* body wasn't valid JSON — fall back to the generic error message below */ }
    console.error("[Auth] msg91-send-otp error body:", body);
    return { success: false as const, error: body?.error || error.message || "Failed to send OTP" };
  }
  if (!data?.success) {
    return { success: false as const, error: data?.error || "Failed to send OTP" };
  }
  return { success: true as const, requestId: data.requestId as string | undefined, mobile: data.mobile as string | undefined };
};

const getOtpSentDescription = (phone: string, result: { requestId?: string; mobile?: string }) => {
  if (isTestPhone(phone)) return `Test account — use ${TEST_OTP}`;
  const details = result.requestId ? ` MSG91 ID: ${result.requestId}` : "";
  return `A 6-digit code was accepted by MSG91 for ${phone}.${details}`;
};

const phoneSchema = z.object({
  phone: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
});

const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name is too long"),
  phone: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
  referralCode: z.string().trim().max(20, "Referral code is too long").optional(),
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
  // Registration OFF: optional invite code on the login form. A brand-new
  // number logging in with it is linked to the inviter.
  const [inviteCode, setInviteCode] = useState("");
  const pendingSignupRef = useRef<{ fullName: string; referralCode: string } | null>(null);

  const { user, createSessionForPhone, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast, dismiss } = useToast();
  const { registrationEnabled } = useRegistrationEnabled();

  const redirectTo = useMemo(() => {
    const redirectParam = new URLSearchParams(location.search).get("redirect")?.trim();
    if (redirectParam && redirectParam.startsWith("/")) return redirectParam;
    return null;
  }, [location.search]);

  const loginForm = useForm<PhoneFormData>({
    resolver: zodResolver(phoneSchema),
    defaultValues: {
      phone: (() => {
        try { return localStorage.getItem(LAST_PHONE_STORAGE_KEY) || ""; } catch { return ""; }
      })(),
    },
  });

  // Remember whatever is typed in the login phone field for next time
  const watchedLoginPhone = loginForm.watch("phone");
  useEffect(() => {
    try {
      if (watchedLoginPhone) {
        localStorage.setItem(LAST_PHONE_STORAGE_KEY, watchedLoginPhone);
      } else {
        localStorage.removeItem(LAST_PHONE_STORAGE_KEY);
      }
    } catch { /* storage may be unavailable (private mode / restricted webview) */ }
  }, [watchedLoginPhone]);

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: "", phone: "", referralCode: "" },
  });

  // Prefill referral code from ?ref= in the URL
  useEffect(() => {
    const ref = new URLSearchParams(location.search).get("ref")?.trim();
    if (ref) {
      signupForm.setValue("referralCode", ref.toUpperCase());
      setInviteCode(ref.toUpperCase());
      validateReferralCode(ref);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

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

    if (superAdminRes.data) return "/admin";
    if (mlmAdminRes.data) return "/mlm-admin";
    if (adminRes.data) return "/admin/products";
    if (partnerRes.data) return "/driver-app";
    if ((memberRolesRes.data || []).length > 0) return "/member-app";

    return "/customer-app";
  };

  const validateReferralCode = async (code: string) => {
    if (!code || code.trim().length < 3) {
      setReferralCodeValid(null);
      return;
    }
    setCheckingCode(true);
    latestReferralCodeRef.current = code;
    const { data } = await supabase
      .from("referral_codes")
      .select("id")
      .eq("code", code.toUpperCase())
      .eq("is_active", true)
      .maybeSingle();
    // A later keystroke may have started a newer check while this one was
    // in flight — never let a stale response override the current result.
    if (latestReferralCodeRef.current !== code) return;
    setReferralCodeValid(!!data);
    setCheckingCode(false);
  };

  const referralDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestReferralCodeRef = useRef("");
  const debouncedValidateReferralCode = (code: string) => {
    if (referralDebounceRef.current) clearTimeout(referralDebounceRef.current);
    referralDebounceRef.current = setTimeout(() => validateReferralCode(code), 400);
  };

  const handlePostVerifyRedirect = async (isNewUser: boolean) => {
    // Wait for auth session + RLS context to fully propagate before querying
    await new Promise(r => setTimeout(r, 800));

    // getUser() is a fresh network round-trip; on a flaky mobile connection it
    // can come back empty even though the session was just stored. Fall back
    // to that stored session instead of silently stopping here, which left a
    // successfully signed-in user stuck on the OTP screen.
    const { data: { user: fetchedUser } } = await supabase.auth.getUser();
    const verifiedUser = fetchedUser ?? (await supabase.auth.getSession()).data.session?.user;
    if (!verifiedUser) {
      toast({ title: "Could not finish signing in", description: "Please try again.", variant: "destructive" });
      return;
    }

    const { data: partnerData } = await supabase
      .from("delivery_partners")
      .select("id")
      .eq("user_id", verifiedUser.id)
      .maybeSingle();

    if (partnerData) {
      navigate(redirectTo || "/driver-app", { replace: true });
      return;
    }

    // Registration switched off by super admin: logging in is enough — no
    // details form or registration fee; the address is taken at checkout.
    const registrationEnabled = await fetchRegistrationEnabled();

    if (isNewUser && registrationEnabled) {
      navigate("/complete-registration");
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("phone, accepted_agreement_at, registration_fee_paid, user_level")
      .eq("id", verifiedUser.id)
      .single();

    // Only true admins skip the onboarding gates. Founders and members
    // must still complete profile + registration payment on first login.
    const { data: adminRoleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", verifiedUser.id)
      .in("role", ["super_admin", "admin", "mlm_admin"])
      .limit(1)
      .maybeSingle();

    const isAdmin = !!adminRoleData;
    const isProfileComplete = !!profileData?.phone && !!profileData?.accepted_agreement_at;
    const isPaymentComplete = (profileData?.registration_fee_paid || 0) > 0;

    if (registrationEnabled && !isAdmin && !isProfileComplete) {
      navigate("/complete-registration", { replace: true });
      return;
    }

    if (registrationEnabled && !isAdmin && !isPaymentComplete) {
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
    if (!registrationEnabled && inviteCode.trim() && checkingCode) {
      toast({ title: "Still checking invite code", description: "Please wait a moment and try again." });
      return;
    }
    if (!registrationEnabled && inviteCode.trim() && referralCodeValid === false) {
      toast({ title: "Invalid invite code", description: "Remove it or enter a valid code to continue.", variant: "destructive" });
      return;
    }
    dismiss(); // clear any leftover error from a previous attempt
    setIsSubmitting(true);
    setHasAttemptedLogin(true);
    hasAttemptedLoginRef.current = true;
    await signOut();

    const fullPhone = `+91${data.phone}`;

    // Pre-check (mobile app only): only registered phones may receive OTP.
    // Web/desktop keeps the existing open OTP flow.
    if (Capacitor.isNativePlatform()) {
      const registered = await checkPhoneRegistered(fullPhone);
      if (!registered) {
        setIsSubmitting(false);
        toast({
          title: "Login blocked",
          description: "You are not added by any member. Please contact admin.",
          variant: "destructive",
        });
        return;
      }
    }

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
      description: getOtpSentDescription(fullPhone, result),
    });
  };

  // ── Send OTP (Signup) ──
  const handleSendSignupOtp = async (data: SignupFormData) => {
    if (data.referralCode?.trim() && checkingCode) {
      toast({ title: "Still checking referral code", description: "Please wait a moment and try again." });
      return;
    }
    if (data.referralCode?.trim() && referralCodeValid === false) {
      toast({ title: "Invalid referral code", description: "Remove it or enter a valid code to continue.", variant: "destructive" });
      return;
    }

    dismiss(); // clear any leftover error from a previous attempt
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

    pendingSignupRef.current = { fullName: data.fullName, referralCode: (data.referralCode || "").trim().toUpperCase() };
    setPhoneNumber(fullPhone);
    setStep("otp");
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    toast({
      title: "OTP Sent",
      description: getOtpSentDescription(fullPhone, result),
    });
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || !phoneNumber) return;
    dismiss(); // clear any leftover error from a previous attempt
    setIsSubmitting(true);
    const result = await sendOtpViaMsg91(phoneNumber);
    setIsSubmitting(false);
    if (!result.success) {
      toast({ title: "Failed to resend OTP", description: result.error, variant: "destructive" });
      return;
    }
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    // A resend invalidates the previous code on the provider's side — clear
    // whatever digits were typed so a stale, now-rejected code can't be
    // submitted by mistake.
    setOtpCode("");
    toast({ title: "OTP Resent", description: getOtpSentDescription(phoneNumber, result) });
  };

  // ── Verify OTP ──
  // The code is verified once, server-side, inside createSessionForPhone
  // (verify-otp-login) — no separate client-side pre-check. Checking it
  // twice against MSG91 consumed the code before session creation and made
  // slow devices fail signup/login (same bug already fixed in Signup.tsx).
  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) return;

    dismiss(); // clear any leftover error from a previous attempt
    setIsSubmitting(true);
    try {
      const { error, isNewUser } = await createSessionForPhone(
        phoneNumber,
        otpCode,
        pendingSignupRef.current || undefined,
        !registrationEnabled && inviteCode.trim() ? inviteCode.trim().toUpperCase() : undefined
      );
      if (error) {
        toast({ title: "Login failed", description: error.message, variant: "destructive" });
        return;
      }

      pendingSignupRef.current = null;

      toast({ title: isNewUser ? "Account created!" : "Welcome back!", description: "You have logged in successfully." });
      try {
        await handlePostVerifyRedirect(isNewUser || false);
      } catch (redirectErr) {
        // Already signed in — only working out where to send them failed.
        // Hand off to the same role-based redirect used when a logged-in user
        // opens /auth, rather than leaving them on the OTP screen.
        console.error("[Auth] post-login redirect failed:", redirectErr);
        hasAttemptedLoginRef.current = false;
        setHasAttemptedLogin(false);
      }
    } catch (err) {
      // A network hiccup here must never leave the verify button stuck
      // spinning forever.
      console.error("[Auth] OTP verification failed unexpectedly:", err);
      toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
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
              : "Create an account — referral code is optional"}
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
                    placeholder="Enter 10-digit mobile number"
                    className="rounded-l-none"
                    maxLength={10}
                    {...loginForm.register("phone")}
                  />
                </div>
                {loginForm.formState.errors.phone && (
                  <p className="text-sm text-destructive">{loginForm.formState.errors.phone.message}</p>
                )}
              </div>

              {!registrationEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="inviteCode">Invite Code (optional)</Label>
                  <Input
                    id="inviteCode"
                    placeholder="Enter invite code if you have one"
                    value={inviteCode}
                    className={inviteCode.trim() && referralCodeValid === true ? "border-green-500" : inviteCode.trim() && referralCodeValid === false ? "border-destructive" : ""}
                    onChange={(e) => {
                      setInviteCode(e.target.value.toUpperCase());
                      debouncedValidateReferralCode(e.target.value);
                    }}
                  />
                  {inviteCode.trim() && checkingCode && <p className="text-sm text-muted-foreground">Checking code...</p>}
                  {inviteCode.trim() && referralCodeValid === true && <p className="text-sm text-green-600">Valid invite code!</p>}
                  {inviteCode.trim() && referralCodeValid === false && <p className="text-sm text-destructive">Invalid or inactive invite code</p>}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Phone className="mr-2 h-4 w-4" />
                Send OTP
              </Button>
              {registrationEnabled ? (
                <p className="text-center text-sm text-muted-foreground">
                  New to Elabazar?{" "}
                  <Link to={`/signup${location.search}`} className="text-primary hover:underline">Create an account</Link>
                </p>
              ) : (
                <p className="text-center text-sm text-muted-foreground">
                  New to Elabazar? Just enter your mobile number to start shopping.
                </p>
              )}
            </form>
          ) : (
            <form onSubmit={signupForm.handleSubmit(handleSendSignupOtp)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="referralCode">Referral Code (optional)</Label>
                <Input
                  id="referralCode"
                  placeholder="Enter referral code if you have one"
                  className={referralCodeValid === true ? "border-green-500" : referralCodeValid === false ? "border-destructive" : ""}
                  {...signupForm.register("referralCode", {
                    onChange: (e) => debouncedValidateReferralCode(e.target.value)
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
                    placeholder="Enter 10-digit mobile number"
                    className="rounded-l-none"
                    maxLength={10}
                    {...signupForm.register("phone")}
                  />
                </div>
                {signupForm.formState.errors.phone && (
                  <p className="text-sm text-destructive">{signupForm.formState.errors.phone.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Phone className="mr-2 h-4 w-4" />
                Send OTP
              </Button>
            </form>
          )}

          {(registrationEnabled || !isLogin) && <div className="mt-6 text-center">
            <span className="text-sm text-muted-foreground">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
            </span>
            <button
              type="button"
              className="text-sm font-medium text-primary hover:underline"
              onClick={() => {
                if (isLogin) {
                  navigate(`/signup${location.search}`);
                  return;
                }
                setIsLogin(!isLogin);
                loginForm.reset();
                signupForm.reset();
                setReferralCodeValid(null);
              }}
            >
              {isLogin ? "Sign up" : "Log in"}
            </button>
          </div>}

          {Capacitor.isNativePlatform() && (
            <div className="mt-4 text-center">
              <button
                type="button"
                className="text-sm font-medium text-primary hover:underline"
                onClick={() => navigate("/customer-app", { replace: true })}
              >
                Browse products without signing in
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
