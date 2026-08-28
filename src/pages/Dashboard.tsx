import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useWishlist } from "@/contexts/WishlistContext";
import { useCart } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AddressManager from "@/components/AddressManager";
import { OrderStatusTimeline } from "@/components/OrderStatusTimeline";
import { UserTreeView } from "@/components/dashboard/UserTreeView";
import { NetworkTreeVisual } from "@/components/dashboard/NetworkTreeVisual";
import { SplitWalletView } from "@/components/dashboard/SplitWalletView";
import { ReferralSection } from "@/components/dashboard/ReferralSection";
import { WithdrawalSection } from "@/components/dashboard/WithdrawalSection";
import { AddUserDialog } from "@/components/AddUserDialog";
import { ReturnRequestDialog } from "@/components/ReturnRequestDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { User, Package, Wallet, Settings, Copy, Gift, Eye, Truck, CheckCircle, Clock, XCircle, Heart, ShoppingCart, Trash2, MapPin, UserPlus, RotateCcw, Store, ArrowRight } from "lucide-react";
import CartSheet from "@/components/CartSheet";
import { useUserRole } from "@/hooks/useUserRole";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_account_holder: string | null;
}

interface WalletData {
  id: string;
  balance: number;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  total_amount: number;
  subtotal: number;
  shipping_amount: number | null;
  discount_amount: number | null;
  wallet_amount_used?: number | null;
  shipping_address: {
    full_name?: string;
    phone?: string;
    address_line1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  };
  created_at: string;
}

interface OrderItem {
  id: string;
  product_name: string;
  product_price: number;
  quantity: number;
  total_price: number;
}

interface ReferralCode {
  code: string;
  usage_count: number;
  max_uses: number | null;
  is_active: boolean;
}

interface ReferralStats {
  total_referrals: number;
  total_earnings: number;
}

interface WishlistProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price: number | null;
  images: string[];
  stock_quantity: number;
}

interface DashboardProps {
  hideChrome?: boolean;
}

