import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MobileAppLayout } from "@/components/mobile/MobileAppLayout";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { PullToRefresh } from "@/components/mobile/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { User, Mail, Phone, MapPin, LogOut, ChevronRight, Heart, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EnableNotificationsButton } from "@/components/mobile/EnableNotificationsButton";

interface Profile {
  full_name: string | null;
  email: string;
  phone: string | null;
}

export default function CustomerProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({ full_name: "", phone: "" });
  const [saving, setSaving] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from("profiles")
      .select("full_name, email, phone")
      .eq("id", user.id)
      .maybeSingle();
    
    if (data) {
      setProfile(data);
      setFormData({
        full_name: data.full_name || "",
        phone: data.phone || "",
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const { isPulling, isRefreshing, pullDistance, pullProgress, shouldTrigger, handlers } = usePullToRefresh({
    onRefresh: fetchProfile,
  });

  const handleSave = async () => {
    if (!user) return;
    
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: formData.full_name,
      })
      .eq("id", user.id);

    if (error) {
      toast.error("Failed to update profile");
    } else {
      toast.success("Profile updated");
      setEditing(false);
      fetchProfile();
    }
    setSaving(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth?redirect=/customer-app", { replace: true });
  };

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    }
    return profile?.email?.[0]?.toUpperCase() || "U";
  };

  if (!user) {
    return (
      <MobileAppLayout appType="customer">
      <div className="min-h-screen bg-background">
        <MobileHeader title="Profile" showBack showLogin />
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
          <User className="h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-lg font-medium mb-2">Sign in to view profile</h2>
          <Button onClick={() => navigate("/auth?redirect=/customer-app/profile")}>
            Sign In
          </Button>
        </div>
      </div>
      </MobileAppLayout>
    );
  }

  return (
    <MobileAppLayout appType="customer">
    <div className="min-h-screen bg-background">
      <MobileHeader title="Profile" showBack />
      
      <PullToRefresh
        isPulling={isPulling}
        isRefreshing={isRefreshing}
        pullDistance={pullDistance}
        pullProgress={pullProgress}
        shouldTrigger={shouldTrigger}
        handlers={handlers}
      >
        <div className="p-4 space-y-4">
          {/* Profile Header */}
          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold truncate">
                  {profile?.full_name || "User"}
                </h2>
                <p className="text-sm text-muted-foreground truncate">
                  {profile?.email}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Edit Profile */}
          {editing ? (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={formData.full_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={formData.phone} disabled />
                  <p className="text-xs text-muted-foreground">
                    Your phone number is your login ID and can't be changed here. Contact support if it needs to change.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button className="flex-1" onClick={handleSave} disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 divide-y">
                <div className="flex items-center gap-3 p-4">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{profile?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-4">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{profile?.phone || "Not set"}</p>
                  </div>
                </div>
                <button
                  onClick={() => setEditing(true)}
                  className="w-full text-center py-3 text-primary font-medium"
                >
                  Edit Profile
                </button>
              </CardContent>
            </Card>
          )}

          {/* Quick Links */}
          <Card>
            <CardContent className="p-0 divide-y">
              <button
                onClick={() => navigate("/customer-app/addresses")}
                className="flex items-center gap-3 p-4 w-full text-left"
              >
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1">My Addresses</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
              <button
                onClick={() => navigate("/dashboard?tab=wishlist")}
                className="flex items-center gap-3 p-4 w-full text-left"
              >
                <Heart className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1">Wishlist</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
              <button
                onClick={() => navigate("/dashboard?tab=settings")}
                className="flex items-center gap-3 p-4 w-full text-left"
              >
                <Settings className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1">Settings</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
            </CardContent>
          </Card>

          <EnableNotificationsButton />

          {/* Sign Out */}
          <Button
            variant="outline"
            className="w-full text-destructive hover:text-destructive"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>

          {/* Delete Account */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="w-full text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-destructive transition-colors py-2">
                <Trash2 className="h-3.5 w-3.5 inline mr-1" />
                Request Account Deletion
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will send a request to permanently delete your account and all associated data including order history, wallet balance, and network information. This action cannot be undone. Our team will process your request within 7 working days.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async () => {
                    if (!user) return;
                    try {
                      // Notify admin staff, not the requester's own feed —
                      // otherwise the request is never seen by anyone who
                      // can act on it.
                      await supabase.rpc("notify_admins", {
                        p_title: "Account Deletion Requested",
                        p_message: `User ${profile?.full_name || profile?.email} (${profile?.phone || 'no phone'}) has requested account deletion.`,
                        p_type: "warning",
                        p_reference_type: "account_deletion",
                        p_reference_id: user.id,
                      });
                      toast.success("Account deletion request submitted. Our team will contact you shortly.");
                    } catch {
                      toast.error("Failed to submit request. Please contact support.");
                    }
                  }}
                >
                  Yes, delete my account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </PullToRefresh>
    </div>
    </MobileAppLayout>
  );
}
