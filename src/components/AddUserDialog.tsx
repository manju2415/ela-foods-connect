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
import { ContactPickerDialog } from "@/components/ContactPickerDialog";
import {
  isContactPickerAvailable,
  isNativeContacts,
  pickContactNative,
  pickContactWeb,
  type PickedContact,
} from "@/lib/contacts";
import {
  UserPlus,
  Loader2,
  Check,
  X,
  AlertCircle,
  BookUser,
} from "lucide-react";

const signupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name is too long"),
  phone: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
  referralCode: z.string().trim().min(1, "Referral code is required"),
});

type SignupFormData = z.infer<typeof signupSchema>;

interface AddUserDialogProps {
  onUserAdded?: () => void;
  trigger?: React.ReactNode;
  isAdmin?: boolean;
}

export function AddUserDialog({
  onUserAdded,
  trigger,
  isAdmin = false,
}: AddUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [referralCodeValid, setReferralCodeValid] = useState<boolean | null>(
    null,
  );
  const [checkingCode, setCheckingCode] = useState(false);
  const [myCode, setMyCode] = useState<string | null>(null);
  const [loadingMyCode, setLoadingMyCode] = useState(false);
  const [selectedAdminCode, setSelectedAdminCode] = useState("");
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [duplicate, setDuplicate] = useState<{
    name: string | null;
    isSelf: boolean;
  } | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  const { user } = useAuth();
  const { toast } = useToast();

  const form = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      referralCode: "",
    },
  });

  // Reset the form only when the dialog actually opens, not on every
  // re-render while it's open (e.g. a Supabase session refresh after
  // returning from the native contact picker hands back a new `user`
  // object reference and must not wipe in-progress input).
  useEffect(() => {
    if (!open) return;

    form.reset({ fullName: "", phone: "", referralCode: "" });
    setReferralCodeValid(null);
    setDuplicate(null);
    setSelectedAdminCode("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fetch logged-in user's own referral code on dialog open (for non-admin).
  // Keyed on user?.id (stable across token refreshes) rather than the user
  // object itself, so this doesn't re-run and clobber the form mid-entry.
  const userId = user?.id;
  useEffect(() => {
    if (!open || isAdmin || !userId) return;

    setLoadingMyCode(true);
    supabase
      .from("referral_codes")
      .select("code")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.code) {
          setMyCode(data.code);
          form.setValue("referralCode", data.code);
          setReferralCodeValid(true);
        } else {
          setMyCode(null);
        }
        setLoadingMyCode(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isAdmin, userId]);

  const contactPickerSupported = isContactPickerAvailable();

  const pickFromContacts = async () => {
    if (isNativeContacts()) {
      try {
        const contact = await pickContactNative();
        if (contact) {
          if (!contact.phone) {
            toast({
              title: "No mobile number",
              description: "That contact has no valid 10-digit number.",
              variant: "destructive",
            });
            return;
          }
          applyContact(contact);
          return;
        }
        return;
      } catch {
        // System picker unavailable — fall back to the in-app list
        setContactPickerOpen(true);
        return;
      }
    }
    try {
      const contact = await pickContactWeb();
      if (!contact) return;
      applyContact(contact);
    } catch {
      toast({
        title: "Could not read contacts",
        description: "Please enter the number manually.",
        variant: "destructive",
      });
    }
  };

  const applyContact = (contact: PickedContact) => {
    if (contact.phone.length === 10)
      form.setValue("phone", contact.phone, { shouldValidate: true });
    if (contact.name)
      form.setValue("fullName", contact.name, { shouldValidate: true });
  };

  // Duplicate detection: flag numbers that already belong to a registered user
  const watchedPhone = form.watch("phone");
  useEffect(() => {
    const digits = (watchedPhone || "").replace(/\D/g, "");
    if (digits.length !== 10) {
      setDuplicate(null);
      return;
    }
    let cancelled = false;
    setCheckingDuplicate(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await supabase.functions.invoke("check-phones-batch", {
          body: { phones: [digits] },
        });
        if (cancelled) return;
        const hit = data?.registered?.[digits];
        setDuplicate(hit ? { name: hit.name, isSelf: hit.is_self } : null);
      } catch {
        if (!cancelled) setDuplicate(null);
      } finally {
        if (!cancelled) setCheckingDuplicate(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
      setCheckingDuplicate(false);
    };
  }, [watchedPhone]);

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

  const handleAdminCodeChange = (code: string) => {
    setSelectedAdminCode(code);
    form.setValue("referralCode", code);
    validateReferralCode(code);
  };

  const handleSubmit = async (data: SignupFormData) => {
    if (!referralCodeValid) {
      toast({
        title: "Invalid referral code",
        description: "Please enter a valid referral code.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: result, error } = await supabase.functions.invoke(
        "add-network-user",
        {
          body: {
            phone: data.phone,
            full_name: data.fullName,
            referral_code: data.referralCode.toUpperCase(),
            added_by_user_id: user?.id || null,
          },
        },
      );

      if (error) {
        let errorMessage = "An error occurred. Please try again.";
        try {
          if (
            "context" in error &&
            (error as any).context instanceof Response
          ) {
            const body = await (error as any).context.json();
            if (body?.error) errorMessage = body.error;
          } else if ((error as any).message) {
            errorMessage = (error as any).message;
          }
        } catch {}
        toast({
          title: "Failed to Invite Friends & Family",
          description: errorMessage,
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      if (result?.error) {
        toast({
          title: "Failed to Invite Friends & Family",
          description: result.error,
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      toast({
        title: "User Added Successfully!",
        description: `${data.fullName} can now login with +91 ${data.phone}. They will be directed to complete registration on first login.`,
      });
      setOpen(false);
      onUserAdded?.();
    } catch (err) {
      console.error("Invite Friends & Family error:", err);
      toast({
        title: "Error",
        description: "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }

    setIsSubmitting(false);
  };

  const renderReferralField = () => {
    // Admin mode: show selector
    if (isAdmin) {
      return (
        <div className="space-y-2">
          <Label>Referral Code</Label>
          <ReferralCodeSelector
            value={selectedAdminCode}
            onChange={handleAdminCodeChange}
            placeholder="Search and select referral code..."
          />
          {referralCodeValid === true && (
            <p className="text-sm text-green-600">Valid referral code</p>
          )}
          {referralCodeValid === false && (
            <p className="text-sm text-destructive">Invalid or inactive code</p>
          )}
        </div>
      );
    }

    // Member mode: auto-resolve own code
    if (loadingMyCode) {
      return (
        <div className="space-y-2">
          <Label>Referral Code</Label>
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your referral
            code...
          </div>
        </div>
      );
    }

    if (!myCode) {
      return (
        <div className="space-y-2">
          <Label>Referral Code</Label>
          <div className="flex items-center gap-2 text-destructive text-sm py-2">
            <AlertCircle className="h-4 w-4" />
            You don't have a referral code yet. Please contact support or
            generate one from your dashboard.
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <Label>Referral Code</Label>
        <div className="relative">
          <Input
            value={myCode}
            readOnly
            className="border-green-500 pr-10 bg-muted"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Check className="h-4 w-4 text-green-600" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Your referral code (auto-selected)
        </p>
      </div>
    );
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
          <DialogTitle>Add New User</DialogTitle>
          <DialogDescription>
            Add a new user to your network. They can login with their mobile
            number and will be asked to complete registration.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          {renderReferralField()}
          {form.formState.errors.referralCode && (
            <p className="text-sm text-destructive">
              {form.formState.errors.referralCode.message}
            </p>
          )}

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
            <div className="flex items-center justify-between">
              <Label htmlFor="phone">Mobile Number</Label>
              {contactPickerSupported && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={pickFromContacts}
                >
                  <BookUser className="h-4 w-4 mr-1" />
                  From contacts
                </Button>
              )}
            </div>
            <div className="flex">
              <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">
                +91
              </span>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                placeholder="Enter 10-digit mobile number"
                className="rounded-l-none"
                maxLength={10}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                {...form.register("phone")}
              />
            </div>
            {form.formState.errors.phone && (
              <p className="text-sm text-destructive">
                {form.formState.errors.phone.message}
              </p>
            )}
            {checkingDuplicate && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Checking if this
                number is already registered...
              </p>
            )}
            {duplicate && !checkingDuplicate && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {duplicate.isSelf
                  ? "This is your own number."
                  : `Already registered${duplicate.name ? ` as ${duplicate.name}` : ""}.`}
              </p>
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
              disabled={
                isSubmitting ||
                referralCodeValid !== true ||
                (!isAdmin && !myCode) ||
                !!duplicate ||
                checkingDuplicate
              }
            >
              {isSubmitting && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Invite Friends & Family
            </Button>
          </div>
        </form>
      </DialogContent>
      {contactPickerOpen && (
        <ContactPickerDialog
          open={contactPickerOpen}
          onOpenChange={setContactPickerOpen}
          onSelect={applyContact}
        />
      )}
    </Dialog>
  );
}
