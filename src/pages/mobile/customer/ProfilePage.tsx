import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { PullToRefresh } from "@/components/mobile/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { User, Mail, Phone, MapPin, LogOut, ChevronRight, Heart, Settings } from "lucide-react";
import { toast } from "sonner";

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
      .single();
    
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
        phone: formData.phone,
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
    navigate("/customer-app");
  };

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    }
    return profile?.email?.[0]?.toUpperCase() || "U";
  };

  if (!user) {
    return (
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
    );
  }

  return (
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
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  />
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
                onClick={() => navigate("/customer-app/orders")}
                className="flex items-center gap-3 p-4 w-full text-left"
              >
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1">My Addresses</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
              <button
                onClick={() => navigate("/dashboard")}
                className="flex items-center gap-3 p-4 w-full text-left"
              >
                <Heart className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1">Wishlist</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
              <button
                onClick={() => navigate("/dashboard")}
                className="flex items-center gap-3 p-4 w-full text-left"
              >
                <Settings className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1">Settings</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </button>
            </CardContent>
          </Card>

          {/* Sign Out */}
          <Button
            variant="outline"
            className="w-full text-destructive hover:text-destructive"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </PullToRefresh>
    </div>
  );
}
