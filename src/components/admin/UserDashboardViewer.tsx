import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  User, Wallet, ShoppingBag, Users, Crown, Shield, UserCircle, 
  Calendar, Mail, Phone, Building2, CreditCard
} from "lucide-react";
import { format } from "date-fns";

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  user_level: string;
  referral_count: number;
  registration_fee_paid: number;
  created_at: string;
  referred_by: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_holder: string | null;
  bank_ifsc: string | null;
}

interface UserWallet {
  balance: number;
  withdrawable_balance: number;
  purchase_only_balance: number;
}

interface UserOrder {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  created_at: string;
}

interface Referral {
  id: string;
  created_at: string;
  referred_profile: {
    full_name: string | null;
    email: string;
    user_level: string;
  };
}

interface UserDashboardViewerProps {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const UserDashboardViewer = ({ userId, open, onOpenChange }: UserDashboardViewerProps) => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [wallet, setWallet] = useState<UserWallet | null>(null);
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [referrerName, setReferrerName] = useState<string | null>(null);

  useEffect(() => {
    if (userId && open) {
      fetchUserData();
    }
  }, [userId, open]);

  const fetchUserData = async () => {
    if (!userId) return;
    
    setLoading(true);

    const [profileRes, walletRes, ordersRes, referralsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("wallets").select("balance, withdrawable_balance, purchase_only_balance").eq("user_id", userId).maybeSingle(),
      supabase.from("orders").select("id, order_number, status, total_amount, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
      supabase.from("referrals").select("id, created_at, referred_id").eq("referrer_id", userId).order("created_at", { ascending: false }).limit(20)
    ]);

    if (profileRes.data) {
      setProfile(profileRes.data);
      
      // Fetch referrer name if exists
      if (profileRes.data.referred_by) {
        const { data: referrer } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", profileRes.data.referred_by)
          .maybeSingle();
        
        if (referrer) {
          setReferrerName(referrer.full_name || referrer.email);
        }
      }
    }

    if (walletRes.data) {
      setWallet(walletRes.data);
    }

    if (ordersRes.data) {
      setOrders(ordersRes.data);
    }

    // Fetch referred users' profiles
    if (referralsRes.data && referralsRes.data.length > 0) {
      const referredIds = referralsRes.data.map(r => r.referred_id);
      const { data: referredProfiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, user_level")
        .in("id", referredIds);
      
      const referralsWithProfiles = referralsRes.data.map(r => ({
        ...r,
        referred_profile: referredProfiles?.find(p => p.id === r.referred_id) || {
          full_name: null,
          email: "Unknown",
          user_level: "associate"
        }
      }));
      
      setReferrals(referralsWithProfiles);
    } else {
      setReferrals([]);
    }

    setLoading(false);
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case "founder":
        return <Crown className="h-5 w-5 text-amber-500" />;
      case "master":
        return <Shield className="h-5 w-5 text-blue-500" />;
      default:
        return <UserCircle className="h-5 w-5 text-green-500" />;
    }
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case "founder":
        return "bg-amber-500/10 text-amber-700 border-amber-500/20";
      case "master":
        return "bg-blue-500/10 text-blue-700 border-blue-500/20";
      default:
        return "bg-green-500/10 text-green-700 border-green-500/20";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "delivered":
        return "bg-green-500/10 text-green-700";
      case "cancelled":
        return "bg-destructive/10 text-destructive";
      case "processing":
        return "bg-blue-500/10 text-blue-700";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            User Dashboard
          </DialogTitle>
          <DialogDescription>
            Viewing details for {profile?.full_name || profile?.email || "user"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 p-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : profile ? (
          <ScrollArea className="flex-1 overflow-auto">
            <div className="space-y-6 p-1">
              {/* Profile Header */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      {getLevelIcon(profile.user_level)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-xl font-semibold">{profile.full_name || "Unnamed User"}</h3>
                        <Badge className={getLevelColor(profile.user_level)}>
                          {profile.user_level}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          {profile.email}
                        </div>
                        {profile.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            {profile.phone}
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          Joined {format(new Date(profile.created_at), "PPP")}
                        </div>
                        {referrerName && (
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Referred by: {referrerName}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="wallet" className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="wallet">Wallet</TabsTrigger>
                  <TabsTrigger value="orders">Orders</TabsTrigger>
                  <TabsTrigger value="referrals">Referrals</TabsTrigger>
                  <TabsTrigger value="bank">Bank Details</TabsTrigger>
                </TabsList>

                <TabsContent value="wallet" className="mt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Wallet className="h-4 w-4" />
                          Total Balance
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-primary">
                          ₹{(wallet?.balance || 0).toFixed(2)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Withdrawable</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-green-600">
                          ₹{(wallet?.withdrawable_balance || 0).toFixed(2)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Purchase Only</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-blue-600">
                          ₹{(wallet?.purchase_only_balance || 0).toFixed(2)}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                  <Card className="mt-4">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Registration Fee Paid</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl font-bold">₹{(profile.registration_fee_paid || 0).toFixed(2)}</p>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="orders" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ShoppingBag className="h-5 w-5" />
                        Recent Orders
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {orders.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">No orders yet</p>
                      ) : (
                        <div className="space-y-3">
                          {orders.map(order => (
                            <div key={order.id} className="flex items-center justify-between p-3 border rounded-lg">
                              <div>
                                <p className="font-medium">#{order.order_number}</p>
                                <p className="text-sm text-muted-foreground">
                                  {format(new Date(order.created_at), "PPp")}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <Badge className={getStatusColor(order.status)}>
                                  {order.status}
                                </Badge>
                                <p className="font-semibold">₹{order.total_amount.toFixed(2)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="referrals" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Referrals ({profile.referral_count})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {referrals.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">No referrals yet</p>
                      ) : (
                        <div className="space-y-3">
                          {referrals.map(ref => (
                            <div key={ref.id} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                  {getLevelIcon(ref.referred_profile.user_level)}
                                </div>
                                <div>
                                  <p className="font-medium">{ref.referred_profile.full_name || "Unnamed"}</p>
                                  <p className="text-sm text-muted-foreground">{ref.referred_profile.email}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={getLevelColor(ref.referred_profile.user_level)}>
                                  {ref.referred_profile.user_level}
                                </Badge>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(ref.created_at), "PP")}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="bank" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        Bank Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!profile.bank_name && !profile.bank_account_number ? (
                        <p className="text-muted-foreground text-center py-8">No bank details added</p>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm text-muted-foreground">Bank Name</p>
                              <p className="font-medium">{profile.bank_name || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Account Holder</p>
                              <p className="font-medium">{profile.bank_account_holder || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Account Number</p>
                              <p className="font-medium flex items-center gap-2">
                                <CreditCard className="h-4 w-4" />
                                {profile.bank_account_number || "N/A"}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">IFSC Code</p>
                              <p className="font-medium">{profile.bank_ifsc || "N/A"}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </ScrollArea>
        ) : (
          <p className="text-center text-muted-foreground py-8">User not found</p>
        )}
      </DialogContent>
    </Dialog>
  );
};
