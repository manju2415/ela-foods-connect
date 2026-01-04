import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { 
  TrendingUp, 
  ShoppingCart, 
  Users, 
  IndianRupee,
  Package,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82CA9D"];

export default function Analytics() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: async () => {
      const today = new Date();
      const last30Days = subDays(today, 30);
      const last7Days = subDays(today, 7);

      // Get orders for last 30 days
      const { data: orders } = await supabase
        .from("orders")
        .select("id, total_amount, status, created_at")
        .gte("created_at", last30Days.toISOString())
        .order("created_at", { ascending: true });

      // Get user count
      const { count: totalUsers } = await supabase
        .from("profiles")
        .select("id", { count: "exact" });

      // Get new users in last 7 days
      const { count: newUsers } = await supabase
        .from("profiles")
        .select("id", { count: "exact" })
        .gte("created_at", last7Days.toISOString());

      // Get product count
      const { count: totalProducts } = await supabase
        .from("products")
        .select("id", { count: "exact" });

      // Get low stock products
      const { count: lowStockCount } = await supabase
        .from("products")
        .select("id", { count: "exact" })
        .lt("stock_quantity", 10)
        .eq("is_active", true);

      // Calculate daily revenue
      const dailyRevenue = new Map<string, number>();
      orders?.forEach(order => {
        const date = format(new Date(order.created_at), "MMM d");
        dailyRevenue.set(date, (dailyRevenue.get(date) || 0) + Number(order.total_amount));
      });

      const revenueData = Array.from(dailyRevenue.entries()).map(([date, amount]) => ({
        date,
        revenue: amount,
      }));

      // Order status distribution
      const statusCounts = new Map<string, number>();
      orders?.forEach(order => {
        statusCounts.set(order.status, (statusCounts.get(order.status) || 0) + 1);
      });

      const statusData = Array.from(statusCounts.entries()).map(([status, count]) => ({
        name: status.charAt(0).toUpperCase() + status.slice(1),
        value: count,
      }));

      // Calculate totals
      const totalRevenue = orders?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;
      const totalOrders = orders?.length || 0;
      const completedOrders = orders?.filter(o => o.status === "delivered").length || 0;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      return {
        totalRevenue,
        totalOrders,
        completedOrders,
        avgOrderValue,
        totalUsers: totalUsers || 0,
        newUsers: newUsers || 0,
        totalProducts: totalProducts || 0,
        lowStockCount: lowStockCount || 0,
        revenueData,
        statusData,
      };
    },
  });

  const statCards = [
    {
      title: "Total Revenue",
      value: `₹${stats?.totalRevenue.toLocaleString() || 0}`,
      change: "+12.5%",
      trend: "up",
      icon: IndianRupee,
    },
    {
      title: "Total Orders",
      value: stats?.totalOrders || 0,
      change: "+8.2%",
      trend: "up",
      icon: ShoppingCart,
    },
    {
      title: "Total Users",
      value: stats?.totalUsers || 0,
      change: `+${stats?.newUsers || 0} this week`,
      trend: "up",
      icon: Users,
    },
    {
      title: "Avg Order Value",
      value: `₹${stats?.avgOrderValue.toFixed(2) || 0}`,
      change: "+3.1%",
      trend: "up",
      icon: TrendingUp,
    },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">Sales reports and platform metrics</p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="flex items-center text-xs text-muted-foreground">
                  {stat.trend === "up" ? (
                    <ArrowUpRight className="h-4 w-4 text-green-500" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 text-red-500" />
                  )}
                  <span className={stat.trend === "up" ? "text-green-500" : "text-red-500"}>
                    {stat.change}
                  </span>
                  <span className="ml-1">from last month</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Revenue Trend</CardTitle>
              <CardDescription>Daily revenue for the last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats?.revenueData || []}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                        tickFormatter={(value) => `₹${value}`}
                      />
                      <Tooltip 
                        formatter={(value: number) => [`₹${value.toFixed(2)}`, "Revenue"]}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Order Status Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Order Status Distribution</CardTitle>
              <CardDescription>Current order status breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                {isLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats?.statusData || []}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        outerRadius={100}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {stats?.statusData?.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Inventory Alert */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Inventory Status
                </CardTitle>
                <CardDescription>Products requiring attention</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted">
                <p className="text-sm text-muted-foreground">Total Products</p>
                <p className="text-2xl font-bold">{stats?.totalProducts || 0}</p>
              </div>
              <div className="p-4 rounded-lg bg-yellow-100 dark:bg-yellow-900/20">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">Low Stock (&lt;10)</p>
                <p className="text-2xl font-bold text-yellow-800 dark:text-yellow-200">
                  {stats?.lowStockCount || 0}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-green-100 dark:bg-green-900/20">
                <p className="text-sm text-green-800 dark:text-green-200">Delivered Orders</p>
                <p className="text-2xl font-bold text-green-800 dark:text-green-200">
                  {stats?.completedOrders || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
