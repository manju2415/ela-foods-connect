import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { User, Package, Wallet, Settings, Copy, Gift } from "lucide-react";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}

interface WalletData {
  id: string;
  balance: number;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  created_at: string;
}

interface ReferralCode {
  code: string;
  usage_count: number;
  max_uses: number | null;
  is_active: boolean;
}

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [referralCodes, setReferralCodes] = useState<ReferralCode[]>([]);
  const [isFoundingMember, setIsFoundingMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
  });

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    fetchData();
  }, [user, navigate]);

  const fetchData = async () => {
    if (!user) return;
    
    setLoading(true);
    
    // Fetch profile, wallet, orders, referral codes, and founding member status in parallel
    const [profileRes, walletRes, ordersRes, referralRes, foundingRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("wallets").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
      supabase.from("referral_codes").select("*").eq("user_id", user.id),
      supabase.rpc("is_founding_member", { _user_id: user.id }),
    ]);

    if (profileRes.data) {
      setProfile(profileRes.data);
      setFormData({
        full_name: profileRes.data.full_name || "",
        phone: profileRes.data.phone || "",
      });
    }
    
    if (walletRes.data) {
      setWallet(walletRes.data);
    }
    
    if (ordersRes.data) {
      setOrders(ordersRes.data);
    }
    
    if (referralRes.data) {
      setReferralCodes(referralRes.data);
    }
    
    setIsFoundingMember(!!foundingRes.data);
    setLoading(false);
  };

  const handleSaveProfile = async () => {
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
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Profile updated successfully!",
      });
      fetchData();
    }
    setSaving(false);
  };

  const copyReferralCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: "Copied!",
      description: "Referral code copied to clipboard.",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
      case "confirmed":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "shipped":
        return "bg-purple-500/10 text-purple-600 border-purple-500/20";
      case "delivered":
        return "bg-green-500/10 text-green-600 border-green-500/20";
      case "cancelled":
        return "bg-red-500/10 text-red-600 border-red-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">My Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage your account, orders, and wallet
          </p>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="overview" className="gap-2">
              <User className="h-4 w-4 hidden sm:block" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2">
              <Package className="h-4 w-4 hidden sm:block" />
              Orders
            </TabsTrigger>
            <TabsTrigger value="wallet" className="gap-2">
              <Wallet className="h-4 w-4 hidden sm:block" />
              Wallet
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4 hidden sm:block" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {/* Wallet Balance Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Wallet Balance</CardTitle>
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <div className="text-2xl font-bold text-primary">
                      ₹{wallet?.balance?.toFixed(2) || "0.00"}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Total Orders Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                  <Package className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold">{orders.length}</div>
                  )}
                </CardContent>
              </Card>

              {/* Member Status Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Member Status</CardTitle>
                  <Gift className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-8 w-32" />
                  ) : (
                    <Badge variant={isFoundingMember ? "default" : "secondary"} className="text-sm">
                      {isFoundingMember ? "Founding Member" : "Member"}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Referral Codes Section (for Founding Members) */}
            {isFoundingMember && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gift className="h-5 w-5" />
                    Your Referral Codes
                  </CardTitle>
                  <CardDescription>
                    Share these codes with friends to earn rewards
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-12 w-full" />
                    </div>
                  ) : referralCodes.length === 0 ? (
                    <p className="text-muted-foreground">No referral codes available.</p>
                  ) : (
                    <div className="space-y-3">
                      {referralCodes.map((code) => (
                        <div
                          key={code.code}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted"
                        >
                          <div>
                            <span className="font-mono font-semibold text-lg">{code.code}</span>
                            <p className="text-sm text-muted-foreground">
                              Used: {code.usage_count} / {code.max_uses || "∞"}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyReferralCode(code.code)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Recent Orders */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Orders</CardTitle>
                <CardDescription>Your latest order activity</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : orders.length === 0 ? (
                  <div className="text-center py-8">
                    <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No orders yet</p>
                    <Button className="mt-4" onClick={() => navigate("/products")}>
                      Start Shopping
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orders.slice(0, 5).map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between p-4 rounded-lg border"
                      >
                        <div>
                          <p className="font-medium">{order.order_number}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(order.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">₹{order.total_amount}</p>
                          <Badge className={getStatusColor(order.status)}>
                            {order.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders">
            <Card>
              <CardHeader>
                <CardTitle>Order History</CardTitle>
                <CardDescription>View all your past orders</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : orders.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Start shopping to see your orders here
                    </p>
                    <Button onClick={() => navigate("/products")}>Browse Products</Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {orders.map((order) => (
                      <div
                        key={order.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border gap-4"
                      >
                        <div className="space-y-1">
                          <p className="font-semibold">{order.order_number}</p>
                          <p className="text-sm text-muted-foreground">
                            Placed on {new Date(order.created_at).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge className={getStatusColor(order.status)}>
                            {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                          </Badge>
                          <p className="font-bold text-lg">₹{order.total_amount}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Wallet Tab */}
          <TabsContent value="wallet">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Wallet Balance</CardTitle>
                  <CardDescription>Your available balance for purchases</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-16 w-32" />
                  ) : (
                    <div className="text-4xl font-bold text-primary">
                      ₹{wallet?.balance?.toFixed(2) || "0.00"}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Earn More</CardTitle>
                  <CardDescription>Ways to add money to your wallet</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Gift className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">Refer Friends</p>
                      <p className="text-sm text-muted-foreground">
                        Earn wallet credits when friends sign up with your referral code
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Package className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium">Order Rewards</p>
                      <p className="text-sm text-muted-foreground">
                        Get cashback on orders during promotional periods
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Profile Settings</CardTitle>
                <CardDescription>Update your personal information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {loading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={profile?.email || ""}
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">
                        Email cannot be changed
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="full_name">Full Name</Label>
                      <Input
                        id="full_name"
                        value={formData.full_name}
                        onChange={(e) =>
                          setFormData({ ...formData, full_name: e.target.value })
                        }
                        placeholder="Enter your full name"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) =>
                          setFormData({ ...formData, phone: e.target.value })
                        }
                        placeholder="Enter your phone number"
                      />
                    </div>

                    <Button onClick={handleSaveProfile} disabled={saving}>
                      {saving ? "Saving..." : "Save Changes"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Footer />
    </div>
  );
};

export default Dashboard;
