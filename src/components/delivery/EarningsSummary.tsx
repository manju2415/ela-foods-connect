import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IndianRupee, TrendingUp, Calendar, Package } from "lucide-react";
import { format, startOfWeek, startOfMonth, startOfYear, subDays } from "date-fns";

interface EarningsSummaryProps {
  partnerId: string;
}

interface DailyEarnings {
  date: string;
  deliveries: number;
  amount: number;
}

export default function EarningsSummary({ partnerId }: EarningsSummaryProps) {
  const { data: earningsData, isLoading } = useQuery({
    queryKey: ["delivery-earnings", partnerId],
    queryFn: async () => {
      // Get all completed assignments for this partner
      const { data: assignments, error } = await supabase
        .from("order_assignments")
        .select(`
          id,
          delivered_at,
          order:orders!order_assignments_order_id_fkey(
            total_amount
          )
        `)
        .eq("delivery_partner_id", partnerId)
        .eq("status", "delivered")
        .not("delivered_at", "is", null);

      if (error) throw error;

      // Fetch delivery commission rate from platform settings
      const { data: commissionSetting } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "delivery_commission")
        .maybeSingle();
      
      const commissionValue = commissionSetting?.value as { percentage?: number } | null;
      const COMMISSION_RATE = commissionValue?.percentage
        ? commissionValue.percentage / 100
        : 0.05;
      const now = new Date();
      const weekStart = startOfWeek(now);
      const monthStart = startOfMonth(now);
      const yearStart = startOfYear(now);
      const last30Days = subDays(now, 30);

      let todayEarnings = 0;
      let todayDeliveries = 0;
      let weekEarnings = 0;
      let weekDeliveries = 0;
      let monthEarnings = 0;
      let monthDeliveries = 0;
      let totalEarnings = 0;
      let totalDeliveries = 0;

      const dailyMap = new Map<string, DailyEarnings>();

      assignments?.forEach((assignment) => {
        const deliveredAt = new Date(assignment.delivered_at);
        const orderAmount = assignment.order?.total_amount || 0;
        const commission = orderAmount * COMMISSION_RATE;

        totalEarnings += commission;
        totalDeliveries += 1;

        // Today
        if (deliveredAt.toDateString() === now.toDateString()) {
          todayEarnings += commission;
          todayDeliveries += 1;
        }

        // This week
        if (deliveredAt >= weekStart) {
          weekEarnings += commission;
          weekDeliveries += 1;
        }

        // This month
        if (deliveredAt >= monthStart) {
          monthEarnings += commission;
          monthDeliveries += 1;
        }

        // Daily breakdown for last 30 days
        if (deliveredAt >= last30Days) {
          const dateKey = format(deliveredAt, "yyyy-MM-dd");
          const existing = dailyMap.get(dateKey) || { date: dateKey, deliveries: 0, amount: 0 };
          existing.deliveries += 1;
          existing.amount += commission;
          dailyMap.set(dateKey, existing);
        }
      });

      return {
        today: { earnings: todayEarnings, deliveries: todayDeliveries },
        week: { earnings: weekEarnings, deliveries: weekDeliveries },
        month: { earnings: monthEarnings, deliveries: monthDeliveries },
        total: { earnings: totalEarnings, deliveries: totalDeliveries },
        daily: Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date)),
      };
    },
    enabled: !!partnerId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <IndianRupee className="h-3 w-3" />
              Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">₹{earningsData?.today.earnings.toFixed(2) || '0.00'}</p>
            <p className="text-xs text-muted-foreground">{earningsData?.today.deliveries || 0} deliveries</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">₹{earningsData?.week.earnings.toFixed(2) || '0.00'}</p>
            <p className="text-xs text-muted-foreground">{earningsData?.week.deliveries || 0} deliveries</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">₹{earningsData?.month.earnings.toFixed(2) || '0.00'}</p>
            <p className="text-xs text-muted-foreground">{earningsData?.month.deliveries || 0} deliveries</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Package className="h-3 w-3" />
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">₹{earningsData?.total.earnings.toFixed(2) || '0.00'}</p>
            <p className="text-xs text-muted-foreground">{earningsData?.total.deliveries || 0} deliveries</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent Earnings History</CardTitle>
        </CardHeader>
        <CardContent>
          {!earningsData?.daily.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">No earnings history yet</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {earningsData.daily.map((day) => (
                <div key={day.date} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium text-sm">{format(new Date(day.date), "MMM d, yyyy")}</p>
                    <p className="text-xs text-muted-foreground">{day.deliveries} deliveries</p>
                  </div>
                  <p className="font-semibold text-green-600">₹{day.amount.toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
