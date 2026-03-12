import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { PullToRefresh } from "@/components/mobile/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Phone, Truck, LogOut, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface Profile {
  full_name: string | null;
  email: string;
  phone: string | null;
}

interface Partner {
  id: string;
  is_available: boolean;
  vehicle_type: string | null;
  vehicle_number: string | null;
}

export default function DriverProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    
    const [profileRes, partnerRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, email, phone")
        .eq("id", user.id)
        .single(),
      supabase
        .from("delivery_partners")
        .select("id, is_available, vehicle_type, vehicle_number")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    
    if (profileRes.data) setProfile(profileRes.data);
    if (partnerRes.data) setPartner(partnerRes.data);
    
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const { isPulling, isRefreshing, pullDistance, pullProgress, shouldTrigger, handlers } = usePullToRefresh({
    onRefresh: fetchData,
  });

  const toggleAvailability = async (available: boolean) => {
    if (!partner) return;
    
    setUpdating(true);
    const { error } = await supabase
      .from("delivery_partners")
      .update({ is_available: available })
      .eq("id", partner.id);

    if (error) {
      toast.error("Failed to update availability");
    } else {
      setPartner(prev => prev ? { ...prev, is_available: available } : null);
      toast.success(available ? "You're now online" : "You're now offline");
    }
    setUpdating(false);
  };

  const handleSignOut = async () => {
    // Go offline before signing out
    if (partner?.is_available) {
      await supabase
        .from("delivery_partners")
        .update({ is_available: false })
        .eq("id", partner.id);
    }
    await signOut();
    navigate("/driver-app");
  };

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    }
    return "D";
  };

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
            <CardContent className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-green-600 text-white text-xl">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold truncate">
                      {profile?.full_name || "Driver"}
                    </h2>
                    {partner?.is_available && (
                      <Badge className="bg-green-100 text-green-800">Online</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {profile?.email}
                  </p>
                </div>
              </div>

              {/* Availability Toggle */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${partner?.is_available ? "bg-green-500" : "bg-muted-foreground"}`} />
                  <Label htmlFor="availability" className="font-medium">
                    {partner?.is_available ? "Available for deliveries" : "Not taking orders"}
                  </Label>
                </div>
                <Switch
                  id="availability"
                  checked={partner?.is_available || false}
                  onCheckedChange={toggleAvailability}
                  disabled={updating}
                />
              </div>
            </CardContent>
          </Card>

          {/* Details */}
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
              <div className="flex items-center gap-3 p-4">
                <Truck className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground">Vehicle</p>
                  <p className="font-medium">
                    {partner?.vehicle_type || "Not specified"}
                    {partner?.vehicle_number && ` • ${partner.vehicle_number}`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Partner Status
              </h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>✓ Verified Partner</span>
                <span>•</span>
                <span>Active</span>
              </div>
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
