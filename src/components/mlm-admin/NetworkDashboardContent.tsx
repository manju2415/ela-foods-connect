import { useEffect, useState } from "react";
import { Banknote, Crown, Network, Star, Ticket, UserCheck, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface NetworkDashboardStats {
  totalMembers: number;
  founders: number;
  masters: number;
  associates: number;
  totalReferrals: number;
  referralCodes: number;
  totalWalletBalance: number;
  pendingWithdrawals: number;
}

export function NetworkDashboardContent() {
  const [stats, setStats] = useState<NetworkDashboardStats>({
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
      // Scoped RPC (SECURITY DEFINER, gated by is_any_admin — covers
      // mlm_admin as well as admin/super_admin) rather than direct table
      // reads: those are RLS-restricted to admin/super_admin, which left
      // this dashboard showing near-zero numbers for a pure mlm_admin.
      const { data, error } = await supabase.rpc("get_network_admin_stats");
      if (error || !data || (data as { error?: string }).error) return;

      const result = data as {
        total_users: number;
        founders: number;
        masters: number;
        associates: number;
        total_referrals: number;
        referral_codes: number;
        total_wallet_balance: number;
        pending_withdrawals: number;
      };

      setStats({
        totalMembers: result.total_users,
        founders: result.founders,
        masters: result.masters,
        associates: result.associates,
        totalReferrals: result.total_referrals,
        referralCodes: result.referral_codes,
        totalWalletBalance: Number(result.total_wallet_balance) || 0,
        pendingWithdrawals: result.pending_withdrawals,
      });
    };

    fetchStats();
  }, []);

  const statCards = [
    { title: "Total Members", value: stats.totalMembers, icon: Users },
    { title: "Founders", value: stats.founders, icon: Crown },
    { title: "Masters", value: stats.masters, icon: Star },
    { title: "Associates", value: stats.associates, icon: UserCheck },
    { title: "Total Referrals", value: stats.totalReferrals, icon: Network },
    { title: "Referral Codes", value: stats.referralCodes, icon: Ticket },
    { title: "Total Wallet Balance", value: `₹${stats.totalWalletBalance.toFixed(2)}`, icon: Banknote },
    { title: "Pending Withdrawals", value: stats.pendingWithdrawals, icon: Banknote },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Network Admin</h2>
        <p className="text-muted-foreground">MLM network overview and performance</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <stat.icon className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}