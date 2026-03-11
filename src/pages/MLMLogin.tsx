import { useState, useEffect, useMemo } from "react";
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
import { Eye, EyeOff, Loader2, Network } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import elaLogo from "@/assets/ela-foods-logo.png";

const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

const MLMLogin = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAttemptedLogin, setHasAttemptedLogin] = useState(false);

  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (user && !hasAttemptedLogin) {
      // Check if admin
      supabase.rpc("is_admin", { _user_id: user.id }).then(({ data }) => {
        if (data) {
          navigate("/mlm-admin", { replace: true });
        }
      });
    }
  }, [user, navigate, hasAttemptedLogin]);

  const handleLogin = async (data: LoginFormData) => {
    setIsSubmitting(true);
    setHasAttemptedLogin(true);

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
      return;
    }

    // Verify admin role
    if (authData?.user) {
      const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: authData.user.id });

      if (!isAdmin) {
        toast({
          title: "Access Denied",
          description: "This login is for MLM managers only.",
          variant: "destructive",
        });
        await supabase.auth.signOut();
        setHasAttemptedLogin(false);
        return;
      }
    }

    toast({ title: "Welcome!", description: "Logged in to Network Manager." });
    navigate("/mlm-admin", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={elaLogo} alt="ELA Foods" className="h-16 w-auto" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            <CardTitle className="text-2xl">Network Manager</CardTitle>
          </div>
          <CardDescription>
            Sign in to the MLM management dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mlm-email">Email</Label>
              <Input
                id="mlm-email"
                type="email"
                placeholder="manager@example.com"
                {...form.register("email")}
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="mlm-password">Password</Label>
              <div className="relative">
                <Input
                  id="mlm-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  {...form.register("password")}
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
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In to Network Manager
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