const Dashboard = ({ hideChrome = false }: DashboardProps) => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isSuperAdmin, isAdmin, isMLMAdmin, loading: roleLoading } = useUserRole();
  const { wishlistItems, toggleWishlist, loading: wishlistLoading } = useWishlist();
  const { addToCart, totalItems } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { isLoading: onboardingLoading, isFullyOnboarded, isProfileComplete, isPaymentComplete, isDeliveryPartner } = useOnboardingStatus(user?.id);
  
  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [referralCodes, setReferralCodes] = useState<ReferralCode[]>([]);
  const [isFoundingMember, setIsFoundingMember] = useState(false);
  const [referralStats, setReferralStats] = useState<ReferralStats>({ total_referrals: 0, total_earnings: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [wishlistProducts, setWishlistProducts] = useState<WishlistProduct[]>([]);
  const [loadingWishlistProducts, setLoadingWishlistProducts] = useState(false);
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    bank_name: "",
    bank_account_number: "",
    bank_ifsc: "",
    bank_account_holder: "",
  });

  useEffect(() => {
    if (roleLoading) return;

    if (isSuperAdmin) {
      navigate("/admin", { replace: true });
      return;
    }

    if (isMLMAdmin) {
      navigate("/mlm-admin", { replace: true });
      return;
    }

    if (isAdmin) {
      navigate("/admin/products", { replace: true });
    }
  }, [isAdmin, isMLMAdmin, isSuperAdmin, navigate, roleLoading]);

  useEffect(() => {
    if (authLoading || onboardingLoading) return;
    
    if (!user) {
      navigate("/auth");
      return;
    }

    if (isSuperAdmin || isMLMAdmin || isAdmin) {
      return;
    }
    
    // Redirect users who haven't completed registration
    if (!isFullyOnboarded && !isDeliveryPartner) {
      if (!isProfileComplete) {
        navigate("/complete-registration", { replace: true });
        return;
      }
      if (!isPaymentComplete) {
        navigate("/registration-payment", { replace: true });
        return;
      }
    }
    
    fetchData();
  }, [user, authLoading, onboardingLoading, isProfileComplete, isPaymentComplete, isDeliveryPartner, isFullyOnboarded, navigate, isSuperAdmin, isMLMAdmin, isAdmin]);

  useEffect(() => {
    if (wishlistItems.length > 0) {
      fetchWishlistProducts();
    } else {
      setWishlistProducts([]);
    }
  }, [wishlistItems]);

  const fetchWishlistProducts = async () => {
    const productIds = wishlistItems.map((item) => item.product_id);
    if (productIds.length === 0) return;

    setLoadingWishlistProducts(true);
    const { data } = await supabase
      .from("products")
      .select("id, name, slug, price, compare_at_price, images, stock_quantity")
      .in("id", productIds);
    
    if (data) {
      setWishlistProducts(data);
    }
    setLoadingWishlistProducts(false);
  };

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
        bank_name: profileRes.data.bank_name || "",
        bank_account_number: profileRes.data.bank_account_number || "",
        bank_ifsc: profileRes.data.bank_ifsc || "",
        bank_account_holder: profileRes.data.bank_account_holder || "",
      });
    }
    
    if (walletRes.data) {
      setWallet(walletRes.data);
    }
    
    if (ordersRes.data) {
      setOrders(ordersRes.data.map(order => ({
        ...order,
        shipping_address: order.shipping_address as Order["shipping_address"]
      })));
    }
    
    if (referralRes.data) {
      setReferralCodes(referralRes.data);
    }
    
    setIsFoundingMember(!!foundingRes.data);

    // Fetch referral stats for founding members
    if (foundingRes.data) {
      const { data: referrals } = await supabase
        .from("referrals")
        .select("incentive_amount")
        .eq("referrer_id", user.id);
      
      if (referrals) {
        setReferralStats({
          total_referrals: referrals.length,
          total_earnings: referrals.reduce((sum, r) => sum + (Number(r.incentive_amount) || 0), 0),
        });
      }
    }

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
        bank_name: formData.bank_name,
        bank_account_number: formData.bank_account_number,
        bank_ifsc: formData.bank_ifsc,
        bank_account_holder: formData.bank_account_holder,
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

  const viewOrderDetails = async (order: Order) => {
    setSelectedOrder(order);
    setLoadingItems(true);
    const { data } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order.id);
    setOrderItems(data || []);
    setLoadingItems(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
      case "confirmed":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "processing":
        return "bg-purple-500/10 text-purple-600 border-purple-500/20";
      case "shipped":
        return "bg-indigo-500/10 text-indigo-600 border-indigo-500/20";
      case "out_for_delivery":
        return "bg-cyan-500/10 text-cyan-600 border-cyan-500/20";
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
      {!hideChrome && <Header />}
      
      <main className={`container mx-auto px-4 ${hideChrome ? 'py-4 pb-20' : 'py-8'}`}>
        <div className="mb-6 sm:mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground truncate">My Dashboard</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              Manage your account, orders, and wallet, or browse products
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <Button
              onClick={() => navigate("/products")}
              className="gap-2 w-full sm:flex-1 sm:w-auto min-w-[9rem] md:flex-none"
            >
              <Store className="h-4 w-4 shrink-0" />
              <span className="truncate">Browse Products</span>
            </Button>
            {!isDeliveryPartner && (
              <AddUserDialog
                onUserAdded={fetchData}
                trigger={
                  <Button variant="outline" className="flex-1 min-w-[7rem] md:flex-none">
                    <UserPlus className="h-4 w-4 mr-2 shrink-0" />
                    <span className="truncate">Add User</span>
                  </Button>
                }
              />
            )}
            <Button
              variant="outline"
              size="icon"
              className="relative shrink-0"
              aria-label="Open cart"
              onClick={() => setIsCartOpen(true)}
            >
              <ShoppingCart className="h-4 w-4" />
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                  {totalItems > 99 ? "99+" : totalItems}
                </span>
              )}
            </Button>
          </div>
        </div>


        <Tabs defaultValue="overview" className="space-y-6">
          <div className="overflow-x-auto -mx-4 px-4 pb-2">
            <TabsList className="inline-flex w-max gap-1">
              <TabsTrigger value="overview" className="gap-2 px-3">
                <User className="h-4 w-4 hidden sm:block" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="orders" className="gap-2 px-3">
                <Package className="h-4 w-4 hidden sm:block" />
                Orders
              </TabsTrigger>
              <TabsTrigger value="network" className="gap-2 px-3">
                <Gift className="h-4 w-4 hidden sm:block" />
                Network
              </TabsTrigger>
              <TabsTrigger value="wishlist" className="gap-2 px-3">
                <Heart className="h-4 w-4 hidden sm:block" />
                Wishlist
              </TabsTrigger>
              <TabsTrigger value="addresses" className="gap-2 px-3">
                <MapPin className="h-4 w-4 hidden sm:block" />
                Addresses
              </TabsTrigger>
              <TabsTrigger value="wallet" className="gap-2 px-3">
                <Wallet className="h-4 w-4 hidden sm:block" />
                Wallet
              </TabsTrigger>
              <TabsTrigger value="settings" className="gap-2 px-3">
                <Settings className="h-4 w-4 hidden sm:block" />
                Settings
              </TabsTrigger>
            </TabsList>
          </div>

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

            {/* Founding Member Dashboard */}
            {isFoundingMember && (
              <div className="space-y-6">
                {/* Referral Stats */}
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-primary">{referralStats.total_referrals}</div>
                      <p className="text-sm text-muted-foreground">People joined using your codes</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold text-green-600">₹{referralStats.total_earnings.toFixed(2)}</div>
                      <p className="text-sm text-muted-foreground">Credited to your wallet</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Referral Codes */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Gift className="h-5 w-5" />
                      Your Referral Codes
                    </CardTitle>
                    <CardDescription>
                      Share these codes with friends to earn ₹50 for each signup
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                      </div>
                    ) : referralCodes.length === 0 ? (
                      <p className="text-muted-foreground">No referral codes available. Contact support to get one.</p>
                    ) : (
                      <div className="space-y-3">
                        {referralCodes.map((code) => (
                          <div
                            key={code.code}
                            className="flex items-center justify-between p-4 rounded-lg bg-muted"
                          >
                            <div>
                              <span className="font-mono font-semibold text-xl">{code.code}</span>
                              <p className="text-sm text-muted-foreground">
                                {code.usage_count} referrals {code.max_uses && `(max ${code.max_uses})`}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              onClick={() => copyReferralCode(code.code)}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Copy
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
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
                <CardDescription>View all your past orders and track their status</CardDescription>
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
                        className="p-4 rounded-lg border hover:border-primary/50 transition-colors"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <p className="font-semibold text-lg">{order.order_number}</p>
                            <p className="text-sm text-muted-foreground">
                              Placed on {new Date(order.created_at).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              })}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge className={getStatusColor(order.status)}>
                              {order.status.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                            </Badge>
                            <p className="font-bold text-lg">₹{Number(order.total_amount).toFixed(2)}</p>
                            <Button variant="outline" size="sm" onClick={() => viewOrderDetails(order)}>
                              <Eye className="h-4 w-4 mr-1" /> View
                            </Button>
                          </div>
                        </div>
                        
                        {/* Order Status Timeline */}
                        <div className="mt-4 pt-4 border-t">
                          <div className="flex items-center justify-between text-xs">
                            <div className={`flex flex-col items-center gap-1 ${["pending", "confirmed", "processing", "shipped", "out_for_delivery", "delivered"].includes(order.status) ? "text-primary" : "text-muted-foreground"}`}>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${["pending", "confirmed", "processing", "shipped", "out_for_delivery", "delivered"].includes(order.status) ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                                <Clock className="h-4 w-4" />
                              </div>
                              <span>Placed</span>
                            </div>
                            <div className="flex-1 h-0.5 bg-muted mx-2">
                              <div className={`h-full ${["confirmed", "processing", "shipped", "out_for_delivery", "delivered"].includes(order.status) ? "bg-primary" : ""}`} style={{ width: ["confirmed", "processing", "shipped", "out_for_delivery", "delivered"].includes(order.status) ? "100%" : "0%" }} />
                            </div>
                            <div className={`flex flex-col items-center gap-1 ${["confirmed", "processing", "shipped", "out_for_delivery", "delivered"].includes(order.status) ? "text-primary" : "text-muted-foreground"}`}>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${["confirmed", "processing", "shipped", "out_for_delivery", "delivered"].includes(order.status) ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                                <CheckCircle className="h-4 w-4" />
                              </div>
                              <span>Confirmed</span>
                            </div>
                            <div className="flex-1 h-0.5 bg-muted mx-2">
                              <div className={`h-full ${["shipped", "out_for_delivery", "delivered"].includes(order.status) ? "bg-primary" : ""}`} style={{ width: ["shipped", "out_for_delivery", "delivered"].includes(order.status) ? "100%" : "0%" }} />
                            </div>
                            <div className={`flex flex-col items-center gap-1 ${["shipped", "out_for_delivery", "delivered"].includes(order.status) ? "text-primary" : "text-muted-foreground"}`}>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${["shipped", "out_for_delivery", "delivered"].includes(order.status) ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                                <Truck className="h-4 w-4" />
                              </div>
                              <span>Shipped</span>
                            </div>
                            <div className="flex-1 h-0.5 bg-muted mx-2">
                              <div className={`h-full ${order.status === "delivered" ? "bg-primary" : ""}`} style={{ width: order.status === "delivered" ? "100%" : "0%" }} />
                            </div>
                            <div className={`flex flex-col items-center gap-1 ${order.status === "delivered" ? "text-primary" : "text-muted-foreground"}`}>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${order.status === "delivered" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                                <Package className="h-4 w-4" />
                              </div>
                              <span>Delivered</span>
                            </div>
                          </div>
                          {order.status === "cancelled" && (
                            <div className="mt-3 flex items-center gap-2 text-destructive">
                              <XCircle className="h-4 w-4" />
                              <span className="text-sm">This order has been cancelled</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Wishlist Tab */}
          <TabsContent value="wishlist">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="h-5 w-5" />
                  My Wishlist
                </CardTitle>
                <CardDescription>Products you've saved for later</CardDescription>
              </CardHeader>
              <CardContent>
                {wishlistLoading || loadingWishlistProducts ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-48 w-full" />
                    ))}
                  </div>
                ) : wishlistProducts.length === 0 ? (
                  <div className="text-center py-12">
                    <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">Your wishlist is empty</h3>
                    <p className="text-muted-foreground mb-4">
                      Save items you love by clicking the heart icon on products
                    </p>
                    <Button onClick={() => navigate("/products")}>Browse Products</Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {wishlistProducts.map((product) => (
                      <div
                        key={product.id}
                        className="border rounded-lg overflow-hidden hover:border-primary/50 transition-colors"
                      >
                        <Link to={`/product/${product.slug}`}>
                          <div className="aspect-square bg-muted">
                            <img
                              src={product.images?.[0] || "/placeholder.svg"}
                              alt={product.name}
                              className="w-full h-full object-cover hover:scale-105 transition-transform"
                            />
                          </div>
                        </Link>
                        <div className="p-4">
                          <Link to={`/product/${product.slug}`}>
                            <h3 className="font-medium hover:text-primary transition-colors line-clamp-2 mb-2">
                              {product.name}
                            </h3>
                          </Link>
                          <div className="flex items-baseline gap-2 mb-3">
                            <span className="font-bold text-lg">₹{Number(product.price).toFixed(2)}</span>
                            {product.compare_at_price && (
                              <span className="text-sm text-muted-foreground line-through">
                                ₹{Number(product.compare_at_price).toFixed(2)}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="flex-1"
                              onClick={() => {
                                addToCart(product.id);
                                toast({
                                  title: "Added to cart",
                                  description: `${product.name} has been added to your cart.`,
                                });
                              }}
                              disabled={product.stock_quantity === 0}
                            >
                              <ShoppingCart className="h-4 w-4 mr-1" />
                              {product.stock_quantity === 0 ? "Out of Stock" : "Add to Cart"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleWishlist(product.id)}
                              className="text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Addresses Tab */}
          <TabsContent value="addresses">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  My Addresses
                </CardTitle>
                <CardDescription>Manage your saved shipping addresses</CardDescription>
              </CardHeader>
              <CardContent>
                <AddressManager />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Wallet Tab */}
          <TabsContent value="wallet" className="space-y-6">
            <SplitWalletView userId={user.id} />
            <WithdrawalSection userId={user.id} />
          </TabsContent>

          {/* Network Tab (Referrals & Downline) */}
          <TabsContent value="network" className="space-y-6">
            <ReferralSection userId={user.id} />
            <NetworkTreeVisual userId={user.id} />
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
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
                  </>
                )}
              </CardContent>
            </Card>

            {/* Bank Details Card */}
            <Card>
              <CardHeader>
                <CardTitle>Bank Details</CardTitle>
                <CardDescription>Required for withdrawing your referral earnings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {loading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="bank_name">Bank Name</Label>
                        <Input
                          id="bank_name"
                          value={formData.bank_name}
                          onChange={(e) =>
                            setFormData({ ...formData, bank_name: e.target.value })
                          }
                          placeholder="e.g., State Bank of India"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="bank_ifsc">IFSC Code</Label>
                        <Input
                          id="bank_ifsc"
                          value={formData.bank_ifsc}
                          onChange={(e) =>
                            setFormData({ ...formData, bank_ifsc: e.target.value.toUpperCase() })
                          }
                          placeholder="e.g., SBIN0001234"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="bank_account_holder">Account Holder Name</Label>
                      <Input
                        id="bank_account_holder"
                        value={formData.bank_account_holder}
                        onChange={(e) =>
                          setFormData({ ...formData, bank_account_holder: e.target.value })
                        }
                        placeholder="Name as per bank account"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="bank_account_number">Account Number</Label>
                      <Input
                        id="bank_account_number"
                        value={formData.bank_account_number}
                        onChange={(e) =>
                          setFormData({ ...formData, bank_account_number: e.target.value })
                        }
                        placeholder="Your bank account number"
                      />
                    </div>

                    <Button onClick={handleSaveProfile} disabled={saving}>
                      {saving ? "Saving..." : "Save All Changes"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Details - {selectedOrder?.order_number}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              {/* Order Status */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Order Status</p>
                  <Badge className={getStatusColor(selectedOrder.status)}>
                    {selectedOrder.status.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Payment Status</p>
                  <Badge variant={selectedOrder.payment_status === "completed" ? "default" : "secondary"}>
                    {selectedOrder.payment_status.replace(/\b\w/g, l => l.toUpperCase())}
                  </Badge>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Order Date</p>
                  <p className="font-medium">
                    {new Date(selectedOrder.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Shipping Address */}
              <div>
                <h4 className="font-semibold mb-2">Shipping Address</h4>
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">{selectedOrder.shipping_address?.full_name}</p>
                  <p>{selectedOrder.shipping_address?.address_line1}</p>
                  <p>{selectedOrder.shipping_address?.city}, {selectedOrder.shipping_address?.state} - {selectedOrder.shipping_address?.postal_code}</p>
                  <p>{selectedOrder.shipping_address?.phone}</p>
                </div>
              </div>

              <Separator />

              {/* Order Items */}
              <div>
                <h4 className="font-semibold mb-2">Order Items</h4>
                {loadingItems ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.product_name}</TableCell>
                          <TableCell className="text-right">₹{Number(item.product_price).toFixed(2)}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">₹{Number(item.total_price).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              <Separator />

              {/* Order Summary */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>₹{Number(selectedOrder.subtotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Shipping</span>
                  <span>₹{Number(selectedOrder.shipping_amount || 0).toFixed(2)}</span>
                </div>
                {selectedOrder.discount_amount && selectedOrder.discount_amount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Discount</span>
                    <span>-₹{Number(selectedOrder.discount_amount).toFixed(2)}</span>
                  </div>
                )}
                {Number(selectedOrder.wallet_amount_used || 0) > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Paid from wallet</span>
                    <span>-₹{Number(selectedOrder.wallet_amount_used).toFixed(2)}</span>
                  </div>
                )}

                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span>₹{Number(selectedOrder.total_amount).toFixed(2)}</span>
                </div>
              </div>

              {/* Return Request Button - only show for delivered orders */}
              {selectedOrder.status === "delivered" && (
                <div className="pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => setIsReturnDialogOpen(true)}
                    className="w-full"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Request Return/Exchange
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>



      {/* Return Request Dialog */}
      {selectedOrder && (
        <ReturnRequestDialog
          open={isReturnDialogOpen}
          onOpenChange={setIsReturnDialogOpen}
          orderId={selectedOrder.id}
          orderNumber={selectedOrder.order_number}
          orderItems={orderItems.map(item => ({
            id: item.id,
            product_name: item.product_name,
            quantity: item.quantity,
            product_price: item.product_price,
          }))}
          onSuccess={fetchData}
        />
      )}

      {!hideChrome && <Footer />}
    </div>
  );
};

export default Dashboard;
