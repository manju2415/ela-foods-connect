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
  phone: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
  referralCode: z.string().trim().min(1, "Referral code is required"),
});

type SignupFormData = z.infer<typeof signupSchema>;

interface AddUserDialogProps {
  defaultReferralCode?: string;
  onUserAdded?: () => void;
  trigger?: React.ReactNode;
  showCodeSelector?: boolean;
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
      phone: "",
      referralCode: defaultReferralCode || "",
    },
  });

  useEffect(() => {
    if (open) {
      const initialCode = defaultReferralCode || "";
      form.reset({
        fullName: "",
        phone: "",
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

    const currentSessionData = await supabase.auth.getSession();
    const currentSession = currentSessionData.data?.session;

    suppressAuthChanges(true);

    try {
      const fullPhone = `+91${data.phone}`;
      
      // Use signInWithOtp to create/register the user via phone
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: fullPhone,
        options: {
          data: {
            full_name: data.fullName,
            referral_code: data.referralCode.toUpperCase(),
          },
        },
      });

      if (otpError) {
        setIsSubmitting(false);
        suppressAuthChanges(false);
        toast({
          title: "Registration failed",
          description: otpError.message,
          variant: "destructive",
        });
        return;
      }

      // Restore the original user's session
      if (currentSession?.refresh_token) {
        await supabase.auth.setSession({
          access_token: currentSession.access_token,
          refresh_token: currentSession.refresh_token,
        });
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } finally {
      suppressAuthChanges(false);
    }

    setIsSubmitting(false);
    toast({
      title: "OTP sent to user!",
      description: `${data.fullName} will receive an OTP on +91 ${data.phone} to complete registration.`,
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
            Add a new user to your network. They will receive an OTP to verify their phone number.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="referralCode">Referral Code</Label>
            {showCodeSelector && !defaultReferralCode ? (
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
                {...form.register("phone")}
              />
            </div>
            {form.formState.errors.phone && (
              <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
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
