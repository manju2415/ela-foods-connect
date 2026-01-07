import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Users, TrendingUp, Wallet, Network, Crown, Star, UserCheck } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

interface NetworkStats {
  totalUsers: number;
  founders: number;
  masters: number;
  associates: number;
  totalReferrals: number;
  totalWalletBalance: number;
  totalWithdrawable: number;
  totalPurchaseOnly: number;
  registrationFeesCollected: number;
}

interface TopReferrer {
  id: string;
  full_name: string | null;
  email: string;
  referral_count: number;
  user_level: string;
}

const NetworkAnalytics = () => {
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [topReferrers, setTopReferrers] = useState<TopReferrer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);

    // Fetch profiles for user level stats
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_level, referral_count, registration_fee_paid");

    // Fetch wallets for balance stats
    const { data: wallets } = await supabase
      .from("wallets")
      .select("balance, withdrawable_balance, purchase_only_balance");

    // Fetch referrals count
    const { count: referralCount } = await supabase
      .from("referrals")
      .select("id", { count: "exact" });

    // Fetch top referrers
    const { data: topReferrersData } = await supabase
      .from("profiles")
      .select("id, full_name, email, referral_count, user_level")
      .gt("referral_count", 0)
      .order("referral_count", { ascending: false })
      .limit(10);

    if (profiles && wallets) {
      const founders = profiles.filter(p => p.user_level === "founder").length;
      const masters = profiles.filter(p => p.user_level === "master").length;
      const associates = profiles.filter(p => p.user_level === "associate").length;
      const registrationFees = profiles.reduce((sum, p) => sum + (Number(p.registration_fee_paid) || 0), 0);

      const totalBalance = wallets.reduce((sum, w) => sum + (Number(w.balance) || 0), 0);
      const totalWithdrawable = wallets.reduce((sum, w) => sum + (Number(w.withdrawable_balance) || 0), 0);
      const totalPurchaseOnly = wallets.reduce((sum, w) => sum + (Number(w.purchase_only_balance) || 0), 0);

      setStats({
        totalUsers: profiles.length,
        founders,
        masters,
        associates,
        totalReferrals: referralCount || 0,
        totalWalletBalance: totalBalance,
        totalWithdrawable,
        totalPurchaseOnly,
        registrationFeesCollected: registrationFees
      });
    }

    if (topReferrersData) {
      setTopReferrers(topReferrersData);
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  const userLevelData = stats ? [
    { name: "Founders", value: stats.founders, color: "#f59e0b" },
    { name: "Masters", value: stats.masters, color: "#8b5cf6" },
    { name: "Associates", value: stats.associates, color: "#3b82f6" }
  ] : [];

  const walletData = stats ? [
    { name: "Withdrawable", value: stats.totalWithdrawable },
    { name: "Purchase Only", value: stats.totalPurchaseOnly }
  ] : [];

  const getLevelIcon = (level: string) => {
    switch (level) {
      case "founder": return <Crown className="h-4 w-4 text-yellow-500" />;
      case "master": return <Star className="h-4 w-4 text-purple-500" />;
      default: return <UserCheck className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Network Analytics</h2>
          <p className="text-muted-foreground">MLM network performance and statistics</p>
        </div>

        {/* Overview Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
              <p className="text-xs text-muted-foreground">
                {stats?.founders} Founders • {stats?.masters} Masters • {stats?.associates} Associates
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
              <Network className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalReferrals || 0}</div>
              <p className="text-xs text-muted-foreground">Successful referrals made</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Wallet Balance</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">₹{(stats?.totalWalletBalance || 0).toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Across all users</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Registration Fees</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">₹{(stats?.registrationFeesCollected || 0).toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Total collected</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* User Level Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>User Level Distribution</CardTitle>
              <CardDescription>Breakdown by membership level</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={userLevelData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {userLevelData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Wallet Balance Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Wallet Balance Types</CardTitle>
              <CardDescription>Withdrawable vs Purchase-only balances</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={walletData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => `₹${value.toFixed(2)}`} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Referrers */}
        <Card>
          <CardHeader>
            <CardTitle>Top Referrers</CardTitle>
            <CardDescription>Users with most referrals</CardDescription>
          </CardHeader>
          <CardContent>
            {topReferrers.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No referrals yet</p>
            ) : (
              <div className="space-y-4">
                {topReferrers.map((referrer, index) => (
                  <div key={referrer.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-4">
                      <span className="text-lg font-bold text-muted-foreground w-6">#{index + 1}</span>
                      <div className="flex items-center gap-2">
                        {getLevelIcon(referrer.user_level || "associate")}
                        <div>
                          <p className="font-medium">{referrer.full_name || "N/A"}</p>
                          <p className="text-sm text-muted-foreground">{referrer.email}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-primary">{referrer.referral_count}</p>
                      <p className="text-xs text-muted-foreground">referrals</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default NetworkAnalytics;
