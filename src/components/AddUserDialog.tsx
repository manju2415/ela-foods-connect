import { useState, useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ReferralCodeSelector } from "@/components/ReferralCodeSelector";
import { UserPlus, Loader2, Check, X, Edit2 } from "lucide-react";

const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name is too long"),
  email: z.string().trim().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  referralCode: z.string().trim().min(1, "Referral code is required"),
});

type SignupFormData = z.infer<typeof signupSchema>;

interface AddUserDialogProps {
  defaultReferralCode?: string;
  onUserAdded?: () => void;
  trigger?: React.ReactNode;
  showCodeSelector?: boolean; // Show searchable dropdown for super admin
}

export function AddUserDialog({ defaultReferralCode, onUserAdded, trigger, showCodeSelector = false }: AddUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [referralCodeValid, setReferralCodeValid] = useState<boolean | null>(null);
  const [checkingCode, setCheckingCode] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [selectedCode, setSelectedCode] = useState(defaultReferralCode || "");
  const { suppressAuthChanges } = useAuth();
  const { toast } = useToast();

  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      referralCode: defaultReferralCode || "",
    },
  });

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      const initialCode = defaultReferralCode || "";
      form.reset({
        fullName: "",
        email: "",
        password: "",
        referralCode: initialCode,
      });
      setSelectedCode(initialCode);
      setEditingCode(!defaultReferralCode && !showCodeSelector);
      if (initialCode) {
        validateReferralCode(initialCode);
      } else {
        setReferralCodeValid(null);
      }
    }
  }, [open, defaultReferralCode, showCodeSelector]);

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

  const handleCodeSelectorChange = (code: string) => {
    setSelectedCode(code);
    form.setValue("referralCode", code);
    validateReferralCode(code);
  };

  const handleSubmit = async (data: SignupFormData) => {
    if (!referralCodeValid) {
      toast({
        title: "Invalid referral code",
        description: "Please enter a valid referral code to continue.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    // Save the current session before signing up the new user
    const { data: currentSessionData } = await supabase.auth.getSession();
    const currentSession = currentSessionData?.session;

    // Suppress auth state changes so the current user isn't navigated away
    suppressAuthChanges(true);

    try {
      // Create user through direct signup
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.fullName,
            referral_code: data.referralCode.toUpperCase(),
          },
        },
      });

      if (signUpError) {
        setIsSubmitting(false);
        suppressAuthChanges(false);
        toast({
          title: "Registration failed",
          description: signUpError.message,
          variant: "destructive",
        });
        return;
      }

      // Process MLM referral
      if (signUpData.user) {
        try {
          await supabase.rpc("process_mlm_referral", {
            p_referral_code: data.referralCode.toUpperCase(),
            p_referred_user_id: signUpData.user.id,
            p_registration_fee: 0,
          });
        } catch (err) {
          console.error("Error processing MLM referral:", err);
        }
      }

      // Restore the original user's session so the founder/member stays logged in
      if (currentSession?.refresh_token) {
        await supabase.auth.setSession({
          access_token: currentSession.access_token,
          refresh_token: currentSession.refresh_token,
        });
        // Small delay to let session restoration propagate before re-enabling auth listener
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } finally {
      // Re-enable auth state changes after session is restored
      suppressAuthChanges(false);
    }

    setIsSubmitting(false);
    toast({
      title: "User registered successfully!",
      description: `${data.fullName} has been added to the network.`,
    });
    setOpen(false);
    onUserAdded?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <UserPlus className="h-4 w-4 mr-2" />
            Add New User
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Register New User</DialogTitle>
          <DialogDescription>
            Add a new user to your network. They will be registered under the specified referral code.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="referralCode">Referral Code</Label>
            {showCodeSelector && !defaultReferralCode ? (
              // Searchable dropdown for super admins
              <div>
                <ReferralCodeSelector
                  value={selectedCode}
                  onChange={handleCodeSelectorChange}
                  placeholder="Search and select referral code..."
                />
                {referralCodeValid === true && (
                  <p className="text-sm text-green-600 mt-1">Valid referral code</p>
                )}
                {referralCodeValid === false && (
                  <p className="text-sm text-destructive mt-1">Invalid or inactive code</p>
                )}
              </div>
            ) : (
              // Manual input for regular members
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="referralCode"
                    placeholder="Enter referral code"
                    disabled={!editingCode && !!defaultReferralCode}
                    className={
                      referralCodeValid === true
                        ? "border-green-500 pr-10"
                        : referralCodeValid === false
                        ? "border-destructive pr-10"
                        : "pr-10"
                    }
                    {...form.register("referralCode", {
                      onChange: (e) => validateReferralCode(e.target.value),
                    })}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {checkingCode ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : referralCodeValid === true ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : referralCodeValid === false ? (
                      <X className="h-4 w-4 text-destructive" />
                    ) : null}
                  </div>
                </div>
                {defaultReferralCode && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setEditingCode(!editingCode);
                      if (editingCode) {
                        form.setValue("referralCode", defaultReferralCode);
                        validateReferralCode(defaultReferralCode);
                      }
                    }}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
            {referralCodeValid === true && !showCodeSelector && (
              <p className="text-sm text-green-600">Valid referral code</p>
            )}
            {referralCodeValid === false && !showCodeSelector && (
              <p className="text-sm text-destructive">Invalid or inactive code</p>
            )}
            {form.formState.errors.referralCode && (
              <p className="text-sm text-destructive">{form.formState.errors.referralCode.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name</Label>
            <Input
              id="fullName"
              placeholder="Enter full name"
              {...form.register("fullName")}
            />
            {form.formState.errors.fullName && (
              <p className="text-sm text-destructive">{form.formState.errors.fullName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="email@example.com"
              {...form.register("email")}
            />
            {form.formState.errors.email && (
              <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              {...form.register("password")}
            />
            {form.formState.errors.password && (
              <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isSubmitting || referralCodeValid !== true}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Register User
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
