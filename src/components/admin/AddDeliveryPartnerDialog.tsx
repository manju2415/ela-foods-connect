import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const existingUserSchema = z.object({
  phone: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
  vehicleType: z.string().optional(),
  vehicleNumber: z.string().optional(),
});

const newUserSchema = z.object({
  fullName: z.string().trim().min(2, "Name must be at least 2 characters"),
  phone: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
  vehicleType: z.string().optional(),
  vehicleNumber: z.string().optional(),
});

type ExistingUserData = z.infer<typeof existingUserSchema>;
type NewUserData = z.infer<typeof newUserSchema>;

interface AddDeliveryPartnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddDeliveryPartnerDialog({ open, onOpenChange }: AddDeliveryPartnerDialogProps) {
  const [tab, setTab] = useState<"existing" | "new">("existing");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const existingForm = useForm<ExistingUserData>({
    resolver: zodResolver(existingUserSchema),
    defaultValues: { phone: "", vehicleType: "", vehicleNumber: "" },
  });

  const newUserForm = useForm<NewUserData>({
    resolver: zodResolver(newUserSchema),
    defaultValues: { fullName: "", phone: "", vehicleType: "", vehicleNumber: "" },
  });

  const handleExistingUser = async (data: ExistingUserData) => {
    setIsSubmitting(true);
    try {
      const fullPhone = `+91${data.phone}`;
      // Find user by phone
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("phone", fullPhone)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) {
        toast.error("User not found with this phone number. Try creating a new user.");
        setIsSubmitting(false);
        return;
      }

      // Check if already a delivery partner
      const { data: existing } = await supabase
        .from("delivery_partners")
        .select("id")
        .eq("user_id", profile.id)
        .maybeSingle();

      if (existing) {
        toast.error("User is already a delivery partner");
        setIsSubmitting(false);
        return;
      }

      // Add delivery partner role
      await supabase
        .from("user_roles")
        .insert({ user_id: profile.id, role: "delivery_partner" });

      // Create delivery partner record
      const { error } = await supabase
        .from("delivery_partners")
        .insert({
          user_id: profile.id,
          vehicle_type: data.vehicleType || null,
          vehicle_number: data.vehicleNumber || null,
        });

      if (error) throw error;

      toast.success("Delivery partner added successfully");
      queryClient.invalidateQueries({ queryKey: ["delivery-partners"] });
      onOpenChange(false);
      existingForm.reset();
   } catch (error: unknown) {
  toast.error(
    error instanceof Error
      ? error.message
      : "Failed to add delivery partner"
  );
} finally {
      setIsSubmitting(false);
    }
  };

  const handleNewUser = async (data: NewUserData) => {
    setIsSubmitting(true);
    try {
      const fullPhone = `+91${data.phone}`;
      const { data: result, error } = await supabase.functions.invoke('create-delivery-partner', {
        body: {
          phone: fullPhone,
          fullName: data.fullName,
          vehicleType: data.vehicleType,
          vehicleNumber: data.vehicleNumber,
        },
      });

      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      toast.success(
        `Delivery partner created! They can login with +91 ${data.phone} via OTP.`,
        { duration: 10000 }
      );
      queryClient.invalidateQueries({ queryKey: ["delivery-partners"] });
      onOpenChange(false);
      newUserForm.reset();
    } catch (error: unknown) {
  toast.error(
    error instanceof Error
      ? error.message
      : "Failed to create delivery partner"
  );
} finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    existingForm.reset();
    newUserForm.reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Delivery Partner</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "existing" | "new")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="existing">Existing User</TabsTrigger>
            <TabsTrigger value="new">Create New User</TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="space-y-4 mt-4">
            <form onSubmit={existingForm.handleSubmit(handleExistingUser)} className="space-y-4">
              <div className="space-y-2">
                <Label>Mobile Number</Label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">
                    +91
                  </span>
                  <Input
                    type="tel"
                    placeholder="9876543210"
                    className="rounded-l-none"
                    maxLength={10}
                    {...existingForm.register("phone")}
                  />
                </div>
                {existingForm.formState.errors.phone && (
                  <p className="text-sm text-destructive">{existingForm.formState.errors.phone.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Vehicle Type</Label>
                <Input
                  placeholder="e.g., Bike, Car, Van"
                  {...existingForm.register("vehicleType")}
                />
              </div>
              <div className="space-y-2">
                <Label>Vehicle Number</Label>
                <Input
                  placeholder="e.g., MH-12-AB-1234"
                  {...existingForm.register("vehicleNumber")}
                />
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Partner
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="new" className="space-y-4 mt-4">
            <form onSubmit={newUserForm.handleSubmit(handleNewUser)} className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input
                  placeholder="Driver's full name"
                  {...newUserForm.register("fullName")}
                />
                {newUserForm.formState.errors.fullName && (
                  <p className="text-sm text-destructive">{newUserForm.formState.errors.fullName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Mobile Number *</Label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">
                    +91
                  </span>
                  <Input
                    type="tel"
                    placeholder="9876543210"
                    className="rounded-l-none"
                    maxLength={10}
                    {...newUserForm.register("phone")}
                  />
                </div>
                {newUserForm.formState.errors.phone && (
                  <p className="text-sm text-destructive">{newUserForm.formState.errors.phone.message}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Vehicle Type</Label>
                  <Input
                    placeholder="Bike, Car..."
                    {...newUserForm.register("vehicleType")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Vehicle Number</Label>
                  <Input
                    placeholder="MH-12-AB-1234"
                    {...newUserForm.register("vehicleNumber")}
                  />
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create & Add
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
