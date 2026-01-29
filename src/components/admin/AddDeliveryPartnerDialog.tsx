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
  email: z.string().trim().email("Please enter a valid email"),
  vehicleType: z.string().optional(),
  vehicleNumber: z.string().optional(),
});

const newUserSchema = z.object({
  fullName: z.string().trim().min(2, "Name must be at least 2 characters"),
  email: z.string().trim().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
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
    defaultValues: { email: "", vehicleType: "", vehicleNumber: "" },
  });

  const newUserForm = useForm<NewUserData>({
    resolver: zodResolver(newUserSchema),
    defaultValues: { fullName: "", email: "", password: "", vehicleType: "", vehicleNumber: "" },
  });

  const handleExistingUser = async (data: ExistingUserData) => {
    setIsSubmitting(true);
    try {
      // Find user by email
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", data.email.toLowerCase())
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) {
        toast.error("User not found with this email. Try creating a new user.");
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
    } catch (error: any) {
      toast.error(error.message || "Failed to add delivery partner");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewUser = async (data: NewUserData) => {
    setIsSubmitting(true);
    try {
      // Use edge function to create user with admin API (auto-confirmed)
      const { data: result, error } = await supabase.functions.invoke('create-delivery-partner', {
        body: {
          email: data.email,
          password: data.password,
          fullName: data.fullName,
          vehicleType: data.vehicleType,
          vehicleNumber: data.vehicleNumber,
        },
      });

      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      toast.success(
        `Delivery partner created! Login: ${data.email} / ${data.password}`,
        { duration: 10000 }
      );
      queryClient.invalidateQueries({ queryKey: ["delivery-partners"] });
      onOpenChange(false);
      newUserForm.reset();
    } catch (error: any) {
      toast.error(error.message || "Failed to create delivery partner");
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
                <Label>User Email</Label>
                <Input
                  placeholder="Enter existing user's email"
                  {...existingForm.register("email")}
                />
                {existingForm.formState.errors.email && (
                  <p className="text-sm text-destructive">{existingForm.formState.errors.email.message}</p>
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
                <Label>Email *</Label>
                <Input
                  type="email"
                  placeholder="driver@example.com"
                  {...newUserForm.register("email")}
                />
                {newUserForm.formState.errors.email && (
                  <p className="text-sm text-destructive">{newUserForm.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Password *</Label>
                <Input
                  type="password"
                  placeholder="Minimum 6 characters"
                  {...newUserForm.register("password")}
                />
                {newUserForm.formState.errors.password && (
                  <p className="text-sm text-destructive">{newUserForm.formState.errors.password.message}</p>
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
