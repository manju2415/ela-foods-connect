import { memberLevelLabel } from "@/lib/memberLevel";
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
    registration_fee_paid: number | null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, open]);

  const fetchUserData = async () => {
    if (!userId) return;

    setLoading(true);

    // Scoped RPC (SECURITY DEFINER, gated by is_any_admin — covers
    // mlm_admin as well as admin/super_admin) rather than direct table
    // reads: those are RLS-restricted to admin/super_admin, which left
    // this viewer showing "User not found" for a pure mlm_admin.
    const { data, error } = await supabase.rpc("get_user_dashboard_details", { p_user_id: userId });

    if (!error && data && !("error" in (data as object))) {
      const result = data as unknown as {
        profile: UserProfile | null;
        wallet: UserWallet | null;
        orders: UserOrder[];
        referrals: Referral[];
        referrer_name: string | null;
      };
      setProfile(result.profile);
      setWallet(result.wallet);
      setOrders(result.orders || []);
      setReferrals(result.referrals || []);
      setReferrerName(result.referrer_name);
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
                          {memberLevelLabel(profile.user_level, profile.registration_fee_paid)}
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
                        Referrals ({referrals.length})
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
                                  {memberLevelLabel(ref.referred_profile.user_level, ref.referred_profile.registration_fee_paid)}
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
