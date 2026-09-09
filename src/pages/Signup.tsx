import { useState, useEffect } from "react";
import {
  useNavigate,
  Link,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, UserPlus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { UserAgreementDialog } from "@/components/UserAgreementDialog";

import elaLogo from "@/assets/ela-foods-logo.png";
import { supabase } from "@/integrations/supabase/client";

const DEMO_PHONES = [
  "8888888888",
  "9999000001",
  "9999000002",
  "9999000003",
  "9999000004",
  "9999000005",
  "9999000006",
];
const DEMO_OTP = "000000";
const RESEND_COOLDOWN = 30;

const isDemoPhone = (p: string) => DEMO_PHONES.some((x) => p.endsWith(x));

const signupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100),
  phone: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
  referralCode: z
    .string()
    .trim()
    .max(20, "Referral code is too long")
    .optional(),
});
type SignupData = z.infer<typeof signupSchema>;

const sendOtp = async (phone: string) => {
  if (isDemoPhone(phone)) return { success: true as const };
  const { data, error } = await supabase.functions.invoke("msg91-send-otp", {
    body: { phone },
  });
  if (error || !data?.success) {
    return {
      success: false as const,
      error: data?.error || error?.message || "Failed to send OTP",
    };
  }
  return {
    success: true as const,
    requestId: data.requestId as string | undefined,
  };
};

// The code is verified once, server-side, inside verify-otp-login — there is
// no separate client-side pre-check any more. Checking it twice consumed the
// code before session creation and made slow devices fail signup.



export default function Signup() {
  const [step, setStep] = useState<"form" | "otp">("form");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [otp, setOtp] = useState("");
  const [referralCodeValid, setReferralCodeValid] = useState<boolean | null>(
    null,
  );
  const [referralCode, setReferralCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [agreed, setAgreed] = useState(false);

  const { user, createSessionForPhone, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const locationRoute = useLocation();
  const [searchParams] = useSearchParams();
  const isFounderSignup = locationRoute.pathname === "/founder-signup";

  const form = useForm<SignupData>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: "", phone: "", referralCode: "" },
  });

  const validateReferralCode = async (code: string) => {
    const clean = code.trim().toUpperCase();
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

  useEffect(() => {
    const ref = searchParams.get("ref")?.trim();
    if (ref) {
      form.setValue("referralCode", ref.toUpperCase());
      validateReferralCode(ref);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (user && step === "form")
      navigate("/complete-registration", { replace: true });
  }, [user, step, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const onSubmit = async (data: SignupData) => {
    setSubmitting(true);
    await signOut();
    const full = `+91${data.phone}`;
    const result = await sendOtp(full);
    setSubmitting(false);
    if (!result.success) {
      toast({
        title: "Failed to send OTP",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    setFullName(data.fullName);
    setReferralCode((data.referralCode || "").trim().toUpperCase());
    setPhoneNumber(full);
    setStep("otp");
    setCooldown(RESEND_COOLDOWN);
    toast({
      title: "OTP Sent",
      description: isDemoPhone(full)
        ? `Demo account — use ${DEMO_OTP}`
        : `Sent to ${full}`,
    });
  };

  const handleResend = async () => {
    if (cooldown > 0 || !phoneNumber) return;
    setSubmitting(true);
    const r = await sendOtp(phoneNumber);
    setSubmitting(false);
    if (!r.success) {
      toast({
        title: "Failed to resend OTP",
        description: r.error,
        variant: "destructive",
      });
      return;
    }
    setCooldown(RESEND_COOLDOWN);
    toast({ title: "OTP Resent" });
  };

  const handleVerify = async () => {
    if (otp.length !== 6) return;
    setSubmitting(true);
    setLastError(null);
    try {
      // Create the account server-side (idempotent)
      const { data: created, error: createErr } = await supabase.functions.invoke(
        "signup-create-user",
        {
          body: {
            phone: phoneNumber,
            fullName,
            referralCode,
            founder: isFounderSignup,
          },
        },
      );

      if (createErr || !created?.success) {
        toast({
          title: "Signup failed",
          description:
            created?.error || createErr?.message || "Could not create account.",
          variant: "destructive",
        });
        return;
      }

      // Sign in — the OTP is re-verified server-side atomically with session creation
      const { error } = await createSessionForPhone(phoneNumber, otp);

      if (error) {
        toast({
          title: "Login failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Welcome to Elabazar!",
        description: "Complete your registration and payment.",
      });
      // Small delay so auth context settles, then continue onboarding + payment
      setTimeout(
        () => navigate("/complete-registration", { replace: true }),
        600,
      );
    } catch (err) {
      // A network hiccup here must never leave the verify button stuck spinning.
      console.error("[Signup] OTP verification failed unexpectedly:", err);
      toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
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
            <CardDescription>
              Enter the 6-digit code sent to {phoneNumber}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button
              className="w-full"
              disabled={otp.length !== 6 || submitting}
              onClick={handleVerify}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Account
            </Button>
            <div className="text-center text-sm">
              {cooldown > 0 ? (
                <span className="text-muted-foreground">
                  Resend in {cooldown}s
                </span>
              ) : (
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={handleResend}
                  disabled={submitting}
                >
                  Resend OTP
                </button>
              )}
            </div>
            <div className="text-center">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
                onClick={() => {
                  setStep("form");
                  setOtp("");
                }}
              >
                <ArrowLeft className="h-3 w-3" />
                Change details
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
          <CardTitle className="text-2xl">
            {isFounderSignup ? "Founding Member Signup" : "Create your account"}
          </CardTitle>
          <CardDescription>
            {isFounderSignup
              ? "Sign up as a founding member. A one-time registration fee of ₹4,999 is payable after verification."
              : "Sign up with your mobile number — referral code optional."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                placeholder="Enter full name"
                {...form.register("fullName")}
              />
              {form.formState.errors.fullName && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.fullName.message}
                </p>
              )}
            </div>
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
                  {...form.register("phone")}
                />
              </div>
              {form.formState.errors.phone && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.phone.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="referralCode">Referral Code (optional)</Label>
              <Input
                id="referralCode"
                placeholder="Enter referral code if you have one"
                className={
                  referralCodeValid === true
                    ? "border-green-500"
                    : referralCodeValid === false
                      ? "border-destructive"
                      : ""
                }
                {...form.register("referralCode", {
                  onChange: (e) => validateReferralCode(e.target.value),
                })}
              />
              {referralCodeValid === true && (
                <p className="text-sm text-green-600">Valid referral code!</p>
              )}
              {referralCodeValid === false && (
                <p className="text-sm text-destructive">
                  Invalid or inactive referral code
                </p>
              )}
            </div>

            <div className="flex items-start gap-3 rounded-md border p-3">
              <Checkbox
                id="agreement"
                checked={agreed}
                onCheckedChange={(v) => setAgreed(v === true)}
                className="mt-0.5"
              />
              <Label
                htmlFor="agreement"
                className="text-sm font-normal leading-relaxed"
              >
                I am 18 years or older and I agree to the{" "}
                <UserAgreementDialog />.
              </Label>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !agreed}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <UserPlus className="mr-2 h-4 w-4" />
              Send OTP
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/auth" className="font-medium text-primary hover:underline">
                Log in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
