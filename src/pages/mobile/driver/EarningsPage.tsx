import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MobileAppLayout } from "@/components/mobile/MobileAppLayout";
import { MobileHeader } from "@/components/mobile/MobileHeader";
import { PullToRefresh } from "@/components/mobile/PullToRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IndianRupee, TrendingUp, Package, Calendar } from "lucide-react";
import { format, startOfWeek, startOfMonth, subDays } from "date-fns";

interface EarningsData {
  today: number;
  week: number;
  month: number;
  total: number;
  todayDeliveries: number;
  weekDeliveries: number;
  monthDeliveries: number;
  totalDeliveries: number;
}

interface DeliveryRecord {
  id: string;
  delivered_at: string;
  order: {
    order_number: string;
    total_amount: number;
  };
}

export default function DriverEarningsPage() {
  const { user } = useAuth();
  const [earnings, setEarnings] = useState<EarningsData>({
    today: 0, week: 0, month: 0, total: 0,
    todayDeliveries: 0, weekDeliveries: 0, monthDeliveries: 0, totalDeliveries: 0,
  });
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEarnings = useCallback(async () => {
    if (!user) return;

    const { data: partner } = await supabase
      .from("delivery_partners")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!partner) return;
    setPartnerId(partner.id);

    const today = new Date();
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const monthStart = startOfMonth(today);

    const { data: assignments } = await supabase
      .from("order_assignments")
      .select("id, delivered_at, order_id")
      .eq("delivery_partner_id", partner.id)
      .eq("status", "delivered")
      .order("delivered_at", { ascending: false });

    if (assignments) {
      const orderIds = assignments.map(a => a.order_id);
      const { data: orders } = await supabase
        .from("orders")
        .select("id, order_number, total_amount")
        .in("id", orderIds);

      const ordersMap = new Map(orders?.map(o => [o.id, o]) || []);

      const enriched = assignments.map(a => ({
        ...a,
        order: ordersMap.get(a.order_id) || { order_number: "N/A", total_amount: 0 },
      }));

      // Calculate earnings (assuming ₹30 per delivery)
      const DELIVERY_FEE = 30;
      
      const todayDeliveries = enriched.filter(d => 
        d.delivered_at && new Date(d.delivered_at).toDateString() === today.toDateString()
      );
      const weekDeliveries = enriched.filter(d =>
        d.delivered_at && new Date(d.delivered_at) >= weekStart
      );
      const monthDeliveries = enriched.filter(d =>
        d.delivered_at && new Date(d.delivered_at) >= monthStart
      );

      setEarnings({
        today: todayDeliveries.length * DELIVERY_FEE,
        week: weekDeliveries.length * DELIVERY_FEE,
        month: monthDeliveries.length * DELIVERY_FEE,
        total: enriched.length * DELIVERY_FEE,
        todayDeliveries: todayDeliveries.length,
        weekDeliveries: weekDeliveries.length,
        monthDeliveries: monthDeliveries.length,
        totalDeliveries: enriched.length,
      });

      setDeliveries(enriched.slice(0, 50));
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  const { isPulling, isRefreshing, pullDistance, pullProgress, shouldTrigger, handlers } = usePullToRefresh({
    onRefresh: fetchEarnings,
  });

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader title="Earnings" showBack />
      
      <PullToRefresh
        isPulling={isPulling}
        isRefreshing={isRefreshing}
        pullDistance={pullDistance}
        pullProgress={pullProgress}
        shouldTrigger={shouldTrigger}
        handlers={handlers}
      >
        <div className="p-4 space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <IndianRupee className="h-4 w-4 opacity-80" />
                  <span className="text-sm opacity-80">Today</span>
                </div>
                <p className="text-2xl font-bold">₹{earnings.today}</p>
                <p className="text-xs opacity-80 mt-1">
                  {earnings.todayDeliveries} deliveries
                </p>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 opacity-80" />
                  <span className="text-sm opacity-80">This Week</span>
                </div>
                <p className="text-2xl font-bold">₹{earnings.week}</p>
                <p className="text-xs opacity-80 mt-1">
                  {earnings.weekDeliveries} deliveries
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">This Month</span>
                </div>
                <p className="text-2xl font-bold">₹{earnings.month}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {earnings.monthDeliveries} deliveries
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">All Time</span>
                </div>
                <p className="text-2xl font-bold">₹{earnings.total}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {earnings.totalDeliveries} deliveries
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Delivery History */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Delivery History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="animate-pulse flex justify-between">
                      <div className="h-4 bg-muted rounded w-1/3" />
                      <div className="h-4 bg-muted rounded w-1/4" />
                    </div>
                  ))}
                </div>
              ) : deliveries.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <p>No deliveries yet</p>
                </div>
              ) : (
                <div className="divide-y max-h-[400px] overflow-y-auto">
                  {deliveries.map((delivery) => (
                    <div key={delivery.id} className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-medium">{delivery.order.order_number}</p>
                        <p className="text-sm text-muted-foreground">
                          {delivery.delivered_at && format(new Date(delivery.delivered_at), "MMM d, h:mm a")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-600">+₹30</p>
                        <p className="text-xs text-muted-foreground">
                          Order: ₹{delivery.order.total_amount.toFixed(0)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PullToRefresh>
    </div>
  );
}
