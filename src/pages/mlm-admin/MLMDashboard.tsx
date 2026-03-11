import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Ticket, Network, Banknote, Crown, Star, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MLMStats {
  totalMembers: number;
  founders: number;
  masters: number;
  associates: number;
  totalReferrals: number;
  referralCodes: number;
  totalWalletBalance: number;
  pendingWithdrawals: number;
}

const MLMDashboard = () => {
  const [stats, setStats] = useState<MLMStats>({
    totalMembers: 0,
    founders: 0,
    masters: 0,
    associates: 0,
    totalReferrals: 0,
    referralCodes: 0,
    totalWalletBalance: 0,
    pendingWithdrawals: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      const [profilesRes, referralsRes, codesRes, walletsRes, withdrawalsRes] = await Promise.all([
        supabase.from("profiles").select("user_level"),
        supabase.from("referrals").select("id", { count: "exact" }),
        supabase.from("referral_codes").select("id", { count: "exact" }),
        supabase.from("wallets").select("balance"),
        supabase.from("withdrawal_requests").select("id", { count: "exact" }).eq("status", "pending"),
      ]);

      const profiles = profilesRes.data || [];
      const founders = profiles.filter(p => p.user_level === "founder").length;
      const masters = profiles.filter(p => p.user_level === "master").length;
      const associates = profiles.filter(p => p.user_level === "associate").length;
      const totalBalance = (walletsRes.data || []).reduce((sum, w) => sum + (Number(w.balance) || 0), 0);

      setStats({
        totalMembers: profiles.length,
        founders,
        masters,
        associates,
        totalReferrals: referralsRes.count || 0,
        referralCodes: codesRes.count || 0,
        totalWalletBalance: totalBalance,
        pendingWithdrawals: withdrawalsRes.count || 0,
      });
    };

    fetchStats();
  }, []);

  const statCards = [
    { title: "Total Members", value: stats.totalMembers, icon: Users, color: "text-primary" },
    { title: "Founders", value: stats.founders, icon: Crown, color: "text-yellow-600" },
    { title: "Masters", value: stats.masters, icon: Star, color: "text-purple-600" },
    { title: "Associates", value: stats.associates, icon: UserCheck, color: "text-blue-600" },
    { title: "Total Referrals", value: stats.totalReferrals, icon: Network, color: "text-green-600" },
    { title: "Referral Codes", value: stats.referralCodes, icon: Ticket, color: "text-secondary" },
    { title: "Total Wallet Balance", value: `₹${stats.totalWalletBalance.toFixed(2)}`, icon: Banknote, color: "text-primary" },
    { title: "Pending Withdrawals", value: stats.pendingWithdrawals, icon: Banknote, color: "text-destructive" },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Network Dashboard</h2>
          <p className="text-muted-foreground">MLM network overview and performance</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
};

export default MLMDashboard;
