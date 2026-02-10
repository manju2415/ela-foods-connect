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
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import elaLogo from "@/assets/ela-foods-logo.png";
import { supabase } from "@/integrations/supabase/client";

const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name is too long"),
  email: z.string().trim().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
  referralCode: z.string().trim().min(1, "Referral code is required"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type LoginFormData = z.infer<typeof loginSchema>;
type SignupFormData = z.infer<typeof signupSchema>;

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [referralCodeValid, setReferralCodeValid] = useState<boolean | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);
  
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  // Supports flows like: /auth?redirect=/driver-app
  const redirectTo = useMemo(() => {
    const redirectParam = new URLSearchParams(location.search).get("redirect")?.trim();
    // Prevent open-redirects: only allow internal paths
    if (redirectParam && redirectParam.startsWith("/")) return redirectParam;
    return null;
  }, [location.search]);

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signupForm = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: "", email: "", password: "", confirmPassword: "", referralCode: "" },
  });

  // Only auto-redirect if user is already logged in when they land on this page
  // This prevents the useEffect from racing with handleLogin's navigation
  const [hasAttemptedLogin, setHasAttemptedLogin] = useState(false);
  
  useEffect(() => {
    // If user is logged in and hasn't just attempted login (meaning they arrived already logged in)
    if (user && !hasAttemptedLogin) {
      navigate(redirectTo ?? "/dashboard", { replace: true });
    }
  }, [user, navigate, redirectTo, hasAttemptedLogin]);

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

  const handleLogin = async (data: LoginFormData) => {
    setIsSubmitting(true);
    setHasAttemptedLogin(true);
    
    // Call supabase directly to get the user data for redirect logic
    const { error, data: authData } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    
    setIsSubmitting(false);

    if (error) {
      setHasAttemptedLogin(false);
      toast({
        title: "Login failed",
        description: error.message === "Invalid login credentials" 
          ? "Invalid email or password. Please try again."
          : error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Welcome back!", description: "You have logged in successfully." });
      
      // Check if user is a delivery partner first
      if (authData?.user?.id) {
        const { data: partnerData } = await supabase
          .from("delivery_partners")
          .select("id")
          .eq("user_id", authData.user.id)
          .maybeSingle();
        
        if (partnerData) {
          // Delivery partners skip onboarding flow
          navigate(redirectTo || "/driver-app", { replace: true });
          return;
        }
        
      // Normal users can proceed without completing registration
      // Registration is optional - only needed to become a member
      }
      
      // If there's a specific redirect and user is fully onboarded, use it
      if (redirectTo) {
        navigate(redirectTo, { replace: true });
        return;
      }
      
      // Default to dashboard for fully onboarded users
      navigate("/dashboard", { replace: true });
    }
  };

  const handleSignup = async (data: SignupFormData) => {
    setIsSubmitting(true);
    const { error } = await signUp(data.email, data.password, data.fullName, data.referralCode);
    setIsSubmitting(false);

    if (error) {
      toast({
        title: "Signup failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ 
        title: "Account created!", 
        description: "Complete your registration to unlock member benefits and discounted prices." 
      });
      // Let the user browse; they can complete registration later from dashboard
      navigate("/complete-registration");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={elaLogo} alt="ELA Foods" className="h-16 w-auto" />
          </div>
          <CardTitle className="text-2xl">{isLogin ? "Welcome Back" : "Join ELA Foods"}</CardTitle>
          <CardDescription>
            {isLogin 
              ? "Sign in to your account to continue" 
              : "Create an account using your referral code"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLogin ? (
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  {...loginForm.register("email")}
                />
                {loginForm.formState.errors.email && (
                  <p className="text-sm text-destructive">{loginForm.formState.errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    {...loginForm.register("password")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {loginForm.formState.errors.password && (
                  <p className="text-sm text-destructive">{loginForm.formState.errors.password.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
            </form>
          ) : (
            <form onSubmit={signupForm.handleSubmit(handleSignup)} className="space-y-4">
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
                <Label htmlFor="signupEmail">Email</Label>
                <Input
                  id="signupEmail"
                  type="email"
                  placeholder="you@example.com"
                  {...signupForm.register("email")}
                />
                {signupForm.formState.errors.email && (
                  <p className="text-sm text-destructive">{signupForm.formState.errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="signupPassword">Password</Label>
                <div className="relative">
                  <Input
                    id="signupPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    {...signupForm.register("password")}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {signupForm.formState.errors.password && (
                  <p className="text-sm text-destructive">{signupForm.formState.errors.password.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  {...signupForm.register("confirmPassword")}
                />
                {signupForm.formState.errors.confirmPassword && (
                  <p className="text-sm text-destructive">{signupForm.formState.errors.confirmPassword.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting || referralCodeValid !== true}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Account
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
