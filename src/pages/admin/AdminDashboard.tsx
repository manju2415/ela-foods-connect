import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, ShoppingCart, FolderTree, IndianRupee } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Stats {
  categories: number;
  products: number;
  orders: number;
  revenue: number;
}

const AdminDashboard = () => {
  const [stats, setStats] = useState<Stats>({
    categories: 0,
    products: 0,
    orders: 0,
    revenue: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      const [categoriesRes, productsRes, ordersRes, revenueRes] = await Promise.all([
        supabase.from("categories").select("id", { count: "exact" }).eq("is_active", true),
        supabase.from("products").select("id", { count: "exact" }),
        supabase.from("orders").select("id", { count: "exact" }),
        supabase.from("orders").select("total_amount").eq("status", "delivered"),
      ]);

      const totalRevenue = (revenueRes.data || []).reduce((sum, o) => sum + Number(o.total_amount), 0);

      setStats({
        categories: categoriesRes.count || 0,
        products: productsRes.count || 0,
        orders: ordersRes.count || 0,
        revenue: totalRevenue,
      });
    };

    fetchStats();
  }, []);

  const statCards = [
    { title: "Founding Members", value: stats.foundingMembers, icon: Users, color: "text-primary" },
    { title: "Referral Codes", value: stats.referralCodes, icon: Ticket, color: "text-secondary" },
    { title: "Products", value: stats.products, icon: Package, color: "text-accent" },
    { title: "Orders", value: stats.orders, icon: ShoppingCart, color: "text-green-600" },
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-muted-foreground">Overview of your platform</p>
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

export default AdminDashboard;
